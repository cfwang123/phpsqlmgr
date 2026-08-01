<?php
/**
 * SQL Server MS-TDS 加密桥：
 * - 握手期：TLS 记录必须装在 PRELOGIN(0x12) 包内（[MS-TDS]）
 * - 握手后：TLS 记录在 TCP 上直传；应用层 TDS 由 OpenSSL 加解密
 *
 * PHP 的 stream_socket_enable_crypto 走底层 BIO，会绕过 stream_filter，
 * 因此用 stream_socket_pair + 泵送，而不是 user filter。
 *
 * 兼容 PHP 5.5+
 */
if (!defined('SQLMNGER_TDS_TLS_FILTER')) {
	define('SQLMNGER_TDS_TLS_FILTER', 1);

	class SqlmngerTdsTlsBridge {
		/** @var array id => SqlmngerTdsTlsBridge */
		public static $instances = array();

		/** @var int */
		public $id = 0;
		/** @var resource 应用侧（启用 crypto 后读写 TDS 明文） */
		public $sslApp = null;
		/** @var resource pair 另一端：TLS 密文字节 */
		public $sslPlain = null;
		/** @var resource 真实 TCP */
		public $net = null;
		/** @var bool 握手期 TDS 封装 */
		public $handshakeWrap = true;
		/** @var int */
		public $packetSize = 4096;
		/** @var string 从 net 读入的半包缓冲（握手 TDS 拆包） */
		public $netBuf = '';
		/** @var int 读超时秒 */
		public $timeoutSec = 8;
		/** @var bool */
		public $closed = false;
		/** @var string|null */
		public $lastError = null;

		/**
		 * @param resource $netStream
		 * @param int $packetSize
		 * @param int $timeoutSec
		 * @param array $sslOpts stream ssl context options
		 * @param int $cryptoMethod
		 * @return SqlmngerTdsTlsBridge|false
		 */
		/** @var string|null 最近一次 handshake 失败原因（静态，因失败时返回 false） */
		public static $lastHandshakeError = null;

		/**
		 * @param resource $netStream
		 * @param int $packetSize
		 * @param int $timeoutSec
		 * @param array $sslOpts
		 * @param int $cryptoMethod
		 * @return SqlmngerTdsTlsBridge|false
		 */
		public static function handshake($netStream, $packetSize, $timeoutSec, $sslOpts, $cryptoMethod) {
			self::$lastHandshakeError = null;
			if (!function_exists('stream_socket_enable_crypto')) {
				self::$lastHandshakeError = 'PHP 不支持 stream_socket_enable_crypto';
				return false;
			}
			if (!is_array($sslOpts)) {
				$sslOpts = array();
			}
			// 必须在 stream_socket_client 创建时带上 ssl context，事后 set_option 往往无效
			$pair = self::createLocalTcpPair($sslOpts);
			if ($pair === false) {
				self::$lastHandshakeError = '无法创建本地 TLS 桥接套接字（stream_socket_server/client）';
				return false;
			}

			$bridge = new SqlmngerTdsTlsBridge();
			$bridge->id = self::nextId();
			$bridge->sslApp = $pair[0];
			$bridge->sslPlain = $pair[1];
			$bridge->net = $netStream;
			$bridge->packetSize = $packetSize > 16 ? intval($packetSize) : 4096;
			$bridge->timeoutSec = $timeoutSec > 0 ? intval($timeoutSec) : 8;
			$bridge->handshakeWrap = true;
			$bridge->netBuf = '';

			@stream_set_blocking($bridge->sslApp, false);
			@stream_set_blocking($bridge->sslPlain, false);
			@stream_set_blocking($bridge->net, false);

			if (function_exists('openssl_error_string')) {
				while (openssl_error_string() !== false) {
				}
			}

			$deadline = microtime(true) + $bridge->timeoutSec;
			$ok = false;
			$sawClientHello = false;
			$rounds = 0;
			while (microtime(true) < $deadline) {
				// 先泵入可能已到的 ServerHello，再推进握手（避免卡在「有数据未读」）
				$moved = $bridge->pump(64);
				if ($moved > 0) {
					$sawClientHello = true;
				}
				$r = @stream_socket_enable_crypto($bridge->sslApp, true, $cryptoMethod);
				$moved2 = $bridge->pump(64);
				if ($moved2 > 0) {
					$sawClientHello = true;
				}
				$rounds++;

				if ($r === true) {
					$ok = true;
					break;
				}
				if ($r === false) {
					// PHP 5.5 偶发：首轮 false 但其实可继续；若已有 ClientHello 则多试几轮
					if ($sawClientHello && $rounds < 5) {
						$bridge->waitForIo(0.05);
						continue;
					}
					$bridge->lastError = 'stream_socket_enable_crypto 失败';
					$ossl = self::opensslErrors();
					if ($ossl !== '') {
						$bridge->lastError .= '；OpenSSL: ' . $ossl;
					}
					if (!$sawClientHello) {
						$bridge->lastError .= '（未发出 ClientHello，请检查 openssl）';
					}
					self::$lastHandshakeError = $bridge->lastError;
					$bridge->destroyPairOnly();
					return false;
				}
				// int(0)：握手未完成
				$bridge->waitForIo(0.05);
			}

			if (!$ok) {
				$bridge->lastError = 'TLS 握手超时';
				$ossl = self::opensslErrors();
				if ($ossl !== '') {
					$bridge->lastError .= '；OpenSSL: ' . $ossl;
				}
				self::$lastHandshakeError = $bridge->lastError;
				$bridge->destroyPairOnly();
				return false;
			}

			// 握手完成：密文在 TCP 上直传（不再包 PRELOGIN）
			$bridge->handshakeWrap = false;
			$bridge->pump(32);

			// sslApp 必须保持非阻塞。若 blocking，stream_read 内 fread 会在
			// OpenSSL 等应用数据时永久卡住，无法再 pump net→sslPlain（死锁）。
			@stream_set_blocking($bridge->sslApp, false);
			@stream_set_blocking($bridge->sslPlain, false);
			@stream_set_blocking($bridge->net, false);

			self::$instances[$bridge->id] = $bridge;
			return $bridge;
		}

		/**
		 * 打开桥接流：读写 = 应用 TDS 明文（经 TLS）
		 * @return resource|false
		 */
		public function openAppStream() {
			static $registered = false;
			if (!$registered) {
				// 重复注册会失败，忽略
				if (!in_array('sqlmngertdstls', stream_get_wrappers(), true)) {
					if (!@stream_wrapper_register('sqlmngertdstls', 'SqlmngerTdsTlsBridgeWrapper')) {
						$this->lastError = '无法注册 sqlmngertdstls 流包装';
						return false;
					}
				}
				$registered = true;
			}
			$path = 'sqlmngertdstls://' . $this->id;
			$fp = @fopen($path, 'r+b');
			if ($fp === false) {
				$this->lastError = '无法打开 TLS 桥接流 ' . $path;
			}
			return $fp;
		}

		/**
		 * 泵送 plain↔net
		 * @param int $maxRounds
		 * @return int 有数据移动的轮数
		 */
		public function pump($maxRounds = 16) {
			if ($this->closed) {
				return 0;
			}
			$movedRounds = 0;
			$maxRounds = intval($maxRounds);
			if ($maxRounds < 1) {
				$maxRounds = 1;
			}
			for ($i = 0; $i < $maxRounds; $i++) {
				$moved = false;

				// plain(密文) → net
				$out = @fread($this->sslPlain, 16384);
				if ($out !== false && $out !== '') {
					$moved = true;
					if ($this->handshakeWrap) {
						// 非阻塞 net 上不要用 TdsPacket::send（可能短写失败）
						if (!$this->writePreloginTds($out)) {
							$this->lastError = 'TLS 握手写出失败';
							return $movedRounds;
						}
					} else {
						if (!$this->writeAll($this->net, $out)) {
							$this->lastError = 'TLS 密文写出失败';
							return $movedRounds;
						}
					}
				}

				// net → plain
				$in = @fread($this->net, 16384);
				if ($in !== false && $in !== '') {
					$moved = true;
					if ($this->handshakeWrap) {
						$this->netBuf .= $in;
						if (!$this->flushNetBufToPlain()) {
							return $movedRounds;
						}
					} else {
						if (!$this->writeAll($this->sslPlain, $in)) {
							$this->lastError = 'TLS 密文写入 bridge 失败';
							return $movedRounds;
						}
					}
				}

				if ($moved) {
					$movedRounds++;
				} else {
					break;
				}
			}
			return $movedRounds;
		}

		/**
		 * 握手期：TLS 字节装入 PRELOGIN(0x12) 写出（支持分包）
		 * @param string $payload
		 * @return bool
		 */
		private function writePreloginTds($payload) {
			$headerLen = 8;
			$maxPayload = $this->packetSize - $headerLen;
			if ($maxPayload < 1) {
				$maxPayload = 4088;
			}
			$offset = 0;
			$plen = strlen($payload);
			$packetId = 1;
			if ($plen === 0) {
				return true;
			}
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
				if ($packetId === 0) {
					$packetId = 1;
				}
				if (!$this->writeAll($this->net, $pkt)) {
					return false;
				}
				$offset += $chunk;
			}
			return true;
		}

		/**
		 * 握手期：把 netBuf 中完整 PRELOGIN 包的 payload 喂给 plain
		 * @return bool
		 */
		private function flushNetBufToPlain() {
			while (strlen($this->netBuf) >= 8) {
				$total = (ord($this->netBuf[2]) << 8) | ord($this->netBuf[3]);
				if ($total < 8) {
					$this->lastError = 'TLS 握手收到非法 TDS 长度';
					return false;
				}
				if (strlen($this->netBuf) < $total) {
					break;
				}
				$payload = substr($this->netBuf, 8, $total - 8);
				$this->netBuf = substr($this->netBuf, $total);
				if ($payload !== '' && $payload !== false) {
					if (!$this->writeAll($this->sslPlain, $payload)) {
						$this->lastError = 'TLS 握手写入 bridge 失败';
						return false;
					}
				}
			}
			return true;
		}

		/**
		 * @param resource $fp
		 * @param string $data
		 * @return bool
		 */
		public function writeAll($fp, $data) {
			$off = 0;
			$len = strlen($data);
			$guard = 0;
			while ($off < $len) {
				$n = @fwrite($fp, substr($data, $off));
				if ($n === false || $n === 0) {
					// 缓冲满：稍等再试
					$guard++;
					if ($guard > 200) {
						return false;
					}
					$this->waitForIo(0.01);
					continue;
				}
				$off += $n;
				$guard = 0;
			}
			@fflush($fp);
			return true;
		}

		/**
		 * @param float $sec
		 */
		public function waitForIo($sec) {
			$read = array();
			if (is_resource($this->net)) {
				$read[] = $this->net;
			}
			if (is_resource($this->sslPlain)) {
				$read[] = $this->sslPlain;
			}
			if (is_resource($this->sslApp)) {
				$read[] = $this->sslApp;
			}
			if (count($read) === 0) {
				usleep(1000);
				return;
			}
			$write = null;
			$except = null;
			$secInt = intval($sec);
			$usec = intval(($sec - $secInt) * 1000000);
			if ($usec < 0) {
				$usec = 0;
			}
			@stream_select($read, $write, $except, $secInt, $usec);
		}

		/**
		 * 关闭 pair，不关 net（由外层管）
		 */
		public function destroyPairOnly() {
			if (is_resource($this->sslApp)) {
				@fclose($this->sslApp);
			}
			if (is_resource($this->sslPlain)) {
				@fclose($this->sslPlain);
			}
			$this->sslApp = null;
			$this->sslPlain = null;
			if (isset(self::$instances[$this->id])) {
				unset(self::$instances[$this->id]);
			}
		}

		public function closeAll() {
			$this->closed = true;
			$this->destroyPairOnly();
			// net 由 TdsClient 关闭
			$this->net = null;
		}

		/**
		 * 本地 TCP 回环对：[0]=sslApp（带 ssl context，供 enable_crypto），[1]=sslPlain（收发密文）
		 * 不用 stream_socket_pair：Windows/部分 PHP 上 enable_crypto 会直接失败且无 ClientHello。
		 *
		 * @param array $sslOpts
		 * @return array|false
		 */
		private static function createLocalTcpPair($sslOpts) {
			$errno = 0;
			$errstr = '';
			$server = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
			if ($server === false) {
				// IPv6 only 环境
				$server = @stream_socket_server('tcp://[::1]:0', $errno, $errstr);
			}
			if ($server === false) {
				return false;
			}
			$name = @stream_socket_get_name($server, false);
			if ($name === false || $name === '') {
				@fclose($server);
				return false;
			}
			// 形如 127.0.0.1:12345 或 ::1:12345
			$pos = strrpos($name, ':');
			if ($pos === false) {
				@fclose($server);
				return false;
			}
			$addr = substr($name, 0, $pos);
			$port = intval(substr($name, $pos + 1));
			if ($port <= 0) {
				@fclose($server);
				return false;
			}
			// 去掉 IPv6 括号
			$addrClean = $addr;
			if (strlen($addrClean) >= 2 && $addrClean[0] === '[') {
				$addrClean = trim($addrClean, '[]');
			}
			if ($addrClean === '::1') {
				$target = 'tcp://[::1]:' . $port;
			} else {
				$target = 'tcp://' . $addrClean . ':' . $port;
			}

			$ctx = stream_context_create(array('ssl' => $sslOpts));
			$sslApp = @stream_socket_client(
				$target,
				$errno,
				$errstr,
				2,
				STREAM_CLIENT_CONNECT,
				$ctx
			);
			$sslPlain = @stream_socket_accept($server, 2);
			@fclose($server);
			if ($sslApp === false || $sslPlain === false) {
				if (is_resource($sslApp)) {
					@fclose($sslApp);
				}
				if (is_resource($sslPlain)) {
					@fclose($sslPlain);
				}
				return false;
			}
			return array($sslApp, $sslPlain);
		}

		/** @return int */
		private static function nextId() {
			static $n = 1;
			$n++;
			return $n;
		}

		/** @return string */
		public static function opensslErrors() {
			if (!function_exists('openssl_error_string')) {
				return '';
			}
			$parts = array();
			$i = 0;
			while ($i < 5 && ($e = openssl_error_string()) !== false) {
				$parts[] = $e;
				$i++;
			}
			if (count($parts) === 0) {
				return '';
			}
			$s = implode(' | ', $parts);
			if (strlen($s) > 300) {
				$s = substr($s, 0, 300) . '...';
			}
			return $s;
		}
	}

	/**
	 * 用户流：把 TdsPacket 的 fread/fwrite 转到 sslApp，并在每次 IO 时泵送
	 */
	class SqlmngerTdsTlsBridgeWrapper {
		/** @var resource|null */
		public $context;
		/** @var SqlmngerTdsTlsBridge|null */
		private $bridge = null;
		/** @var bool */
		private $eof = false;

		public function stream_open($path, $mode, $options, &$opened_path) {
			// sqlmngertdstls://123
			$id = 0;
			if (preg_match('/(\\d+)/', $path, $m)) {
				$id = intval($m[1]);
			}
			if ($id <= 0 || !isset(SqlmngerTdsTlsBridge::$instances[$id])) {
				return false;
			}
			$this->bridge = SqlmngerTdsTlsBridge::$instances[$id];
			$this->eof = false;
			return true;
		}

		public function stream_read($count) {
			if ($this->bridge === null || $this->bridge->closed) {
				$this->eof = true;
				return false;
			}
			$count = intval($count);
			if ($count <= 0) {
				return '';
			}
			// 非阻塞 sslApp：先泵入密文再读明文，避免 OpenSSL 等 BIO 死锁
			$deadline = microtime(true) + $this->bridge->timeoutSec;
			$emptyRounds = 0;
			while (microtime(true) < $deadline) {
				$this->bridge->pump(64);
				$data = @fread($this->bridge->sslApp, $count);
				if ($data !== false && $data !== '') {
					return $data;
				}
				// 非阻塞下 false/'' 都可能只是暂无数据；真正断开靠后续超时
				$emptyRounds++;
				if ($emptyRounds > 2 && $this->bridge->lastError !== null && $this->bridge->lastError !== '') {
					$this->eof = true;
					return false;
				}
				$this->bridge->waitForIo(0.05);
			}
			// 超时：返回空串，上层 TdsPacket::readFull 会报连接关闭
			return '';
		}

		public function stream_write($data) {
			if ($this->bridge === null || $this->bridge->closed) {
				return false;
			}
			$written = 0;
			$len = strlen($data);
			$deadline = microtime(true) + $this->bridge->timeoutSec;
			while ($written < $len && microtime(true) < $deadline) {
				$n = @fwrite($this->bridge->sslApp, substr($data, $written));
				if ($n === false) {
					return ($written > 0) ? $written : false;
				}
				if ($n === 0) {
					$this->bridge->pump(16);
					$this->bridge->waitForIo(0.01);
					continue;
				}
				$written += $n;
				// 立刻把密文泵到 net
				$this->bridge->pump(32);
			}
			return $written;
		}

		public function stream_eof() {
			return $this->eof;
		}

		public function stream_flush() {
			if ($this->bridge === null) {
				return true;
			}
			if (is_resource($this->bridge->sslApp)) {
				@fflush($this->bridge->sslApp);
			}
			$this->bridge->pump(32);
			return true;
		}

		public function stream_close() {
			// 不在这里关 bridge；由 TdsClient::disconnect 统一关闭
			$this->bridge = null;
		}

		public function stream_stat() {
			return array();
		}

		public function stream_set_option($option, $arg1, $arg2) {
			// 支持超时传递
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
