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

	class SqlmngerTdsClient {
		// PRELOGIN ENCRYPTION 取值（MS-TDS）
		const ENCRYPT_OFF = 0x00;
		const ENCRYPT_ON = 0x01;
		const ENCRYPT_NOT_SUP = 0x02;
		const ENCRYPT_REQ = 0x03;

		/** @var resource|null */
		private $stream = null;
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
			$host = strval($host);
			$port = intval($port);
			if ($port <= 0) {
				$port = 1433;
			}
			$errno = 0;
			$errstr = '';
			$target = 'tcp://' . $host . ':' . $port;
			// SSL 上下文在启用 crypto 前挂到 socket（peer 校验策略）
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
			$this->stream = $fp;
			try {
				if (!$this->preloginAndMaybeTls($host)) {
					$this->disconnect();
					return false;
				}
				if (!$this->login7($host, $user, $password, $database)) {
					$this->disconnect();
					return false;
				}
				$this->connected = true;
				// 会话选项
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
			if (is_resource($this->stream)) {
				// 若已 TLS，先尝试优雅关闭（忽略失败）
				if (function_exists('stream_socket_enable_crypto')) {
					@stream_socket_enable_crypto($this->stream, false);
				}
				@fclose($this->stream);
			}
			$this->stream = null;
		}

		/**
		 * SSL 上下文（PHP 5.5+）
		 * @param string $peerName
		 * @return array
		 */
		private function sslContextOptions($peerName) {
			$trust = $this->trustServerCertificate;
			$opt = array(
				'verify_peer' => !$trust,
				'verify_peer_name' => !$trust,
				'allow_self_signed' => $trust,
				'SNI_enabled' => true,
			);
			// 严格校验时才绑定 peer 名称
			if (!$trust && $peerName !== '' && $peerName !== null) {
				$opt['peer_name'] = $peerName;
			}
			return $opt;
		}

		/**
		 * PRELOGIN + 按需 TLS 握手（MS-TDS：在 LOGIN7 之前升级加密）
		 * @param string $host
		 * @return bool
		 */
		private function preloginAndMaybeTls($host) {
			// 客户端声明的加密能力
			if ($this->encryptMode === 'disable') {
				$clientEnc = self::ENCRYPT_NOT_SUP;
			} else {
				// auto / require：声明支持并希望加密
				$clientEnc = self::ENCRYPT_ON;
			}

			if ($clientEnc !== self::ENCRYPT_NOT_SUP && !function_exists('stream_socket_enable_crypto')) {
				if ($this->encryptMode === 'require') {
					$this->lastError = '当前 PHP 不支持 stream_socket_enable_crypto，无法 TLS 加密连接';
					return false;
				}
				// auto：降级为不加密声明
				$clientEnc = self::ENCRYPT_NOT_SUP;
			}
			if ($clientEnc !== self::ENCRYPT_NOT_SUP && !extension_loaded('openssl')) {
				if ($this->encryptMode === 'require') {
					$this->lastError = '缺少 openssl 扩展，无法 TLS 加密连接 SQL Server';
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
					. ')，请启用 mssql_tcp_encrypt=auto|require，并确保 PHP openssl 可用';
				return false;
			}

			// 需要 TLS：服务器 ON/REQ，或客户端 require 且服务器接受
			$needTls = ($serverEnc === self::ENCRYPT_ON || $serverEnc === self::ENCRYPT_REQ);
			if ($this->encryptMode === 'require' && !$needTls && $serverEnc === self::ENCRYPT_NOT_SUP) {
				$this->lastError = '已要求加密，但服务器不支持 TLS (ENCRYPT_NOT_SUP)';
				return false;
			}
			// 部分实例在 OFF 时仍可明文；require 且仅 OFF：尝试 TLS，失败则报错
			if ($this->encryptMode === 'require' && $serverEnc === self::ENCRYPT_OFF) {
				$needTls = true;
			}

			if ($needTls) {
				if (!$this->enableTls($host)) {
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
		 * PRELOGIN 之后、LOGIN7 之前启用 TLS
		 * @param string $host
		 * @return bool
		 */
		private function enableTls($host) {
			if (!is_resource($this->stream)) {
				$this->lastError = 'TLS：无有效套接字';
				return false;
			}
			if (!function_exists('stream_socket_enable_crypto')) {
				$this->lastError = 'TLS：PHP 不支持 stream_socket_enable_crypto';
				return false;
			}
			// 再次应用上下文（部分环境 connect 时未完全生效）
			$sslOpts = $this->sslContextOptions($host);
			foreach ($sslOpts as $k => $v) {
				@stream_context_set_option($this->stream, 'ssl', $k, $v);
			}

			$method = STREAM_CRYPTO_METHOD_TLS_CLIENT;
			// 优先 TLS1.2+
			if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
				$method = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
				if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
					$method = $method | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
				}
			} elseif (defined('STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT')) {
				// 兼容旧 PHP：组合 1.0–1.2 若存在
				$method = STREAM_CRYPTO_METHOD_TLS_CLIENT;
			}

			$ok = @stream_socket_enable_crypto($this->stream, true, $method);
			if ($ok !== true) {
				// 再试一次更宽的 TLS_CLIENT
				$ok = @stream_socket_enable_crypto($this->stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
			}
			if ($ok !== true) {
				$meta = @stream_get_meta_data($this->stream);
				$hint = '';
				if (is_array($meta) && !empty($meta['timed_out'])) {
					$hint = '（超时）';
				}
				$trustHint = $this->trustServerCertificate
					? ''
					: '；可尝试配置 mssql_tcp_trust_server_certificate=true 信任服务器证书';
				$this->lastError = 'TLS 握手失败' . $hint
					. '。请确认服务器证书与 openssl 可用' . $trustHint;
				return false;
			}
			$this->tlsEnabled = true;
			return true;
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
