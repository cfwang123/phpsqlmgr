<?php
/**
 * 纯 TCP + TDS 的 SQL Server 客户端（SQL 认证）
 * 移植自 TCP/testmssql TdsClient.cs
 * 兼容 PHP 5.5+
 */
if (!defined('SQLMNGER_TDS_CLIENT')) {
	define('SQLMNGER_TDS_CLIENT', 1);

	require_once __DIR__ . '/TdsPacket.php';
	require_once __DIR__ . '/TdsTokens.php';
	require_once __DIR__ . '/TdsTlsFilter.php';
	require_once __DIR__ . '/PureTls10.php';

	class SqlmngerTdsClient {
		// PRELOGIN ENCRYPTION 取值（MS-TDS）
		const ENCRYPT_OFF = 0x00;
		const ENCRYPT_ON = 0x01;
		const ENCRYPT_NOT_SUP = 0x02;
		const ENCRYPT_REQ = 0x03;

		/** @var resource|null 应用层读写（明文 TDS；TLS 时为桥接流） */
		private $stream = null;
		/** @var resource|null 底层 TCP（TLS 时与 stream 分离） */
		private $netStream = null;
		/** @var SqlmngerTdsTlsBridge|null */
		private $tlsBridge = null;
		private $packetSize = 4096;
		private $connected = false;
		private $lastError = null;
		private $serverVersion = null;
		private $database = '';
		/** @var bool 当前连接是否已 TLS */
		private $tlsEnabled = false;
		/** @var string auto|require|disable */
		private $encryptMode = 'auto';
		/** @var bool 信任服务器证书（自签/内网常用） */
		private $trustServerCertificate = true;
		/** @var int 连接超时秒（TLS 握手共用） */
		private $timeoutSec = 8;

		public function isConnected() {
			return $this->connected && is_resource($this->stream);
		}

		public function getLastError() {
			return $this->lastError;
		}

		public function getPacketSize() {
			return $this->packetSize;
		}

		public function getServerVersion() {
			return $this->serverVersion;
		}

		public function getDatabase() {
			return $this->database;
		}

		public function isTlsEnabled() {
			return $this->tlsEnabled;
		}

		/**
		 * @param string $host
		 * @param int $port
		 * @param string $user
		 * @param string $password
		 * @param string $database
		 * @param int $timeoutMs
		 * @param array|null $opts encrypt=auto|require|disable, trustServerCertificate=bool
		 * @return bool
		 */
		public function connect($host, $port, $user, $password, $database, $timeoutMs = 8000, $opts = null) {
			$this->disconnect();
			$this->lastError = null;
			$this->serverVersion = null;
			$this->tlsEnabled = false;
			$this->database = $database === null ? '' : strval($database);
			if (!is_array($opts)) {
				$opts = array();
			}
			// 配置默认（可被 opts 覆盖）
			$encCfg = isset($opts['encrypt']) ? strtolower(strval($opts['encrypt'])) : '';
			if ($encCfg === '' && function_exists('sqlmnger_cfg')) {
				$encCfg = strtolower(strval(sqlmnger_cfg('mssql_tcp_encrypt', 'auto')));
			}
			if ($encCfg !== 'require' && $encCfg !== 'disable' && $encCfg !== 'auto') {
				$encCfg = 'auto';
			}
			$this->encryptMode = $encCfg;

			if (array_key_exists('trustServerCertificate', $opts)) {
				$this->trustServerCertificate = !!$opts['trustServerCertificate'];
			} elseif (array_key_exists('trust_server_certificate', $opts)) {
				$this->trustServerCertificate = !!$opts['trust_server_certificate'];
			} elseif (function_exists('sqlmnger_cfg')) {
				$this->trustServerCertificate = !!sqlmnger_cfg('mssql_tcp_trust_server_certificate', true);
			} else {
				$this->trustServerCertificate = true;
			}

			$timeoutSec = max(1, intval(ceil($timeoutMs / 1000.0)));
			$this->timeoutSec = $timeoutSec;
			$host = strval($host);
			$port = intval($port);
			if ($port <= 0) {
				$port = 1433;
			}

			// 主路径
			$ok = $this->connectOnce($host, $port, $user, $password, $database, $timeoutSec, false);
			if ($ok) {
				return true;
			}

			// auto：TLS/LOGIN 失败且服务器未强制加密时，回退明文（NOT_SUP）。
			// 典型场景：旧环境 TLS 失败，但 Force Encryption=OFF 时仍可明文登录。
			if ($this->encryptMode === 'auto') {
				$prevErr = $this->lastError;
				$okPlain = $this->connectOnce($host, $port, $user, $password, $database, $timeoutSec, true);
				if ($okPlain) {
					return true;
				}
				// 保留更有信息的错误（优先 TLS 相关）
				if ($prevErr !== null && $prevErr !== '' &&
					(strpos($prevErr, 'TLS') !== false || strpos($prevErr, '加密') !== false)) {
					$this->lastError = $prevErr . '；明文回退亦失败: ' . $this->lastError;
				}
			}
			return false;
		}

		/**
		 * 单次 TCP + PRELOGIN + 可选 TLS + LOGIN7
		 * @param string $host
		 * @param int $port
		 * @param string $user
		 * @param string $password
		 * @param string $database
		 * @param int $timeoutSec
		 * @param bool $forcePlain  true=按 disable 发 NOT_SUP 明文（auto 回退用）
		 * @return bool
		 */
		private function connectOnce($host, $port, $user, $password, $database, $timeoutSec, $forcePlain) {
			$this->disconnect();
			$this->lastError = null;
			$this->serverVersion = null;
			$this->tlsEnabled = false;
			$errno = 0;
			$errstr = '';
			$target = 'tcp://' . $host . ':' . $port;
			$ctx = stream_context_create(array(
				'ssl' => $this->sslContextOptions($host),
			));
			$fp = @stream_socket_client(
				$target,
				$errno,
				$errstr,
				$timeoutSec,
				STREAM_CLIENT_CONNECT,
				$ctx
			);
			if ($fp === false) {
				$this->lastError = '连接失败: ' . $errstr . ' (' . $errno . ') ' . $host . ':' . $port;
				return false;
			}
			stream_set_timeout($fp, $timeoutSec);
			if (function_exists('stream_set_blocking')) {
				@stream_set_blocking($fp, true);
			}
			$this->netStream = $fp;
			$this->stream = $fp;
			try {
				if (!$this->preloginAndMaybeTls($host, $forcePlain)) {
					$this->disconnect();
					return false;
				}
				if (!$this->login7($host, $user, $password, $database)) {
					$this->disconnect();
					return false;
				}
				$this->connected = true;
				try {
					$this->execute('SET ANSI_WARNINGS OFF');
					$this->execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
				} catch (Exception $e) {
					// ignore
				}
				return true;
			} catch (Exception $ex) {
				$this->lastError = $ex->getMessage();
				$this->disconnect();
				return false;
			}
		}

		public function disconnect() {
			$this->connected = false;
			$this->tlsEnabled = false;
			// 先关应用桥接流
			if (is_resource($this->stream) && $this->stream !== $this->netStream) {
				@fclose($this->stream);
			}
			$this->stream = null;
			if ($this->tlsBridge !== null) {
				$this->tlsBridge->closeAll();
				$this->tlsBridge = null;
			}
			if (is_resource($this->netStream)) {
				@fclose($this->netStream);
			}
			$this->netStream = null;
		}

		/**
		 * SSL 上下文（PHP 5.5+）
		 * SQL Server 2008/R2 等旧实例不支持 SNI，开启常导致握手失败。
		 *
		 * 重要限制（实测 PHP 5.5.12 + OpenSSL 1.0.1g + SQL Server 2008 R2）：
		 * PHP ext/openssl 在创建 SSL_CTX 时会执行
		 *   ssl_ctx_options &= ~SSL_OP_DONT_INSERT_EMPTY_FRAGMENTS
		 * 即强制开启 BEAST 空分片。SQL Server Schannel 解密此类应用数据会
		 * 静默无响应（握手能成功，LOGIN7 后无回包）。Microsoft 客户端
		 * （sqlcmd -N / .NET Encrypt=true）用 Schannel，不受此影响。
		 * 纯 PHP OpenSSL 路径在修复该 PHP 行为前，对 2008 R2 加密登录不可靠；
		 * 未强制加密时请用 encrypt=disable 或 auto 在 NOT_SUP 场景走明文。
		 *
		 * @param string $peerName
		 * @return array
		 */
		private function sslContextOptions($peerName) {
			$trust = $this->trustServerCertificate;
			$peerName = $peerName === null ? '' : strval($peerName);
			$isIp = $peerName !== '' && filter_var($peerName, FILTER_VALIDATE_IP) !== false;
			$opt = array(
				'verify_peer' => !$trust,
				'verify_peer_name' => !$trust,
				'allow_self_signed' => $trust,
				// TDS 加密场景统一关闭 SNI（2008 R2 / 内网 IP / 主机名均更稳）
				'SNI_enabled' => false,
			);
			if (!$trust && $peerName !== '' && !$isIp) {
				$opt['peer_name'] = $peerName;
			}
			// OpenSSL 1.1+ 默认安全级别会禁 TLS1.0 / 弱套件；2008 R2 RTM 仅 TLS1.0
			if (defined('OPENSSL_VERSION_NUMBER') && OPENSSL_VERSION_NUMBER >= 0x10100000) {
				$opt['ciphers'] = 'DEFAULT@SECLEVEL=0';
				// PHP 7.1+ 可设 security_level（需编译进 openssl）
				$opt['security_level'] = 0;
			}
			return $opt;
		}

		/**
		 * PRELOGIN + 按需 TLS 握手（MS-TDS：在 LOGIN7 之前升级加密）
		 * @param string $host
		 * @param bool $forcePlain  true 时强制 NOT_SUP 明文（auto 回退）
		 * @return bool
		 */
		private function preloginAndMaybeTls($host, $forcePlain = false) {
			// 客户端 ENCRYPTION 声明（MS-TDS）：
			// - disable / forcePlain → NOT_SUP（明文；服务器若强制加密会失败）
			// - auto / require      → ON（协商加密并走 TLS）
			//
			// 实测 SQL Server 2008 R2：
			// - client OFF + server OFF：明文 LOGIN 被掐断；TLS 握手可成功但 LOGIN7 仍失败
			// - client ON  + server ON ：TLS + LOGIN7 正常
			// 故 auto 首次也发 ON；失败时 connect() 再以 forcePlain=NOT_SUP 回退明文。
			if ($forcePlain || $this->encryptMode === 'disable') {
				$clientEnc = self::ENCRYPT_NOT_SUP;
			} else {
				// auto / require：希望加密
				$clientEnc = self::ENCRYPT_ON;
			}

			// 纯 PHP TLS（PureTls10）不依赖 openssl 扩展；仅 OpenSSL 流回退需要它。
			// 无 stream_socket_enable_crypto 时仍可尝试纯 PHP 路径。
			if ($clientEnc !== self::ENCRYPT_NOT_SUP
				&& !function_exists('stream_socket_enable_crypto')
				&& !class_exists('SqlmngerPureTlsBridge', false)) {
				if ($this->encryptMode === 'require') {
					$this->lastError = '当前 PHP 无法 TLS 加密连接（无 stream_socket_enable_crypto / PureTLS）';
					return false;
				}
				$clientEnc = self::ENCRYPT_NOT_SUP;
			}

			$serverEnc = $this->sendPrelogin($clientEnc);
			if ($serverEnc === false) {
				return false;
			}

			// 服务器强制加密，但客户端声明不支持
			if (($serverEnc === self::ENCRYPT_REQ || $serverEnc === self::ENCRYPT_ON)
				&& $clientEnc === self::ENCRYPT_NOT_SUP) {
				$this->lastError = '服务器要求 TLS 加密 (ENCRYPT=' . $serverEnc
					. ')，请将 mssql_tcp_encrypt 设为 auto 或 require（纯 PHP TLS 或 openssl 均可）';
				return false;
			}

			// 需要 TLS：服务器 ON/REQ；或客户端已声明 ON（server 通常回 ON）
			$needTls = ($serverEnc === self::ENCRYPT_ON || $serverEnc === self::ENCRYPT_REQ);
			if ($clientEnc === self::ENCRYPT_ON && $serverEnc === self::ENCRYPT_OFF) {
				// 少见：仍尝试 TLS（require 场景）
				$needTls = true;
			}
			if ($this->encryptMode === 'require' && $serverEnc === self::ENCRYPT_NOT_SUP) {
				$this->lastError = '已要求加密，但服务器不支持 TLS (ENCRYPT_NOT_SUP)';
				return false;
			}

			if ($needTls) {
				if (!$this->enableTls($host)) {
					$extra = $this->lastError !== null ? $this->lastError : 'TLS 失败';
					$this->lastError = $extra
						. '。若未强制加密可用 mssql_tcp_encrypt=disable 或 auto（会明文回退）；'
						. 'TLS 需 hash + (openssl 或 gmp/bcmath)';
					return false;
				}
			} else {
				$this->tlsEnabled = false;
			}
			return true;
		}

		/**
		 * @param int $clientEncByte
		 * @return int|false 服务器 ENCRYPT 字节；失败 false
		 */
		private function sendPrelogin($clientEncByte) {
			$version = "\x09\x00\x00\x00\x00\x00";
			$enc = chr($clientEncByte & 0xFF);
			$inst = "\x00";
			$thread = "\x00\x00\x00\x00";
			$mars = "\x00";

			$headerBytes = 5 * 5 + 1;
			$off = $headerBytes;
			$tokens = '';
			$values = '';

			$addOpt = function ($type, $val) use (&$tokens, &$values, &$off) {
				$tokens .= chr($type)
					. chr(($off >> 8) & 0xFF)
					. chr($off & 0xFF)
					. chr((strlen($val) >> 8) & 0xFF)
					. chr(strlen($val) & 0xFF);
				$values .= $val;
				$off += strlen($val);
			};
			$addOpt(0x00, $version);
			$addOpt(0x01, $enc);
			$addOpt(0x02, $inst);
			$addOpt(0x03, $thread);
			$addOpt(0x04, $mars);
			$tokens .= "\xFF";
			$payload = $tokens . $values;

			try {
				SqlmngerTdsPacket::send($this->stream, SqlmngerTdsPacket::TYPE_PRELOGIN, $payload, $this->packetSize);
				$rtype = 0;
				$resp = SqlmngerTdsPacket::recv($this->stream, $rtype);
			} catch (Exception $ex) {
				$this->lastError = 'PRELOGIN 失败: ' . $ex->getMessage();
				return false;
			}
			$serverEnc = $this->parsePreloginEncryption($resp);
			if ($serverEnc === 0xFF) {
				// 未解析到 ENCRYPTION 选项时按 OFF 处理
				$serverEnc = self::ENCRYPT_OFF;
			}
			return $serverEnc;
		}

		/**
		 * PRELOGIN 之后、LOGIN7 之前启用 TLS。
		 * MS-TDS：握手期 TLS 记录必须装在 PRELOGIN(0x12) 包内；完成后应用 TDS 经 TLS 加密封送。
		 *
		 * 优先纯 PHP TLS1.0（无 OpenSSL 空分片，兼容 SQL Server 2008 R2）；
		 * 失败再回退 stream_socket_enable_crypto 桥接。
		 *
		 * @param string $host
		 * @return bool
		 */
		private function enableTls($host) {
			$net = is_resource($this->netStream) ? $this->netStream : $this->stream;
			if (!is_resource($net)) {
				$this->lastError = 'TLS：无有效套接字';
				return false;
			}

			// 1) 纯 PHP TLS 1.0（推荐，兼容 2008 R2；无 BEAST 空分片）
			// 握手超时封顶 5s：失败时尽快让 auto 走明文回退，避免「连接中」卡十几秒
			$tlsTo = intval($this->timeoutSec);
			if ($tlsTo < 2) {
				$tlsTo = 2;
			}
			if ($tlsTo > 5) {
				$tlsTo = 5;
			}
			$pure = SqlmngerPureTlsBridge::handshake($net, $this->packetSize, $tlsTo);
			if ($pure !== false) {
				$app = $pure->openAppStream();
				if ($app !== false) {
					$this->tlsBridge = $pure;
					$this->netStream = $net;
					$this->stream = $app;
					$this->tlsEnabled = true;
					return true;
				}
				$pureErr = $pure->error !== null ? $pure->error : 'openAppStream 失败';
				$pure->destroyPairOnly();
			} else {
				$pureErr = SqlmngerPureTlsBridge::$lastError;
				if ($pureErr === null || $pureErr === '') {
					$pureErr = 'PureTLS 握手失败';
				}
			}

			// 2) OpenSSL 流桥：默认跳过
			// - Pure 失败后同一 TCP 常已被 Schannel 掐断，再握手只会空等到超时
			// - PHP ext/openssl 对 2008 R2 还有 BEAST 空分片问题，LOGIN 多半仍失败
			// 需要时在 config 设 mssql_tcp_openssl_fallback=true
			$tryOssl = false;
			if (function_exists('sqlmnger_cfg')) {
				$tryOssl = !!sqlmnger_cfg('mssql_tcp_openssl_fallback', false);
			}
			if (!$tryOssl) {
				$this->lastError = 'TLS 失败：' . $pureErr;
				return false;
			}

			if (!function_exists('stream_socket_enable_crypto')) {
				$this->lastError = 'TLS：纯 PHP 失败 (' . $pureErr . ')，且无 stream_socket_enable_crypto';
				return false;
			}
			// 套接字可能已死：OpenSSL 用短超时，避免再卡满 connect_timeout
			$osslTo = $tlsTo > 3 ? 3 : $tlsTo;
			$sslOpts = $this->sslContextOptions($host);
			$methods = $this->tlsCryptoMethods();
			if (count($methods) === 0) {
				$this->lastError = 'TLS：纯 PHP 失败 (' . $pureErr . ')，且无可用 crypto_method';
				return false;
			}
			$method = $methods[0];
			$bridge = SqlmngerTdsTlsBridge::handshake(
				$net,
				$this->packetSize,
				$osslTo,
				$sslOpts,
				$method
			);
			if ($bridge === false) {
				$detail = SqlmngerTdsTlsBridge::$lastHandshakeError;
				if ($detail === null || $detail === '') {
					$detail = '未知原因';
				}
				$this->lastError = 'TLS 失败：纯 PHP=[' . $pureErr . ']；OpenSSL=[' . $detail . ']';
				return false;
			}

			$app = $bridge->openAppStream();
			if ($app === false) {
				$msg = $bridge->lastError !== null ? $bridge->lastError : '无法打开 TLS 桥接流';
				$this->lastError = 'TLS：' . $msg;
				$bridge->destroyPairOnly();
				return false;
			}

			$this->tlsBridge = $bridge;
			$this->netStream = $net;
			$this->stream = $app;
			$this->tlsEnabled = true;
			return true;
		}

		/**
		 * 按环境拼出候选 crypto_method。
		 * SQL Server 2008 R2 RTM 仅 TLS1.0：必须优先 TLSv1_0 / TLS_CLIENT，
		 * 不可把 TLSv1_2 放首位（PHP7+ 默认若先试 1.2 会握手秒败）。
		 * @return int[]
		 */
		private function tlsCryptoMethods() {
			$list = array();
			// 1) TLS 1.0 专用（PHP 5.6+ / 7.x 有定义）
			if (defined('STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT')) {
				$list[] = STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT;
			}
			// 2) TLS_CLIENT：PHP5=TLSv1；PHP7 常为多版本位掩码（含 1.0）
			if (defined('STREAM_CRYPTO_METHOD_TLS_CLIENT')) {
				$list[] = STREAM_CRYPTO_METHOD_TLS_CLIENT;
			}
			// 3) SSLv23 宽松协商（旧 PHP）
			if (defined('STREAM_CRYPTO_METHOD_SSLv23_CLIENT')) {
				$list[] = STREAM_CRYPTO_METHOD_SSLv23_CLIENT;
			}
			// 4) 较新协议放后（新 SQL Server / 已打 TLS1.2 补丁的 2008R2）
			if (defined('STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT')) {
				$list[] = STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT;
			}
			if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
				$list[] = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
			}
			$out = array();
			$seen = array();
			foreach ($list as $m) {
				$k = strval($m);
				if (isset($seen[$k])) {
					continue;
				}
				$seen[$k] = true;
				$out[] = $m;
			}
			if (count($out) === 0 && defined('STREAM_CRYPTO_METHOD_TLS_CLIENT')) {
				$out[] = STREAM_CRYPTO_METHOD_TLS_CLIENT;
			}
			return $out;
		}

		/**
		 * @param string $sql
		 * @return array columns, rows(assoc), rows_affected, messages, error
		 */
		public function execute($sql) {
			$result = array(
				'columns' => array(),
				'rows' => array(),
				'rows_affected' => 0,
				'messages' => array(),
				'error' => null,
			);
			if (!$this->isConnected()) {
				$result['error'] = '未连接';
				return $result;
			}
			try {
				$payload = $this->buildSqlBatch($sql);
				SqlmngerTdsPacket::send($this->stream, SqlmngerTdsPacket::TYPE_SQLBATCH, $payload, $this->packetSize);
				$resp = SqlmngerTdsPacket::recv($this->stream);
				$result = SqlmngerTdsTokens::parse($resp);
				$newSize = SqlmngerTdsTokens::tryGetPacketSize($resp, $this->packetSize);
				if ($newSize != $this->packetSize) {
					$this->packetSize = $newSize;
				}
				if (!empty($result['error'])) {
					$this->lastError = $result['error'];
				}
				return $result;
			} catch (Exception $ex) {
				$this->lastError = $ex->getMessage();
				$result['error'] = $ex->getMessage();
				$this->connected = false;
				return $result;
			}
		}

		/**
		 * @return int 受影响行数，失败 -1
		 */
		public function executeNonQuery($sql, &$error) {
			$r = $this->execute($sql);
			$error = isset($r['error']) ? $r['error'] : null;
			if (!empty($r['error'])) {
				return -1;
			}
			return isset($r['rows_affected']) ? intval($r['rows_affected']) : 0;
		}

		private function parsePreloginEncryption($data) {
			if ($data === null || strlen($data) < 5) {
				return 0xFF;
			}
			$pos = 0;
			$len = strlen($data);
			while ($pos + 5 <= $len) {
				$type = ord($data[$pos]);
				if ($type === 0xFF) {
					break;
				}
				$offset = (ord($data[$pos + 1]) << 8) | ord($data[$pos + 2]);
				$olen = (ord($data[$pos + 3]) << 8) | ord($data[$pos + 4]);
				$pos += 5;
				if ($type === 0x01 && $offset + $olen <= $len && $olen >= 1) {
					return ord($data[$offset]);
				}
			}
			return 0x00;
		}

		private function login7($server, $user, $password, $database) {
			$tdsVersion = 0x72090002;
			$clientPid = function_exists('getmypid') ? (getmypid() & 0xFFFFFFFF) : 1;
			$hostName = function_exists('php_uname') ? php_uname('n') : 'PC';
			if ($hostName === false || $hostName === '') {
				$hostName = 'PC';
			}
			$appName = 'sqlmnger';
			$cltIntName = 'TDS';
			$language = '';
			$db = $database === null ? '' : strval($database);
			$user = $user === null ? '' : strval($user);
			$password = $password === null ? '' : strval($password);
			$server = $server === null ? '' : strval($server);

			$pwdBytes = SqlmngerTdsPacket::obfuscatePassword($password);
			$fixedLen = 94;

			$cchHost = $this->ucs2CharCount($hostName);
			$cchUser = $this->ucs2CharCount($user);
			$cchPass = $this->ucs2CharCount($password);
			$cchApp = $this->ucs2CharCount($appName);
			$cchServer = $this->ucs2CharCount($server);
			$cchUnused = 0;
			$cchClt = $this->ucs2CharCount($cltIntName);
			$cchLang = $this->ucs2CharCount($language);
			$cchDb = $this->ucs2CharCount($db);
			$cchSspi = 0;
			$cchAtch = 0;
			$cchChg = 0;

			$ib = $fixedLen;
			$ibHost = $ib; $ib += $cchHost * 2;
			$ibUser = $ib; $ib += $cchUser * 2;
			$ibPass = $ib; $ib += $cchPass * 2;
			$ibApp = $ib; $ib += $cchApp * 2;
			$ibServer = $ib; $ib += $cchServer * 2;
			$ibUnused = $ib; $ib += $cchUnused * 2;
			$ibClt = $ib; $ib += $cchClt * 2;
			$ibLang = $ib; $ib += $cchLang * 2;
			$ibDb = $ib; $ib += $cchDb * 2;
			$ibSspi = $ib; $ib += $cchSspi;
			$ibAtch = $ib; $ib += $cchAtch * 2;
			$ibChg = $ib; $ib += $cchChg * 2;
			$totalLen = $ib;

			$buf = str_repeat("\x00", $totalLen);
			$p = 0;
			$this->writeU32($buf, $p, $totalLen);
			$this->writeU32($buf, $p, $tdsVersion);
			$this->writeU32($buf, $p, $this->packetSize);
			$this->writeU32($buf, $p, 0x00000007);
			$this->writeU32($buf, $p, $clientPid);
			$this->writeU32($buf, $p, 0);
			$buf[$p] = chr(0xE0); $p++;
			$buf[$p] = chr(0x03); $p++;
			$buf[$p] = chr(0x00); $p++;
			$buf[$p] = chr(0x00); $p++;
			$this->writeI32($buf, $p, 0);
			$this->writeU32($buf, $p, 0x00000409);

			$this->writeU16($buf, $p, $ibHost); $this->writeU16($buf, $p, $cchHost);
			$this->writeU16($buf, $p, $ibUser); $this->writeU16($buf, $p, $cchUser);
			$this->writeU16($buf, $p, $ibPass); $this->writeU16($buf, $p, $cchPass);
			$this->writeU16($buf, $p, $ibApp); $this->writeU16($buf, $p, $cchApp);
			$this->writeU16($buf, $p, $ibServer); $this->writeU16($buf, $p, $cchServer);
			$this->writeU16($buf, $p, $ibUnused); $this->writeU16($buf, $p, $cchUnused);
			$this->writeU16($buf, $p, $ibClt); $this->writeU16($buf, $p, $cchClt);
			$this->writeU16($buf, $p, $ibLang); $this->writeU16($buf, $p, $cchLang);
			$this->writeU16($buf, $p, $ibDb); $this->writeU16($buf, $p, $cchDb);
			// ClientID 6 bytes
			$buf[$p] = chr(0x01); $p++;
			$buf[$p] = chr(0x02); $p++;
			$buf[$p] = chr(0x03); $p++;
			$buf[$p] = chr(0x04); $p++;
			$buf[$p] = chr(0x05); $p++;
			$buf[$p] = chr(0x06); $p++;
			$this->writeU16($buf, $p, $ibSspi); $this->writeU16($buf, $p, $cchSspi);
			$this->writeU16($buf, $p, $ibAtch); $this->writeU16($buf, $p, $cchAtch);
			$this->writeU16($buf, $p, $ibChg); $this->writeU16($buf, $p, $cchChg);
			$this->writeU32($buf, $p, 0);

			$this->writeUcs2At($buf, $ibHost, $hostName);
			$this->writeUcs2At($buf, $ibUser, $user);
			if ($cchPass > 0) {
				for ($i = 0; $i < strlen($pwdBytes); $i++) {
					$buf[$ibPass + $i] = $pwdBytes[$i];
				}
			}
			$this->writeUcs2At($buf, $ibApp, $appName);
			$this->writeUcs2At($buf, $ibServer, $server);
			$this->writeUcs2At($buf, $ibClt, $cltIntName);
			$this->writeUcs2At($buf, $ibLang, $language);
			$this->writeUcs2At($buf, $ibDb, $db);

			SqlmngerTdsPacket::send($this->stream, SqlmngerTdsPacket::TYPE_TDS7LOGIN, $buf, $this->packetSize);
			$resp = SqlmngerTdsPacket::recv($this->stream);
			$parsed = SqlmngerTdsTokens::parse($resp);
			$this->packetSize = SqlmngerTdsTokens::tryGetPacketSize($resp, $this->packetSize);
			if (!empty($parsed['error'])) {
				$this->lastError = $parsed['error'];
				return false;
			}
			return true;
		}

		private function buildSqlBatch($sql) {
			$header = "\x16\x00\x00\x00" // total ALL_HEADERS = 22
				. "\x12\x00\x00\x00" // header len 18
				. "\x02\x00" // type transaction descriptor
				. "\x00\x00\x00\x00\x00\x00\x00\x00"
				. "\x01\x00\x00\x00";
			$sqlBytes = SqlmngerTdsPacket::ucs2le($sql === null ? '' : strval($sql));
			return $header . $sqlBytes;
		}

		private function ucs2CharCount($s) {
			// 字符数：UCS-2 代码单元数 ≈ UTF-16LE 长度/2
			$b = SqlmngerTdsPacket::ucs2le($s === null ? '' : strval($s));
			return intval(strlen($b) / 2);
		}

		private function writeU16(&$buf, &$p, $v) {
			$v = intval($v) & 0xFFFF;
			$buf[$p] = chr($v & 0xFF); $p++;
			$buf[$p] = chr(($v >> 8) & 0xFF); $p++;
		}

		private function writeU32(&$buf, &$p, $v) {
			$v = $v & 0xFFFFFFFF;
			$buf[$p] = chr($v & 0xFF); $p++;
			$buf[$p] = chr(($v >> 8) & 0xFF); $p++;
			$buf[$p] = chr(($v >> 16) & 0xFF); $p++;
			$buf[$p] = chr(($v >> 24) & 0xFF); $p++;
		}

		private function writeI32(&$buf, &$p, $v) {
			$this->writeU32($buf, $p, $v);
		}

		private function writeUcs2At(&$buf, $offset, $s) {
			$b = SqlmngerTdsPacket::ucs2le($s);
			$n = strlen($b);
			for ($i = 0; $i < $n; $i++) {
				$buf[$offset + $i] = $b[$i];
			}
		}
	}
}
