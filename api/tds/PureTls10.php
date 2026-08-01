<?php
/**
 * 纯 PHP 实现的 TLS 1.0 客户端（不依赖 stream_socket_enable_crypto / OpenSSL 流）
 *
 * 用途：SQL Server TDS 加密（MS-TDS PRELOGIN 封装握手，之后应用数据直传）。
 * 动机：PHP ext/openssl 强制 BEAST 空分片，SQL Server 2008 R2 Schannel 无法解密 LOGIN7。
 * 本实现自行组 TLS 记录，不做 empty-fragment / 1/n-1 拆包。
 *
 * 密码学原语（PHP 5.5 兼容）：
 * - RSA PKCS#1 v1.5：优先 openssl_public_encrypt（扩展 openssl，非 stream crypto）；
 *   否则 gmp / bcmath 纯大数
 * - AES-128-CBC：openssl_encrypt / mcrypt / 纯 PHP AES
 * - HMAC-SHA1 / MD5 / SHA1：hash 扩展（PHP 核心）
 *
 * 注意：WAMP 常出现 CLI 启用了 gmp、Apache php.ini 未启用 → Web 报「需要 gmp」。
 * 有 openssl 时不强制 gmp/bcmath。
 */
if (!defined('SQLMNGER_PURE_TLS10')) {
	define('SQLMNGER_PURE_TLS10', 1);

	class SqlmngerPureTls10 {
		const VER_MAJOR = 0x03;
		const VER_MINOR = 0x01; // TLS 1.0

		const CT_CCS = 20;
		const CT_ALERT = 21;
		const CT_HS = 22;
		const CT_APP = 23;

		const HS_CLIENT_HELLO = 1;
		const HS_SERVER_HELLO = 2;
		const HS_CERTIFICATE = 11;
		const HS_SERVER_HELLO_DONE = 14;
		const HS_CLIENT_KEY_EXCHANGE = 16;
		const HS_FINISHED = 20;

		// TLS_RSA_WITH_AES_128_CBC_SHA
		const CS_RSA_AES128_SHA = 0x002F;

		/** @var string */
		public $lastError = null;

		/** @var bool */
		private $ready = false;

		/** @var string client_random 32B */
		private $clientRandom = '';
		/** @var string server_random 32B */
		private $serverRandom = '';
		/** @var string */
		private $masterSecret = '';

		/** @var string */
		private $clientMac = '';
		/** @var string */
		private $serverMac = '';
		/** @var string */
		private $clientKey = '';
		/** @var string */
		private $serverKey = '';
		/** @var string 写侧 CBC IV（上一条密文尾块 / 初始 IV） */
		private $clientIv = '';
		/** @var string 读侧 CBC IV */
		private $serverIv = '';

		/** @var string 握手报文累计（Finished 用） */
		private $hsMessages = '';

		/** @var string 读侧未解包 TLS 缓冲 */
		private $inBuf = '';
		/** @var string 解密后应用数据 */
		private $appBuf = '';

		/** @var string 8 字节大端序号 */
		private $seqWrite = "\x00\x00\x00\x00\x00\x00\x00\x00";
		/** @var string */
		private $seqRead = "\x00\x00\x00\x00\x00\x00\x00\x00";

		/** @var bool 写侧已启用加密 */
		private $writeEnc = false;
		/** @var bool 读侧已启用加密 */
		private $readEnc = false;

		/**
		 * 在已完成 PRELOGIN 的 TCP 上做 TLS1.0 握手。
		 * $writeRaw(string $tlsBytes): bool  — 握手期调用方封装 PRELOGIN
		 * $readRaw(int $max): string|false  — 从 net 读；调用方解 PRELOGIN 后把 TLS 字节喂进来也行
		 *
		 * 简化接口：由本类通过回调读写「TLS 记录字节」（不含 TDS 头）。
		 *
		 * @param callable $sendTls function($bin):bool
		 * @param callable $recvTls function($needTimeoutSec):string  可读到任意长度 TLS 字节
		 * @param int $timeoutSec
		 * @return bool
		 */
		public function handshake($sendTls, $recvTls, $timeoutSec = 8) {
			$this->lastError = null;
			$this->ready = false;
			$this->hsMessages = '';
			$this->inBuf = '';
			$this->appBuf = '';
			$this->writeEnc = false;
			$this->readEnc = false;
			$this->seqWrite = "\x00\x00\x00\x00\x00\x00\x00\x00";
			$this->seqRead = "\x00\x00\x00\x00\x00\x00\x00\x00";

			if (!is_callable($sendTls) || !is_callable($recvTls)) {
				$this->lastError = 'PureTLS：send/recv 回调无效';
				return false;
			}
			if (!function_exists('hash_hmac') || !function_exists('hash')) {
				$this->lastError = 'PureTLS：需要 hash / hash_hmac';
				return false;
			}
			// RSA：openssl 或 gmp/bcmath 任一即可（Apache 与 CLI 的 php.ini 可能不一致）
			$hasOsslRsa = function_exists('openssl_public_encrypt')
				&& function_exists('openssl_pkey_get_public');
			$hasPureRsa = function_exists('gmp_init') || function_exists('bcmul');
			if (!$hasOsslRsa && !$hasPureRsa) {
				$this->lastError = 'PureTLS：需要 openssl（推荐）或 gmp/bcmath 做 RSA；'
					. '请在 Apache 使用的 php.ini 中启用 extension=php_openssl.dll'
					. ' 或 php_gmp.dll / php_bcmath.dll 后重启服务';
				return false;
			}

			// --- ClientHello ---
			$this->clientRandom = pack('N', time()) . $this->randomBytes(28);
			$ch = $this->buildClientHello();
			$this->hsMessages .= $ch;
			$rec = $this->buildRecord(self::CT_HS, $ch, false);
			if (!$sendTls($rec)) {
				$this->lastError = 'PureTLS：发送 ClientHello 失败';
				return false;
			}

			// --- 读到 ServerHelloDone ---
			$deadline = microtime(true) + max(1, intval($timeoutSec));
			$gotSH = false;
			$gotCert = false;
			$gotSHD = false;
			$serverCertDer = null;

			while (microtime(true) < $deadline && !$gotSHD) {
				$chunk = $recvTls(0.5);
				if ($chunk === false) {
					// 短暂无数据：继续到总 deadline，勿立即失败
					continue;
				}
				if ($chunk === '' || $chunk === null) {
					continue;
				}
				$this->inBuf .= $chunk;

				while (true) {
					$recParsed = $this->popRecord(false);
					if ($recParsed === null) {
						break;
					}
					if ($recParsed === false) {
						return false;
					}
					list($ctype, $payload) = $recParsed;
					if ($ctype === self::CT_ALERT) {
						$this->lastError = 'PureTLS：服务器 Alert ' . bin2hex($payload);
						return false;
					}
					if ($ctype !== self::CT_HS) {
						$this->lastError = 'PureTLS：握手期意外类型 ' . $ctype;
						return false;
					}
					// 一条 record 可含多条 handshake
					$p = 0;
					$plen = strlen($payload);
					while ($p + 4 <= $plen) {
						$ht = ord($payload[$p]);
						$hl = (ord($payload[$p + 1]) << 16) | (ord($payload[$p + 2]) << 8) | ord($payload[$p + 3]);
						if ($p + 4 + $hl > $plen) {
							$this->lastError = 'PureTLS：握手消息截断';
							return false;
						}
						$hbody = substr($payload, $p + 4, $hl);
						$hmsg = substr($payload, $p, 4 + $hl);
						$this->hsMessages .= $hmsg;
						$p += 4 + $hl;

						if ($ht === self::HS_SERVER_HELLO) {
							if (!$this->parseServerHello($hbody)) {
								return false;
							}
							$gotSH = true;
						} elseif ($ht === self::HS_CERTIFICATE) {
							$serverCertDer = $this->parseCertificateListFirst($hbody);
							if ($serverCertDer === false || $serverCertDer === null) {
								return false;
							}
							$gotCert = true;
						} elseif ($ht === self::HS_SERVER_HELLO_DONE) {
							$gotSHD = true;
						}
						// 忽略其它
					}
				}
			}

			if (!$gotSH || !$gotCert || !$gotSHD) {
				$this->lastError = 'PureTLS：未收齐 ServerHello/Certificate/HelloDone'
					. " (SH=$gotSH CERT=$gotCert SHD=$gotSHD)";
				return false;
			}

			// --- ClientKeyExchange + CCS + Finished ---
			// 重要：三者必须在同一趟写出（同一 PRELOGIN 负载 / 同一次 send），
			// SQL Server Schannel 若先只收到 CKE 再等后续，常会直接掐连接（表现为间歇性
			// 「未完成服务器 CCS/Finished」+ EOF）。
			$premaster = chr(self::VER_MAJOR) . chr(self::VER_MINOR) . $this->randomBytes(46);
			// 优先用证书 + openssl RSA；无 openssl 时再解析公钥走 gmp/bcmath
			$encPm = false;
			if ($hasOsslRsa) {
				$encPm = $this->rsaPkcs1Encrypt($premaster, null, null, $serverCertDer);
			}
			if ($encPm === false && $hasPureRsa) {
				$pub = $this->rsaPublicFromCertDer($serverCertDer);
				if ($pub === false) {
					return false;
				}
				$encPm = $this->rsaPkcs1Encrypt($premaster, $pub['n'], $pub['e'], null);
			}
			if ($encPm === false) {
				if ($this->lastError === null || $this->lastError === '') {
					$this->lastError = 'PureTLS：RSA 加密 premaster 失败';
				}
				return false;
			}
			// ClientKeyExchange: 2 字节长度 + 密文（TLS）
			$ckBody = pack('n', strlen($encPm)) . $encPm;
			$ck = $this->hsHeader(self::HS_CLIENT_KEY_EXCHANGE, $ckBody);
			$this->hsMessages .= $ck;

			$this->masterSecret = $this->prf($premaster, 'master secret', $this->clientRandom . $this->serverRandom, 48);
			$this->deriveKeys();

			$recCke = $this->buildRecord(self::CT_HS, $ck, false);
			$recCcs = $this->buildRecord(self::CT_CCS, "\x01", false);
			// CCS 之后写侧启用加密（Finished 用）
			$this->writeEnc = true;
			$this->seqWrite = "\x00\x00\x00\x00\x00\x00\x00\x00";

			// Finished
			$hsHash = hash('md5', $this->hsMessages, true) . hash('sha1', $this->hsMessages, true);
			$finBody = $this->prf($this->masterSecret, 'client finished', $hsHash, 12);
			$fin = $this->hsHeader(self::HS_FINISHED, $finBody);
			// Finished 本身要计入后续 server finished 校验，先写入累计再发送
			$this->hsMessages .= $fin;
			$recFin = $this->buildRecord(self::CT_HS, $fin, true);
			if ($recCke === false || $recCcs === false || $recFin === false) {
				$this->lastError = 'PureTLS：组装 ClientKeyExchange/CCS/Finished 失败';
				return false;
			}
			if (!$sendTls($recCke . $recCcs . $recFin)) {
				$this->lastError = 'PureTLS：发送 ClientKeyExchange/CCS/Finished 失败';
				return false;
			}

			// --- 读 Server CCS + Finished ---
			$gotSCcs = false;
			$gotSFin = false;
			while (microtime(true) < $deadline && !($gotSCcs && $gotSFin)) {
				$chunk = $recvTls(0.5);
				if ($chunk === false || $chunk === '' || $chunk === null) {
					continue;
				}
				$this->inBuf .= $chunk;
				while (true) {
					// CCS 明文；Finished 在 CCS 之后加密
					$recParsed = $this->popRecord($this->readEnc);
					if ($recParsed === null) {
						break;
					}
					if ($recParsed === false) {
						return false;
					}
					list($ctype, $payload) = $recParsed;
					if ($ctype === self::CT_ALERT) {
						$this->lastError = 'PureTLS：服务器 Alert ' . bin2hex($payload);
						return false;
					}
					if ($ctype === self::CT_CCS) {
						$this->readEnc = true;
						$this->seqRead = "\x00\x00\x00\x00\x00\x00\x00\x00";
						$gotSCcs = true;
						continue;
					}
					if ($ctype === self::CT_HS) {
						if (strlen($payload) < 4) {
							$this->lastError = 'PureTLS：Server Finished 过短';
							return false;
						}
						$ht = ord($payload[0]);
						$hl = (ord($payload[1]) << 16) | (ord($payload[2]) << 8) | ord($payload[3]);
						$body = substr($payload, 4, $hl);
						if ($ht !== self::HS_FINISHED || $hl < 12) {
							$this->lastError = 'PureTLS：期望 Server Finished，收到 type=' . $ht . ' len=' . $hl;
							return false;
						}
						$body = substr($body, 0, 12);
						// 校验：hsMessages 已含 client Finished，不含 server Finished
						$expHash = hash('md5', $this->hsMessages, true) . hash('sha1', $this->hsMessages, true);
						$expect = $this->prf($this->masterSecret, 'server finished', $expHash, 12);
						if ($body !== $expect) {
							$this->lastError = 'PureTLS：Server Finished 校验失败';
							return false;
						}
						$gotSFin = true;
					}
				}
			}

			if (!$gotSCcs || !$gotSFin) {
				$this->lastError = 'PureTLS：未完成服务器 CCS/Finished';
				return false;
			}

			$this->ready = true;
			return true;
		}

		/** @return bool */
		public function isReady() {
			return $this->ready;
		}

		/**
		 * 加密应用数据 → 一个或多个 TLS 记录（本实现每写一块一个记录，无空分片）
		 * @param string $plain
		 * @return string|false
		 */
		public function protect($plain) {
			if (!$this->ready) {
				$this->lastError = 'PureTLS：未握手';
				return false;
			}
			if ($plain === '' || $plain === null) {
				return '';
			}
			// 单记录发送（SQL Server 兼容关键：禁止 empty/1-n-1 拆分）
			return $this->buildRecord(self::CT_APP, $plain, true);
		}

		/**
		 * 喂入密文字节，取出可获应用明文
		 * @param string $cipherChunk
		 * @return string 可能为空（半包）
		 */
		public function unprotectFeed($cipherChunk) {
			if ($cipherChunk !== '' && $cipherChunk !== null) {
				$this->inBuf .= $cipherChunk;
			}
			$out = '';
			while (true) {
				$rec = $this->popRecord(true);
				if ($rec === null) {
					break;
				}
				if ($rec === false) {
					return false;
				}
				list($ctype, $payload) = $rec;
				if ($ctype === self::CT_ALERT) {
					$this->lastError = 'PureTLS：应用期 Alert ' . bin2hex($payload);
					return false;
				}
				if ($ctype === self::CT_APP) {
					$out .= $payload;
				}
			}
			return $out;
		}

		// ========== 记录层 ==========

		/**
		 * @param int $type
		 * @param string $payload 明文 fragment
		 * @param bool $encrypt
		 * @return string
		 */
		private function buildRecord($type, $payload, $encrypt) {
			if (!$encrypt) {
				$len = strlen($payload);
				return chr($type) . chr(self::VER_MAJOR) . chr(self::VER_MINOR)
					. chr(($len >> 8) & 0xFF) . chr($len & 0xFF) . $payload;
			}
			// TLS1.0 AES_128_CBC_SHA：MAC-then-Encrypt
			$seq = $this->seqWrite;
			$this->seqWrite = $this->incSeq($this->seqWrite);
			$macData = $seq . chr($type) . chr(self::VER_MAJOR) . chr(self::VER_MINOR)
				. pack('n', strlen($payload)) . $payload;
			$mac = hash_hmac('sha1', $macData, $this->clientMac, true);
			$frag = $payload . $mac;
			// PKCS#7 填充到 16 字节
			$padLen = 16 - (strlen($frag) % 16);
			if ($padLen === 0) {
				$padLen = 16;
			}
			$frag .= str_repeat(chr($padLen - 1), $padLen);
			$iv = $this->clientIv;
			$cipher = $this->aes128CbcEncrypt($frag, $this->clientKey, $iv);
			if ($cipher === false) {
				return false;
			}
			// TLS1.0：下一条 IV = 本条密文最后一块
			$this->clientIv = substr($cipher, -16);
			$clen = strlen($cipher);
			return chr($type) . chr(self::VER_MAJOR) . chr(self::VER_MINOR)
				. chr(($clen >> 8) & 0xFF) . chr($clen & 0xFF) . $cipher;
		}

		/**
		 * 从 inBuf 弹出一条记录并解密
		 * @param bool $encrypted 当前读状态是否加密
		 * @return array|null|false [type, payload] | null=半包 | false=错误
		 */
		private function popRecord($encrypted) {
			if (strlen($this->inBuf) < 5) {
				return null;
			}
			$type = ord($this->inBuf[0]);
			$ver = (ord($this->inBuf[1]) << 8) | ord($this->inBuf[2]);
			$len = (ord($this->inBuf[3]) << 8) | ord($this->inBuf[4]);
			if ($len > 18432) {
				$this->lastError = 'PureTLS：非法记录长度 ' . $len;
				return false;
			}
			if (strlen($this->inBuf) < 5 + $len) {
				return null;
			}
			$body = substr($this->inBuf, 5, $len);
			$this->inBuf = substr($this->inBuf, 5 + $len);

			if (!$encrypted) {
				return array($type, $body);
			}

			// 解密
			if (strlen($body) < 32 || (strlen($body) % 16) !== 0) {
				$this->lastError = 'PureTLS：密文长度非法';
				return false;
			}
			$iv = $this->serverIv;
			$plain = $this->aes128CbcDecrypt($body, $this->serverKey, $iv);
			if ($plain === false) {
				return false;
			}
			$this->serverIv = substr($body, -16);
			// 去填充
			$padByte = ord($plain[strlen($plain) - 1]);
			$padLen = $padByte + 1;
			if ($padLen > strlen($plain) || $padLen > 256) {
				$this->lastError = 'PureTLS：填充非法';
				return false;
			}
			$plain = substr($plain, 0, strlen($plain) - $padLen);
			if (strlen($plain) < 20) {
				$this->lastError = 'PureTLS：解密后无 MAC';
				return false;
			}
			$content = substr($plain, 0, -20);
			$mac = substr($plain, -20);
			$seq = $this->seqRead;
			$this->seqRead = $this->incSeq($this->seqRead);
			$macData = $seq . chr($type) . chr(self::VER_MAJOR) . chr(self::VER_MINOR)
				. pack('n', strlen($content)) . $content;
			$expect = hash_hmac('sha1', $macData, $this->serverMac, true);
			if ($mac !== $expect) {
				$this->lastError = 'PureTLS：MAC 校验失败';
				return false;
			}
			return array($type, $content);
		}

		// ========== 握手构建/解析 ==========

		private function buildClientHello() {
			// version + random + session_id_len0 + cipher_suites + compression
			$body = chr(self::VER_MAJOR) . chr(self::VER_MINOR);
			$body .= $this->clientRandom;
			$body .= chr(0); // session id empty
			// cipher suites: only AES128-SHA
			$cs = pack('n', self::CS_RSA_AES128_SHA);
			$body .= pack('n', 2) . $cs;
			$body .= chr(1) . chr(0); // compression null
			// no extensions (2008 R2 更稳)
			return $this->hsHeader(self::HS_CLIENT_HELLO, $body);
		}

		private function parseServerHello($body) {
			if (strlen($body) < 34) {
				$this->lastError = 'PureTLS：ServerHello 过短';
				return false;
			}
			// version 2 + random 32 + session_id
			$this->serverRandom = substr($body, 2, 32);
			$p = 34;
			$sidLen = ord($body[$p]);
			$p += 1 + $sidLen;
			if ($p + 3 > strlen($body)) {
				$this->lastError = 'PureTLS：ServerHello 截断';
				return false;
			}
			$cs = (ord($body[$p]) << 8) | ord($body[$p + 1]);
			if ($cs !== self::CS_RSA_AES128_SHA) {
				$this->lastError = 'PureTLS：不支持的 cipher 0x' . dechex($cs);
				return false;
			}
			return true;
		}

		private function parseCertificateListFirst($body) {
			if (strlen($body) < 3) {
				$this->lastError = 'PureTLS：Certificate 过短';
				return false;
			}
			// certs length 3 bytes
			$listLen = (ord($body[0]) << 16) | (ord($body[1]) << 8) | ord($body[2]);
			if (strlen($body) < 3 + $listLen || $listLen < 3) {
				$this->lastError = 'PureTLS：Certificate 列表非法';
				return false;
			}
			$cLen = (ord($body[3]) << 16) | (ord($body[4]) << 8) | ord($body[5]);
			if (strlen($body) < 6 + $cLen) {
				$this->lastError = 'PureTLS：首证书截断';
				return false;
			}
			return substr($body, 6, $cLen);
		}

		private function hsHeader($type, $body) {
			$n = strlen($body);
			return chr($type)
				. chr(($n >> 16) & 0xFF)
				. chr(($n >> 8) & 0xFF)
				. chr($n & 0xFF)
				. $body;
		}

		private function deriveKeys() {
			// AES_128_CBC_SHA: mac 20+20, key 16+16, iv 16+16 = 104
			$kb = $this->prf($this->masterSecret, 'key expansion', $this->serverRandom . $this->clientRandom, 104);
			$p = 0;
			$this->clientMac = substr($kb, $p, 20); $p += 20;
			$this->serverMac = substr($kb, $p, 20); $p += 20;
			$this->clientKey = substr($kb, $p, 16); $p += 16;
			$this->serverKey = substr($kb, $p, 16); $p += 16;
			$this->clientIv = substr($kb, $p, 16); $p += 16;
			$this->serverIv = substr($kb, $p, 16);
		}

		// ========== PRF / 随机 ==========

		private function prf($secret, $label, $seed, $outLen) {
			$ls = $label . $seed;
			$slen = strlen($secret);
			$half = (int)ceil($slen / 2.0);
			$s1 = substr($secret, 0, $half);
			$s2 = substr($secret, $slen - $half);
			$md5 = $this->pHash('md5', $s1, $ls, $outLen);
			$sha1 = $this->pHash('sha1', $s2, $ls, $outLen);
			$out = '';
			for ($i = 0; $i < $outLen; $i++) {
				$out .= chr(ord($md5[$i]) ^ ord($sha1[$i]));
			}
			return $out;
		}

		private function pHash($algo, $secret, $seed, $outLen) {
			$a = $seed;
			$out = '';
			while (strlen($out) < $outLen) {
				$a = hash_hmac($algo, $a, $secret, true);
				$out .= hash_hmac($algo, $a . $seed, $secret, true);
			}
			return substr($out, 0, $outLen);
		}

		private function randomBytes($n) {
			$n = intval($n);
			if ($n <= 0) {
				return '';
			}
			if (function_exists('openssl_random_pseudo_bytes')) {
				$b = @openssl_random_pseudo_bytes($n);
				if ($b !== false && strlen($b) === $n) {
					return $b;
				}
			}
			$out = '';
			for ($i = 0; $i < $n; $i++) {
				$out .= chr(mt_rand(0, 255));
			}
			return $out;
		}

		private function incSeq($seq8) {
			$bin = $seq8;
			for ($i = 7; $i >= 0; $i--) {
				$v = (ord($bin[$i]) + 1) & 0xFF;
				$bin[$i] = chr($v);
				if ($v !== 0) {
					break;
				}
			}
			return $bin;
		}

		// ========== RSA / X.509 ==========

		/**
		 * @param string $certDer
		 * @return array|false n,e 十进制字符串
		 */
		private function rsaPublicFromCertDer($certDer) {
			// 在证书 DER 中找 rsaEncryption OID 后的 BIT STRING 内的 RSAPublicKey
			// OID 1.2.840.113549.1.1.1 = 06 09 2A 86 48 86 F7 0D 01 01 01
			$oid = "\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01";
			$pos = strpos($certDer, $oid);
			if ($pos === false) {
				$this->lastError = 'PureTLS：证书中无 RSA OID';
				return false;
			}
			// 向后找 BIT STRING (0x03)
			$i = $pos + strlen($oid);
			$n = strlen($certDer);
			while ($i < $n && ord($certDer[$i]) !== 0x03) {
				$i++;
				if ($i - $pos > 64) {
					break;
				}
			}
			if ($i >= $n || ord($certDer[$i]) !== 0x03) {
				$this->lastError = 'PureTLS：未找到公钥 BIT STRING';
				return false;
			}
			$i++;
			$lenInfo = $this->asn1ReadLen($certDer, $i);
			if ($lenInfo === false) {
				return false;
			}
			list($blen, $i) = $lenInfo;
			// unused bits byte
			if ($i >= $n) {
				$this->lastError = 'PureTLS：BIT STRING 空';
				return false;
			}
			$i++; // skip unused bits
			// RSAPublicKey SEQUENCE
			if ($i >= $n || ord($certDer[$i]) !== 0x30) {
				$this->lastError = 'PureTLS：RSAPublicKey 非 SEQUENCE';
				return false;
			}
			$i++;
			$lenInfo = $this->asn1ReadLen($certDer, $i);
			if ($lenInfo === false) {
				return false;
			}
			list($seqLen, $i) = $lenInfo;
			// modulus INTEGER
			if (ord($certDer[$i]) !== 0x02) {
				$this->lastError = 'PureTLS：modulus 非 INTEGER';
				return false;
			}
			$i++;
			$lenInfo = $this->asn1ReadLen($certDer, $i);
			if ($lenInfo === false) {
				return false;
			}
			list($mlen, $i) = $lenInfo;
			$mod = substr($certDer, $i, $mlen);
			$i += $mlen;
			// exponent INTEGER
			if ($i >= $n || ord($certDer[$i]) !== 0x02) {
				$this->lastError = 'PureTLS：exponent 非 INTEGER';
				return false;
			}
			$i++;
			$lenInfo = $this->asn1ReadLen($certDer, $i);
			if ($lenInfo === false) {
				return false;
			}
			list($elen, $i) = $lenInfo;
			$exp = substr($certDer, $i, $elen);

			// 去前导 00
			if (strlen($mod) > 0 && ord($mod[0]) === 0) {
				$mod = substr($mod, 1);
			}
			return array(
				'n' => $this->binToDec($mod),
				'e' => $this->binToDec($exp),
				'k' => strlen($mod), // 模数字节数
			);
		}

		/**
		 * @param string $data
		 * @param int $i
		 * @return array|false [len, newPos]
		 */
		private function asn1ReadLen($data, $i) {
			if ($i >= strlen($data)) {
				$this->lastError = 'PureTLS：ASN.1 长度越界';
				return false;
			}
			$b = ord($data[$i]);
			$i++;
			if (($b & 0x80) === 0) {
				return array($b, $i);
			}
			$n = $b & 0x7F;
			if ($n <= 0 || $n > 4 || $i + $n > strlen($data)) {
				$this->lastError = 'PureTLS：ASN.1 长度非法';
				return false;
			}
			$len = 0;
			for ($j = 0; $j < $n; $j++) {
				$len = ($len << 8) | ord($data[$i]);
				$i++;
			}
			return array($len, $i);
		}

		/**
		 * PKCS#1 v1.5 RSA 加密（premaster）
		 * 优先 openssl_public_encrypt（若可用）；否则 gmp/bcmath 纯实现。
		 *
		 * @param string $msg
		 * @param string $nDec
		 * @param string $eDec
		 * @param string|null $certDer 可选：用于 openssl 路径
		 * @return string|false
		 */
		private function rsaPkcs1Encrypt($msg, $nDec, $eDec, $certDer = null) {
			// 1) openssl（仅非对称封装，不走 stream crypto / BEAST 空分片）
			//    PHP 5.5 可用；不依赖 gmp/bcmath（适配 Apache php.ini 未开 gmp 的常见环境）
			if ($certDer !== null && $certDer !== '' && function_exists('openssl_public_encrypt')
				&& function_exists('openssl_pkey_get_public')) {
				$pem = "-----BEGIN CERTIFICATE-----\n"
					. chunk_split(base64_encode($certDer), 64, "\n")
					. "-----END CERTIFICATE-----\n";
				$pubKey = @openssl_pkey_get_public($pem);
				if ($pubKey !== false) {
					$out = '';
					$pad = defined('OPENSSL_PKCS1_PADDING') ? OPENSSL_PKCS1_PADDING : 1;
					$ok = @openssl_public_encrypt($msg, $out, $pubKey, $pad);
					if (is_resource($pubKey) && function_exists('openssl_free_key')) {
						@openssl_free_key($pubKey);
					}
					if ($ok && $out !== '' && $out !== null && strlen($out) > 0) {
						return $out;
					}
				}
				// openssl 失败时若无 n/e 则无法纯算
				if ($nDec === null || $nDec === '' || $eDec === null || $eDec === '') {
					$this->lastError = 'PureTLS：openssl RSA 加密失败';
					return false;
				}
			}

			// 2) 纯 PHP RSA（需 gmp 或 bcmath）
			if (!function_exists('gmp_init') && !function_exists('bcmul')) {
				$this->lastError = 'PureTLS：纯 RSA 需要 gmp 或 bcmath';
				return false;
			}
			if ($nDec === null || $nDec === '' || $eDec === null || $eDec === '') {
				$this->lastError = 'PureTLS：缺少 RSA 公钥参数';
				return false;
			}
			// k = 模数长度
			$modHex = $this->decToHex($nDec);
			if (strlen($modHex) % 2) {
				$modHex = '0' . $modHex;
			}
			$k = (int)(strlen($modHex) / 2);
			$mLen = strlen($msg);
			if ($mLen > $k - 11) {
				$this->lastError = 'PureTLS：RSA 明文过长';
				return false;
			}
			$psLen = $k - $mLen - 3;
			$ps = '';
			while (strlen($ps) < $psLen) {
				$b = $this->randomBytes(1);
				if ($b !== "\x00") {
					$ps .= $b;
				}
			}
			$em = "\x00\x02" . $ps . "\x00" . $msg;
			$mDec = $this->binToDec($em);
			$cDec = $this->modPow($mDec, $eDec, $nDec);
			if ($cDec === false) {
				return false;
			}
			$cHex = $this->decToHex($cDec);
			if (strlen($cHex) % 2) {
				$cHex = '0' . $cHex;
			}
			// 左填 0 到 k 字节
			while (strlen($cHex) < $k * 2) {
				$cHex = '00' . $cHex;
			}
			if (strlen($cHex) > $k * 2) {
				// 理论上 c < n，不应发生；截断高位会毁掉密文
				$this->lastError = 'PureTLS：RSA 密文长度异常';
				return false;
			}
			$bin = @pack('H*', $cHex);
			if ($bin === false || strlen($bin) !== $k) {
				// pack 失败时手转
				$bin = '';
				for ($i = 0; $i < strlen($cHex); $i += 2) {
					$bin .= chr(hexdec(substr($cHex, $i, 2)));
				}
			}
			if (strlen($bin) !== $k) {
				$this->lastError = 'PureTLS：RSA 密文编码失败';
				return false;
			}
			return $bin;
		}

		private function binToDec($bin) {
			if ($bin === '') {
				return '0';
			}
			// PHP 5.5 无 gmp_import：用 hex 转
			if (function_exists('gmp_init')) {
				$hex = bin2hex($bin);
				if ($hex === '') {
					return '0';
				}
				return gmp_strval(gmp_init($hex, 16), 10);
			}
			if (!function_exists('bcmul')) {
				$this->lastError = 'PureTLS：binToDec 需要 gmp 或 bcmath';
				return '0';
			}
			// bcmath
			$dec = '0';
			$n = strlen($bin);
			for ($i = 0; $i < $n; $i++) {
				$dec = bcmul($dec, '256', 0);
				$dec = bcadd($dec, (string)ord($bin[$i]), 0);
			}
			return $dec;
		}

		private function decToHex($dec) {
			if (function_exists('gmp_init')) {
				return gmp_strval(gmp_init($dec, 10), 16);
			}
			if (!function_exists('bccomp')) {
				return '00';
			}
			$hex = '';
			$d = $dec;
			if ($d === '0') {
				return '00';
			}
			while (bccomp($d, '0', 0) > 0) {
				$mod = (int)bcmod($d, '16');
				$hex = dechex($mod) . $hex;
				$d = bcdiv($d, '16', 0);
			}
			return $hex;
		}

		private function modPow($base, $exp, $mod) {
			if (function_exists('gmp_powm')) {
				return gmp_strval(gmp_powm(gmp_init($base, 10), gmp_init($exp, 10), gmp_init($mod, 10)), 10);
			}
			if (!function_exists('bcmul')) {
				$this->lastError = 'PureTLS：modPow 需要 gmp 或 bcmath';
				return false;
			}
			// bcmath 快速幂
			$result = '1';
			$base = bcmod($base, $mod);
			while (bccomp($exp, '0') > 0) {
				if (bcmod($exp, '2') === '1') {
					$result = bcmod(bcmul($result, $base), $mod);
				}
				$exp = bcdiv($exp, '2', 0);
				$base = bcmod(bcmul($base, $base), $mod);
			}
			return $result;
		}

		// ========== AES-128-CBC ==========

		private function aes128CbcEncrypt($plain, $key, $iv) {
			// openssl 对称（非 stream crypto），结果应与纯实现一致；优先保证正确性
			if (function_exists('openssl_encrypt') && defined('OPENSSL_RAW_DATA')) {
				$flags = OPENSSL_RAW_DATA;
				if (defined('OPENSSL_ZERO_PADDING')) {
					$flags = $flags | OPENSSL_ZERO_PADDING;
				}
				$out = @openssl_encrypt($plain, 'AES-128-CBC', $key, $flags, $iv);
				if ($out !== false && $out !== null && strlen($out) === strlen($plain)) {
					return $out;
				}
			}
			if (function_exists('mcrypt_encrypt') && defined('MCRYPT_RIJNDAEL_128')) {
				$out = @mcrypt_encrypt(MCRYPT_RIJNDAEL_128, $key, $plain, MCRYPT_MODE_CBC, $iv);
				if ($out !== false && $out !== null && strlen($out) === strlen($plain)) {
					return $out;
				}
			}
			return $this->aes128CbcPure($plain, $key, $iv, true);
		}

		private function aes128CbcDecrypt($cipher, $key, $iv) {
			if (function_exists('openssl_decrypt') && defined('OPENSSL_RAW_DATA')) {
				$flags = OPENSSL_RAW_DATA;
				if (defined('OPENSSL_ZERO_PADDING')) {
					$flags = $flags | OPENSSL_ZERO_PADDING;
				}
				$out = @openssl_decrypt($cipher, 'AES-128-CBC', $key, $flags, $iv);
				if ($out !== false && $out !== null && strlen($out) === strlen($cipher)) {
					return $out;
				}
			}
			if (function_exists('mcrypt_decrypt') && defined('MCRYPT_RIJNDAEL_128')) {
				$out = @mcrypt_decrypt(MCRYPT_RIJNDAEL_128, $key, $cipher, MCRYPT_MODE_CBC, $iv);
				if ($out !== false && $out !== null && strlen($out) === strlen($cipher)) {
					return $out;
				}
			}
			return $this->aes128CbcPure($cipher, $key, $iv, false);
		}

		/**
		 * 极简 AES-128-CBC（仅 128-bit key）
		 * @param string $data
		 * @param string $key 16B
		 * @param string $iv 16B
		 * @param bool $enc
		 * @return string|false
		 */
		private function aes128CbcPure($data, $key, $iv, $enc) {
			if (strlen($key) !== 16 || strlen($iv) !== 16 || (strlen($data) % 16) !== 0) {
				$this->lastError = 'PureTLS：AES 参数非法';
				return false;
			}
			// 使用 openssl 对称加密仅当存在——用户要求不用 openssl 流；对称原语可选用
			// 这里坚持不用 openssl_*，用内置表实现
			$rk = $this->aesExpandKey($key);
			$out = '';
			$prev = $iv;
			$n = strlen($data);
			for ($off = 0; $off < $n; $off += 16) {
				$block = substr($data, $off, 16);
				if ($enc) {
					$x = $this->xor16($block, $prev);
					$c = $this->aesEncryptBlock($x, $rk);
					$out .= $c;
					$prev = $c;
				} else {
					$p = $this->aesDecryptBlock($block, $rk);
					$out .= $this->xor16($p, $prev);
					$prev = $block;
				}
			}
			return $out;
		}

		// --- AES tables / core（标准实现压缩版）---

		private function aesExpandKey($key) {
			static $rcon = null;
			if ($rcon === null) {
				$rcon = array(0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36);
			}
			$w = array();
			for ($i = 0; $i < 4; $i++) {
				$w[$i] = (ord($key[$i * 4]) << 24) | (ord($key[$i * 4 + 1]) << 16)
					| (ord($key[$i * 4 + 2]) << 8) | ord($key[$i * 4 + 3]);
			}
			for ($i = 4; $i < 44; $i++) {
				$t = $w[$i - 1];
				if ($i % 4 === 0) {
					$t = $this->aesSubWord($this->aesRotWord($t)) ^ ($rcon[$i / 4 - 1] << 24);
				}
				$w[$i] = $w[$i - 4] ^ $t;
			}
			return $w;
		}

		private function aesRotWord($w) {
			return (($w << 8) & 0xFFFFFFFF) | (($w >> 24) & 0xFF);
		}

		private function aesSubWord($w) {
			$s = $this->aesSbox();
			return ($s[($w >> 24) & 0xFF] << 24) | ($s[($w >> 16) & 0xFF] << 16)
				| ($s[($w >> 8) & 0xFF] << 8) | $s[$w & 0xFF];
		}

		private function aesSbox() {
			static $s = null;
			if ($s !== null) {
				return $s;
			}
			$s = array(
				0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
				0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
				0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
				0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
				0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
				0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
				0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
				0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
				0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
				0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
				0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
				0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
				0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
				0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
				0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
				0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
			);
			return $s;
		}

		private function aesInvSbox() {
			static $s = null;
			if ($s !== null) {
				return $s;
			}
			$sb = $this->aesSbox();
			$s = array_fill(0, 256, 0);
			for ($i = 0; $i < 256; $i++) {
				$s[$sb[$i]] = $i;
			}
			return $s;
		}

		private function aesEncryptBlock($block16, $rk) {
			$s = array();
			for ($i = 0; $i < 16; $i++) {
				$s[$i] = ord($block16[$i]);
			}
			$sbox = $this->aesSbox();
			// AddRoundKey 0
			for ($c = 0; $c < 4; $c++) {
				$w = $rk[$c];
				$s[$c * 4] ^= ($w >> 24) & 0xFF;
				$s[$c * 4 + 1] ^= ($w >> 16) & 0xFF;
				$s[$c * 4 + 2] ^= ($w >> 8) & 0xFF;
				$s[$c * 4 + 3] ^= $w & 0xFF;
			}
			for ($round = 1; $round <= 10; $round++) {
				// SubBytes
				for ($i = 0; $i < 16; $i++) {
					$s[$i] = $sbox[$s[$i]];
				}
				// ShiftRows
				$t = $s[1]; $s[1] = $s[5]; $s[5] = $s[9]; $s[9] = $s[13]; $s[13] = $t;
				$t = $s[2]; $s[2] = $s[10]; $s[10] = $t; $t = $s[6]; $s[6] = $s[14]; $s[14] = $t;
				$t = $s[15]; $s[15] = $s[11]; $s[11] = $s[7]; $s[7] = $s[3]; $s[3] = $t;
				// MixColumns (not last)
				if ($round < 10) {
					for ($c = 0; $c < 4; $c++) {
						$i = $c * 4;
						$a0 = $s[$i]; $a1 = $s[$i + 1]; $a2 = $s[$i + 2]; $a3 = $s[$i + 3];
						$s[$i] = $this->gmul(2, $a0) ^ $this->gmul(3, $a1) ^ $a2 ^ $a3;
						$s[$i + 1] = $a0 ^ $this->gmul(2, $a1) ^ $this->gmul(3, $a2) ^ $a3;
						$s[$i + 2] = $a0 ^ $a1 ^ $this->gmul(2, $a2) ^ $this->gmul(3, $a3);
						$s[$i + 3] = $this->gmul(3, $a0) ^ $a1 ^ $a2 ^ $this->gmul(2, $a3);
					}
				}
				// AddRoundKey
				for ($c = 0; $c < 4; $c++) {
					$w = $rk[$round * 4 + $c];
					$s[$c * 4] ^= ($w >> 24) & 0xFF;
					$s[$c * 4 + 1] ^= ($w >> 16) & 0xFF;
					$s[$c * 4 + 2] ^= ($w >> 8) & 0xFF;
					$s[$c * 4 + 3] ^= $w & 0xFF;
				}
			}
			$out = '';
			for ($i = 0; $i < 16; $i++) {
				$out .= chr($s[$i]);
			}
			return $out;
		}

		private function aesDecryptBlock($block16, $rk) {
			$s = array();
			for ($i = 0; $i < 16; $i++) {
				$s[$i] = ord($block16[$i]);
			}
			$isbox = $this->aesInvSbox();
			// AddRoundKey 10
			for ($c = 0; $c < 4; $c++) {
				$w = $rk[40 + $c];
				$s[$c * 4] ^= ($w >> 24) & 0xFF;
				$s[$c * 4 + 1] ^= ($w >> 16) & 0xFF;
				$s[$c * 4 + 2] ^= ($w >> 8) & 0xFF;
				$s[$c * 4 + 3] ^= $w & 0xFF;
			}
			for ($round = 9; $round >= 0; $round--) {
				// InvShiftRows
				$t = $s[13]; $s[13] = $s[9]; $s[9] = $s[5]; $s[5] = $s[1]; $s[1] = $t;
				$t = $s[2]; $s[2] = $s[10]; $s[10] = $t; $t = $s[6]; $s[6] = $s[14]; $s[14] = $t;
				$t = $s[3]; $s[3] = $s[7]; $s[7] = $s[11]; $s[11] = $s[15]; $s[15] = $t;
				// InvSubBytes
				for ($i = 0; $i < 16; $i++) {
					$s[$i] = $isbox[$s[$i]];
				}
				// AddRoundKey
				for ($c = 0; $c < 4; $c++) {
					$w = $rk[$round * 4 + $c];
					$s[$c * 4] ^= ($w >> 24) & 0xFF;
					$s[$c * 4 + 1] ^= ($w >> 16) & 0xFF;
					$s[$c * 4 + 2] ^= ($w >> 8) & 0xFF;
					$s[$c * 4 + 3] ^= $w & 0xFF;
				}
				// InvMixColumns (not after round 0)
				if ($round > 0) {
					for ($c = 0; $c < 4; $c++) {
						$i = $c * 4;
						$a0 = $s[$i]; $a1 = $s[$i + 1]; $a2 = $s[$i + 2]; $a3 = $s[$i + 3];
						$s[$i] = $this->gmul(14, $a0) ^ $this->gmul(11, $a1) ^ $this->gmul(13, $a2) ^ $this->gmul(9, $a3);
						$s[$i + 1] = $this->gmul(9, $a0) ^ $this->gmul(14, $a1) ^ $this->gmul(11, $a2) ^ $this->gmul(13, $a3);
						$s[$i + 2] = $this->gmul(13, $a0) ^ $this->gmul(9, $a1) ^ $this->gmul(14, $a2) ^ $this->gmul(11, $a3);
						$s[$i + 3] = $this->gmul(11, $a0) ^ $this->gmul(13, $a1) ^ $this->gmul(9, $a2) ^ $this->gmul(14, $a3);
					}
				}
			}
			$out = '';
			for ($i = 0; $i < 16; $i++) {
				$out .= chr($s[$i]);
			}
			return $out;
		}

		private function gmul($a, $b) {
			$p = 0;
			for ($i = 0; $i < 8; $i++) {
				if ($b & 1) {
					$p ^= $a;
				}
				$hi = $a & 0x80;
				$a = ($a << 1) & 0xFF;
				if ($hi) {
					$a ^= 0x1b;
				}
				$b >>= 1;
			}
			return $p;
		}

		/** 16 字节异或（兼容 PHP 5.5） */
		private function xor16($a, $b) {
			$out = '';
			for ($i = 0; $i < 16; $i++) {
				$out .= chr(ord($a[$i]) ^ ord($b[$i]));
			}
			return $out;
		}
	}

	/**
	 * 将 PureTls10 接到 TDS net 套接字：握手期 PRELOGIN 封装，之后直传。
	 * 提供 stream wrapper 供 TdsPacket 读写明文 TDS。
	 */
	class SqlmngerPureTlsBridge {
		/** @var array */
		public static $instances = array();
		/** @var string|null */
		public static $lastError = null;

		public $id = 0;
		/** @var resource */
		public $net = null;
		/** @var SqlmngerPureTls10 */
		public $tls = null;
		public $packetSize = 4096;
		public $timeoutSec = 8;
		public $handshakeWrap = true;
		public $netBuf = '';
		public $plainBuf = '';
		public $closed = false;
		/** 实例级错误（与 static::$lastError 区分） */
		public $error = null;

		/**
		 * @param resource $netStream
		 * @param int $packetSize
		 * @param int $timeoutSec
		 * @return SqlmngerPureTlsBridge|false
		 */
		public static function handshake($netStream, $packetSize, $timeoutSec) {
			self::$lastError = null;
			$b = new SqlmngerPureTlsBridge();
			$b->id = self::nextId();
			$b->net = $netStream;
			$b->packetSize = $packetSize > 16 ? intval($packetSize) : 4096;
			$b->timeoutSec = $timeoutSec > 0 ? intval($timeoutSec) : 8;
			$b->tls = new SqlmngerPureTls10();
			$b->handshakeWrap = true;
			$b->netBuf = '';
			$b->plainBuf = '';

			// 握手期用阻塞 + 读超时更稳（Windows 非阻塞 fread 易空转丢时序）
			@stream_set_blocking($netStream, true);
			@stream_set_timeout($netStream, $b->timeoutSec);

			$self = $b;
			$sendTls = function ($tlsBytes) use ($self) {
				return $self->sendTlsDuringHandshake($tlsBytes);
			};
			$recvTls = function ($waitSec) use ($self) {
				return $self->recvTlsDuringHandshake($waitSec);
			};

			$ok = $b->tls->handshake($sendTls, $recvTls, $b->timeoutSec);
			if (!$ok) {
				self::$lastError = $b->tls->lastError !== null ? $b->tls->lastError : 'PureTLS 握手失败';
				return false;
			}
			$b->handshakeWrap = false;
			// 应用期可读非阻塞 + select
			@stream_set_blocking($netStream, false);
			self::$instances[$b->id] = $b;
			return $b;
		}

		public function openAppStream() {
			static $reg = false;
			if (!$reg) {
				if (!in_array('sqlmngerpuretls', stream_get_wrappers(), true)) {
					if (!@stream_wrapper_register('sqlmngerpuretls', 'SqlmngerPureTlsStream')) {
						$this->error = '无法注册 sqlmngerpuretls';
						return false;
					}
				}
				$reg = true;
			}
			$fp = @fopen('sqlmngerpuretls://' . $this->id, 'r+b');
			if ($fp === false) {
				$this->error = '无法打开 puretls 流';
			}
			return $fp;
		}

		public function closeAll() {
			$this->closed = true;
			if (isset(self::$instances[$this->id])) {
				unset(self::$instances[$this->id]);
			}
			$this->net = null;
		}

		public function destroyPairOnly() {
			$this->closeAll();
		}

		/**
		 * 握手期：TLS 字节装入 PRELOGIN 写出
		 * @param string $payload
		 * @return bool
		 */
		public function sendTlsDuringHandshake($payload) {
			$headerLen = 8;
			$maxPayload = $this->packetSize - $headerLen;
			if ($maxPayload < 1) {
				$maxPayload = 4088;
			}
			$offset = 0;
			$plen = strlen($payload);
			$packetId = 1;
			while ($offset < $plen) {
				$remain = $plen - $offset;
				$chunk = $remain > $maxPayload ? $maxPayload : $remain;
				$last = ($offset + $chunk >= $plen);
				$total = $headerLen + $chunk;
				$pkt = chr(0x12)
					. chr($last ? 0x01 : 0x00)
					. chr(($total >> 8) & 0xFF)
					. chr($total & 0xFF)
					. "\x00\x00"
					. chr($packetId & 0xFF)
					. "\x00"
					. substr($payload, $offset, $chunk);
				$packetId++;
				if (!$this->writeAll($this->net, $pkt)) {
					return false;
				}
				$offset += $chunk;
			}
			return true;
		}

		/**
		 * 握手期：从 net 读 PRELOGIN，抽出 TLS 字节
		 * @param float $waitSec
		 * @return string|false
		 */
		public function recvTlsDuringHandshake($waitSec) {
			$deadline = microtime(true) + max(0.1, floatval($waitSec));
			$out = '';
			// 先抽缓冲
			while (strlen($this->netBuf) >= 8) {
				$total = (ord($this->netBuf[2]) << 8) | ord($this->netBuf[3]);
				if ($total < 8) {
					return false;
				}
				if (strlen($this->netBuf) < $total) {
					break;
				}
				$payload = substr($this->netBuf, 8, $total - 8);
				$this->netBuf = substr($this->netBuf, $total);
				$out .= $payload;
			}
			if ($out !== '') {
				return $out;
			}
			// 阻塞读（握手期 socket 为 blocking + stream_set_timeout）
			while (microtime(true) < $deadline && $out === '') {
				$left = $deadline - microtime(true);
				if ($left <= 0) {
					break;
				}
				// Windows/PHP5.5：stream_set_timeout(0, usec) 可能被当成无限等待
				$tSec = 1;
				if ($left < 1) {
					$tSec = 1;
				}
				@stream_set_timeout($this->net, $tSec);
				$chunk = @fread($this->net, 16384);
				if ($chunk === false || $chunk === '') {
					$meta = @stream_get_meta_data($this->net);
					if (!empty($meta['eof'])) {
						break;
					}
					continue;
				}
				$this->netBuf .= $chunk;
				while (strlen($this->netBuf) >= 8) {
					$total = (ord($this->netBuf[2]) << 8) | ord($this->netBuf[3]);
					if ($total < 8) {
						return false;
					}
					if (strlen($this->netBuf) < $total) {
						break;
					}
					$payload = substr($this->netBuf, 8, $total - 8);
					$this->netBuf = substr($this->netBuf, $total);
					$out .= $payload;
				}
			}
			return $out;
		}

		/**
		 * 应用期写明文 → TLS → net
		 * @param string $plain
		 * @return int|false bytes of plain accepted
		 */
		public function writePlain($plain) {
			$rec = $this->tls->protect($plain);
			if ($rec === false) {
				$this->error = $this->tls->lastError;
				return false;
			}
			if ($rec === '') {
				return 0;
			}
			if (!$this->writeAll($this->net, $rec)) {
				$this->error = 'PureTLS：写 net 失败';
				return false;
			}
			return strlen($plain);
		}

		/**
		 * 应用期读：net → TLS 解密 → 明文
		 * @param int $max
		 * @param float $waitSec
		 * @return string|false
		 */
		public function readPlain($max, $waitSec) {
			$max = intval($max);
			if ($max <= 0) {
				return '';
			}
			if (strlen($this->plainBuf) >= $max) {
				$out = substr($this->plainBuf, 0, $max);
				$this->plainBuf = substr($this->plainBuf, $max);
				return $out;
			}
			$deadline = microtime(true) + $waitSec;
			while (microtime(true) < $deadline && strlen($this->plainBuf) < $max) {
				if (strlen($this->plainBuf) === 0) {
					$r = array($this->net);
					$w = null;
					$e = null;
					@stream_select($r, $w, $e, 0, 50000);
				}
				$chunk = @fread($this->net, 16384);
				if ($chunk === false) {
					break;
				}
				if ($chunk !== '') {
					$plain = $this->tls->unprotectFeed($chunk);
					if ($plain === false) {
						$this->error = $this->tls->lastError;
						return false;
					}
					$this->plainBuf .= $plain;
				} elseif (strlen($this->plainBuf) > 0) {
					break;
				}
			}
			if (strlen($this->plainBuf) === 0) {
				return '';
			}
			$n = min($max, strlen($this->plainBuf));
			$out = substr($this->plainBuf, 0, $n);
			$this->plainBuf = substr($this->plainBuf, $n);
			return $out;
		}

		public function writeAll($fp, $data) {
			$off = 0;
			$len = strlen($data);
			$guard = 0;
			while ($off < $len) {
				$n = @fwrite($fp, substr($data, $off));
				if ($n === false || $n === 0) {
					$guard++;
					if ($guard > 200) {
						return false;
					}
					$r = null;
					$w = array($fp);
					$e = null;
					@stream_select($r, $w, $e, 0, 10000);
					continue;
				}
				$off += $n;
				$guard = 0;
			}
			@fflush($fp);
			return true;
		}

		private static function nextId() {
			static $n = 1;
			$n++;
			return $n;
		}
	}

	class SqlmngerPureTlsStream {
		public $context;
		/** @var SqlmngerPureTlsBridge|null */
		private $bridge = null;
		private $eof = false;

		public function stream_open($path, $mode, $options, &$opened_path) {
			$id = 0;
			if (preg_match('/(\\d+)/', $path, $m)) {
				$id = intval($m[1]);
			}
			if ($id <= 0 || !isset(SqlmngerPureTlsBridge::$instances[$id])) {
				return false;
			}
			$this->bridge = SqlmngerPureTlsBridge::$instances[$id];
			$this->eof = false;
			return true;
		}

		public function stream_read($count) {
			if ($this->bridge === null || $this->bridge->closed) {
				$this->eof = true;
				return false;
			}
			$data = $this->bridge->readPlain($count, $this->bridge->timeoutSec);
			if ($data === false) {
				$this->eof = true;
				return false;
			}
			if ($data === '') {
				return '';
			}
			return $data;
		}

		public function stream_write($data) {
			if ($this->bridge === null || $this->bridge->closed) {
				return false;
			}
			$n = $this->bridge->writePlain($data);
			return $n === false ? false : $n;
		}

		public function stream_eof() {
			return $this->eof;
		}

		public function stream_flush() {
			return true;
		}

		public function stream_close() {
			$this->bridge = null;
		}

		public function stream_stat() {
			return array();
		}

		public function stream_set_option($option, $arg1, $arg2) {
			if ($option === STREAM_OPTION_READ_TIMEOUT && $this->bridge !== null) {
				$sec = intval($arg1);
				if ($sec > 0) {
					$this->bridge->timeoutSec = $sec;
				}
				return true;
			}
			return false;
		}
	}
}
