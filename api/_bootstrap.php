<?php
/**
 * 公共引导：Session、JSON、Vault、连接
 * 兼容 PHP 5.5.12+
 */

if (!defined('SQLMNGER_ROOT')) {
	// 项目根：api/ 的上一级（Web 根即项目根）
	define('SQLMNGER_ROOT', dirname(__DIR__));
}

/**
 * 读取完整系统配置（config/config.php，唯一配置源）。
 * 兼容：若仅有旧版 config/app.php 也会加载。
 *
 * @return array
 */
function sqlmnger_config() {
	static $cfg = null;
	if ($cfg === null) {
		$dir = SQLMNGER_ROOT . DIRECTORY_SEPARATOR . 'config';
		$path = $dir . DIRECTORY_SEPARATOR . 'config.php';
		// 兼容旧文件名 app.php
		if (!is_file($path)) {
			$path = $dir . DIRECTORY_SEPARATOR . 'app.php';
		}
		if (!is_file($path)) {
			$cfg = sqlmnger_config_defaults();
		} else {
			$loaded = include $path;
			if (!is_array($loaded)) {
				$loaded = array();
			}
			// 文件值覆盖默认值，保证缺键仍有安全默认
			$cfg = array_merge(sqlmnger_config_defaults(), $loaded);
		}
		// sqlite_root 相对路径 → 绝对
		if (!empty($cfg['sqlite_root']) && !sqlmnger_path_is_absolute($cfg['sqlite_root'])) {
			$cfg['sqlite_root'] = SQLMNGER_ROOT . DIRECTORY_SEPARATOR
				. str_replace(array('/', '\\'), DIRECTORY_SEPARATOR, $cfg['sqlite_root']);
		}
	}
	return $cfg;
}

/**
 * 读取单个配置项。
 *
 * @param string $key
 * @param mixed $default 键不存在时的默认值
 * @return mixed
 */
function sqlmnger_cfg($key, $default = null) {
	$cfg = sqlmnger_config();
	if (array_key_exists($key, $cfg)) {
		return $cfg[$key];
	}
	return $default;
}

/**
 * 内置默认（config 文件缺失或键缺失时）。
 *
 * @return array
 */
function sqlmnger_config_defaults() {
	return array(
		'app_name' => 'sqlmnger',
		'app_version' => '1.0.2',
		'app_key' => 'dev-only-key-change-in-production-32b',
		'debug' => true,
		'enabled_drivers' => array('mysql', 'sqlite', 'sqlsrv', 'mssql_tcp', 'mssql_net'),
		'session_name' => 'SQLMNGERSESSID',
		'session_ttl' => 604800,
		'login_max_attempts' => 10,
		'login_window_sec' => 300,
		/** 是否允许空密码登录 MySQL/SQL Server */
		'allow_empty_password' => true,
		'sqlite_root' => SQLMNGER_ROOT . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'sqlite',
		'sqlite_allowed_extensions' => array('db', 'sqlite', 'sqlite3'),
		'default_table_limit' => 100000,
		'default_sql_limit' => 0,
		'max_fetch_rows' => 1000000,
		'unlimited_soft_max' => 2000000,
		'connect_timeout_sec' => 8,
		'app_login_enabled' => false,
		'app_login_password_hash' => null,
		'csrf_enabled' => false,
		'log_operations' => true,
		'log_path' => SQLMNGER_ROOT . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'app.log',
		'sql_require_danger_confirm' => true,
		/**
		 * mssql_tcp TLS：auto=按服务器协商；require=必须加密；disable=明文（强制加密实例会失败）
		 */
		'mssql_tcp_encrypt' => 'auto',
		/**
		 * 信任 SQL Server 证书（自签/内网主机名不匹配时常用 true）
		 */
		'mssql_tcp_trust_server_certificate' => true,
		/** PureTLS 失败后是否再试 OpenSSL 流桥（默认 false，加快失败回退） */
		'mssql_tcp_openssl_fallback' => false,
		/** mssql_net 常驻 CLI 无连接后自动退出秒数 */
		'mssql_net_idle_sec' => 10,
	);
}

/**
 * 操作审计日志（JSON 行写入 log_path）。
 * $action 如 login / logout / sql_exec / table_data / …
 * $detail 关联数组，勿写密码明文。
 *
 * @param string $action
 * @param array|null $detail
 */
function sqlmnger_audit($action, $detail) {
	if (!sqlmnger_cfg('log_operations', false)) {
		return;
	}
	$path = sqlmnger_cfg('log_path', '');
	if ($path === '' || $path === null) {
		$path = SQLMNGER_ROOT . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'app.log';
	}
	$dir = dirname($path);
	if (!is_dir($dir)) {
		@mkdir($dir, 0755, true);
	}
	$cid = '';
	$conn = null;
	if (function_exists('sqlmnger_request_conn_id')) {
		$cid = sqlmnger_request_conn_id();
		if ($cid !== '' && function_exists('sqlmnger_conn_get')) {
			$conn = sqlmnger_conn_get($cid);
		}
	}
	$row = array(
		'ts' => date('c'),
		'ip' => isset($_SERVER['REMOTE_ADDR']) ? strval($_SERVER['REMOTE_ADDR']) : '',
		'action' => strval($action),
		'conn_id' => $cid,
		'driver' => (is_array($conn) && isset($conn['driver'])) ? $conn['driver'] : '',
		'user' => (is_array($conn) && isset($conn['user'])) ? $conn['user'] : '',
		'host' => (is_array($conn) && isset($conn['host'])) ? $conn['host'] : '',
		'detail' => is_array($detail) ? $detail : array(),
		'request_id' => function_exists('sqlmnger_request_id') ? sqlmnger_request_id() : '',
	);
	$line = json_encode($row, 256);
	if ($line === false) {
		$line = '{"ts":"' . date('c') . '","action":' . json_encode(strval($action)) . ',"error":"encode_fail"}';
	}
	@file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
}

/**
 * 危险 SQL 检测（应用层启发式，非完整解析）。
 * @param string $sql 单条语句
 * @return array 风险标签列表，空=未判定为危险
 */
function sqlmnger_sql_danger_flags($sql) {
	$flags = array();
	$s = strval($sql);
	// 去掉块注释与行注释（粗略）
	$s = preg_replace('/\/\*.*?\*\//s', ' ', $s);
	$s = preg_replace('/--[^\n]*/', ' ', $s);
	$s = preg_replace('/#[^\n]*/', ' ', $s);
	$s = trim($s);
	if ($s === '') {
		return $flags;
	}
	$u = strtoupper($s);
	// 去掉字符串字面量再做关键词扫描，减少误报
	$scan = preg_replace("/'([^']|'')*'/", "''", $s);
	$scan = preg_replace('/"([^"]|"")*"/', '""', $scan);
	$scanU = strtoupper($scan);

	if (preg_match('/\bDROP\s+(DATABASE|SCHEMA|TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER|INDEX|USER)\b/i', $scanU)) {
		$flags[] = 'DROP';
	}
	if (preg_match('/\bTRUNCATE\b/i', $scanU)) {
		$flags[] = 'TRUNCATE';
	}
	if (preg_match('/\bALTER\s+TABLE\b.*\bDROP\b/i', $scanU)) {
		$flags[] = 'ALTER_DROP';
	}
	// DELETE 无 WHERE
	if (preg_match('/^\s*DELETE\b/i', $scanU) && !preg_match('/\bWHERE\b/i', $scanU)) {
		$flags[] = 'DELETE_NO_WHERE';
	}
	// UPDATE 无 WHERE
	if (preg_match('/^\s*UPDATE\b/i', $scanU) && !preg_match('/\bWHERE\b/i', $scanU)) {
		$flags[] = 'UPDATE_NO_WHERE';
	}
	if (preg_match('/\b(GRANT|REVOKE)\b/i', $scanU)) {
		$flags[] = 'GRANT_REVOKE';
	}
	return $flags;
}

/**
 * 多语句危险汇总
 * @param array $stmts
 * @return array list of {index, flags, preview}
 */
function sqlmnger_sql_collect_dangers($stmts) {
	$out = array();
	$i = 0;
	foreach ($stmts as $one) {
		$i++;
		$flags = sqlmnger_sql_danger_flags($one);
		if (count($flags) > 0) {
			$prev = preg_replace('/\s+/', ' ', trim(strval($one)));
			if (function_exists('mb_substr') && mb_strlen($prev, 'UTF-8') > 120) {
				$prev = mb_substr($prev, 0, 120, 'UTF-8') . '…';
			} elseif (strlen($prev) > 120) {
				$prev = substr($prev, 0, 120) . '…';
			}
			$out[] = array(
				'index' => $i,
				'flags' => $flags,
				'preview' => $prev,
			);
		}
	}
	return $out;
}

/**
 * @param string $path
 * @return bool
 */
function sqlmnger_path_is_absolute($path) {
	$path = strval($path);
	if ($path === '') {
		return false;
	}
	// Unix absolute or Windows \\ / UNC
	$c0 = $path[0];
	if ($c0 === '/' || $c0 === '\\') {
		return true;
	}
	// Windows drive: C:/ or C:\
	if (strlen($path) >= 3 && ctype_alpha($path[0]) && $path[1] === ':') {
		$sep = $path[2];
		if ($sep === '/' || $sep === '\\') {
			return true;
		}
	}
	return false;
}

function sqlmnger_request_id() {
	if (function_exists('openssl_random_pseudo_bytes')) {
		$b = openssl_random_pseudo_bytes(8);
		if ($b !== false) {
			return bin2hex($b);
		}
	}
	return uniqid('r', true);
}

function sqlmnger_json_out($ok, $data, $error, $httpCode) {
	if ($httpCode === null) {
		$httpCode = $ok ? 200 : 400;
	}
	// 输出前释放锁，避免客户端已断开后仍占用 session
	if (function_exists('sqlmnger_session_close')) {
		sqlmnger_session_close();
	}
	if (!headers_sent()) {
		header('Content-Type: application/json; charset=utf-8');
		header('Cache-Control: no-store');
		if (function_exists('http_response_code')) {
			http_response_code($httpCode);
		} else {
			header('X-PHP-Response-Code: ' . $httpCode, true, $httpCode);
		}
	}
	$out = array(
		'ok' => (bool)$ok,
		'data' => $data,
		'error' => $error,
		'meta' => array(
			'request_id' => sqlmnger_request_id(),
		),
	);
	// JSON_UNESCAPED_UNICODE = 256
	echo json_encode($out, 256);
	exit;
}

function sqlmnger_json_ok($data) {
	sqlmnger_json_out(true, $data, null, 200);
}

function sqlmnger_json_err($code, $message, $httpCode, $detail) {
	if ($httpCode === null) {
		$httpCode = 400;
	}
	$err = array(
		'code' => $code,
		'message' => $message,
	);
	if ($detail !== null && $detail !== '') {
		$err['detail'] = $detail;
	}
	sqlmnger_json_out(false, null, $err, $httpCode);
}

function sqlmnger_read_json_body() {
	// 同一请求只解析一次 php://input
	if (isset($GLOBALS['sqlmnger_json_body']) && is_array($GLOBALS['sqlmnger_json_body'])) {
		return $GLOBALS['sqlmnger_json_body'];
	}
	$raw = file_get_contents('php://input');
	if ($raw === false || $raw === '') {
		$GLOBALS['sqlmnger_json_body'] = array();
		return array();
	}
	$j = json_decode($raw, true);
	if (!is_array($j)) {
		$GLOBALS['sqlmnger_json_body'] = array();
		return array();
	}
	$GLOBALS['sqlmnger_json_body'] = $j;
	return $j;
}

/**
 * Session TTL（秒），钳制在合理范围，避免 32 位 time()+ttl 溢出或 Cookie 异常。
 * @return int
 */
function sqlmnger_session_ttl() {
	$ttl = intval(sqlmnger_cfg('session_ttl', 604800));
	if ($ttl < 3600) {
		$ttl = 3600;
	}
	// 最多 30 天：过大时部分环境 session/cookie 行为异常，且拖慢 GC
	if ($ttl > 2592000) {
		$ttl = 2592000;
	}
	return $ttl;
}

function sqlmnger_session_start() {
	$cfg = sqlmnger_config();
	$name = isset($cfg['session_name']) ? $cfg['session_name'] : 'SQLMNGERSESSID';
	if (session_name() !== $name) {
		session_name($name);
	}
	// 持久 Cookie：关闭浏览器后仍保持登录（lifetime > 0）
	$ttl = sqlmnger_session_ttl();
	// 垃圾回收不早于 Cookie 生命周期
	@ini_set('session.gc_maxlifetime', strval($ttl));
	@ini_set('session.cookie_lifetime', strval($ttl));
	@ini_set('session.use_cookies', '1');
	@ini_set('session.use_only_cookies', '1');

	$secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
	// 若反向代理 HTTPS
	if (!$secure && !empty($_SERVER['HTTP_X_FORWARDED_PROTO'])
		&& strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
		$secure = true;
	}

	// 注意：session_write_close() 之后 session_id() 仍可能非空，但会话已不 ACTIVE。
	// 若用 session_id()==='' 判断，会跳过二次 session_start()，导致登录写入的
	// $_SESSION 不落盘 → 后续 db_list 等接口 401「连接无效」。
	$active = false;
	if (function_exists('session_status')) {
		// PHP 5.4+：PHP_SESSION_ACTIVE = 2
		$active = (session_status() === PHP_SESSION_ACTIVE);
	}
	if (!$active) {
		// 仅全新会话设置 cookie 参数；reopen 时保留已有 session_id
		if (session_id() === '') {
			if (defined('PHP_VERSION_ID') && PHP_VERSION_ID >= 70300) {
				session_set_cookie_params(array(
					'lifetime' => $ttl,
					'path' => '/',
					'secure' => $secure,
					'httponly' => true,
					'samesite' => 'Lax',
				));
			} else {
				// PHP 5.5–7.2
				session_set_cookie_params($ttl, '/', '', $secure, true);
			}
		}
		// 避免并发请求长时间占锁：业务在慢操作前调用 sqlmnger_session_close()
		@session_start();
	}

	// 滑动续期：每次请求刷新 Cookie 过期时间（保持登录）
	if (!headers_sent() && session_id() !== '') {
		$params = session_get_cookie_params();
		$path = isset($params['path']) ? $params['path'] : '/';
		$domain = isset($params['domain']) ? $params['domain'] : '';
		$httponly = !empty($params['httponly']);
		$expire = time() + $ttl;
		if (defined('PHP_VERSION_ID') && PHP_VERSION_ID >= 70300) {
			setcookie(session_name(), session_id(), array(
				'expires' => $expire,
				'path' => $path,
				'domain' => $domain,
				'secure' => $secure,
				'httponly' => $httponly,
				'samesite' => 'Lax',
			));
		} else {
			setcookie(session_name(), session_id(), $expire, $path, $domain, $secure, $httponly);
		}
	}
}

/**
 * 释放 session 文件锁（慢 IO / 连库前必须调用，否则其它请求会卡在 session_start）。
 * 调用后仍可读本请求已载入的 $_SESSION 数组副本语义：写入需先 sqlmnger_session_start() 再改。
 */
function sqlmnger_session_close() {
	if (function_exists('session_status')) {
		if (session_status() === PHP_SESSION_ACTIVE) {
			@session_write_close();
		}
		return;
	}
	// PHP 5.3：session_id 非空且已 start
	if (session_id() !== '') {
		@session_write_close();
	}
}

function sqlmnger_vault_key() {
	$cfg = sqlmnger_config();
	$raw = isset($cfg['app_key']) ? $cfg['app_key'] : 'default';
	// 派生 32 字节
	return hash('sha256', 'sqlmnger-vault-v1|' . $raw, true);
}

function sqlmnger_random_bytes($n) {
	$n = intval($n);
	if ($n < 1) {
		$n = 1;
	}
	if (function_exists('random_bytes')) {
		return random_bytes($n);
	}
	if (function_exists('openssl_random_pseudo_bytes')) {
		$strong = false;
		$b = openssl_random_pseudo_bytes($n, $strong);
		if ($b !== false && strlen($b) === $n) {
			return $b;
		}
	}
	// 弱回退
	$s = '';
	for ($i = 0; $i < $n; $i++) {
		$s .= chr(mt_rand(0, 255));
	}
	return $s;
}

/**
 * 会话凭证加密。
 * - v1：AES-256-CBC + HMAC（需 openssl 扩展）
 * - v2：HMAC 密钥流 XOR + HMAC（无 openssl 时回退，仅依赖 hash 扩展）
 * Web 与 CLI 的 php.ini 可能不同；绝不能因缺 openssl 直接 Fatal。
 */
function sqlmnger_openssl_crypto_available() {
	return function_exists('openssl_encrypt')
		&& function_exists('openssl_decrypt')
		&& defined('OPENSSL_RAW_DATA');
}

function sqlmnger_vault_encrypt($plain) {
	// 允许空字符串（空密码登录时仍加密存 Session）
	$plain = strval($plain);
	$key = sqlmnger_vault_key();
	$iv = sqlmnger_random_bytes(16);

	if (sqlmnger_openssl_crypto_available()) {
		// OPENSSL_RAW_DATA = 1
		$flags = defined('OPENSSL_RAW_DATA') ? OPENSSL_RAW_DATA : 1;
		$cipher = @openssl_encrypt($plain, 'AES-256-CBC', $key, $flags, $iv);
		// 空明文加密后通常仍有填充块；仅当失败才走 fallback
		if ($cipher !== false) {
			$mac = hash_hmac('sha256', $iv . $cipher, $key, true);
			return base64_encode('v1' . $mac . $iv . $cipher);
		}
	}

	// 无 openssl：HMAC-SHA256 密钥流 XOR（会话短期凭证，优于明文落盘）
	$cipher = sqlmnger_xor_crypt($plain, $key, $iv);
	$mac = hash_hmac('sha256', $iv . $cipher, $key, true);
	return base64_encode('v2' . $mac . $iv . $cipher);
}

function sqlmnger_vault_decrypt($blob) {
	$key = sqlmnger_vault_key();
	$raw = base64_decode($blob, true);
	if ($raw === false || strlen($raw) < 2 + 32 + 16) {
		return false;
	}
	$ver = substr($raw, 0, 2);
	$mac = substr($raw, 2, 32);
	$iv = substr($raw, 34, 16);
	$cipher = substr($raw, 50);
	$calc = hash_hmac('sha256', $iv . $cipher, $key, true);
	if (!sqlmnger_hash_equals($mac, $calc)) {
		return false;
	}

	if ($ver === 'v1') {
		if (!sqlmnger_openssl_crypto_available()) {
			return false;
		}
		$flags = defined('OPENSSL_RAW_DATA') ? OPENSSL_RAW_DATA : 1;
		$plain = @openssl_decrypt($cipher, 'AES-256-CBC', $key, $flags, $iv);
		return ($plain === false) ? false : $plain;
	}

	if ($ver === 'v2') {
		return sqlmnger_xor_crypt($cipher, $key, $iv);
	}

	return false;
}

/**
 * 用 HMAC-SHA256 生成密钥流并 XOR（对称，加解密同一函数）
 */
function sqlmnger_xor_crypt($data, $key, $iv) {
	$data = strval($data);
	$len = strlen($data);
	$out = '';
	$counter = 0;
	$offset = 0;
	$block = '';
	for ($i = 0; $i < $len; $i++) {
		if ($offset === 0 || $offset >= 32) {
			// 计数器用 4 字节大端，兼容 PHP 5.5（不用 pack 复杂格式亦可）
			$ctr = chr(($counter >> 24) & 255) . chr(($counter >> 16) & 255)
				. chr(($counter >> 8) & 255) . chr($counter & 255);
			$block = hash_hmac('sha256', $iv . $ctr, $key, true);
			$counter++;
			$offset = 0;
		}
		$out .= chr(ord($data[$i]) ^ ord($block[$offset]));
		$offset++;
	}
	return $out;
}

function sqlmnger_hash_equals($a, $b) {
	if (function_exists('hash_equals')) {
		return hash_equals($a, $b);
	}
	if (strlen($a) !== strlen($b)) {
		return false;
	}
	$r = 0;
	$len = strlen($a);
	for ($i = 0; $i < $len; $i++) {
		$r |= ord($a[$i]) ^ ord($b[$i]);
	}
	return $r === 0;
}

function sqlmnger_login_rate_check() {
	$cfg = sqlmnger_config();
	$max = isset($cfg['login_max_attempts']) ? intval($cfg['login_max_attempts']) : 10;
	$win = isset($cfg['login_window_sec']) ? intval($cfg['login_window_sec']) : 300;
	$now = time();
	if (!isset($_SESSION['_login_attempts'])) {
		$_SESSION['_login_attempts'] = array();
	}
	// 清理窗口外
	$kept = array();
	foreach ($_SESSION['_login_attempts'] as $ts) {
		if ($now - intval($ts) <= $win) {
			$kept[] = intval($ts);
		}
	}
	$_SESSION['_login_attempts'] = $kept;
	if (count($kept) >= $max) {
		sqlmnger_json_err('RATE_LIMIT', '登录尝试过于频繁，请稍后再试', 429, null);
	}
}

function sqlmnger_login_rate_fail() {
	if (!isset($_SESSION['_login_attempts'])) {
		$_SESSION['_login_attempts'] = array();
	}
	$_SESSION['_login_attempts'][] = time();
}

function sqlmnger_login_rate_clear() {
	$_SESSION['_login_attempts'] = array();
}

/**
 * 尝试连接数据库
 * @return array array(ok=>bool, message=>, server_version=>, driver=>)
 */
function sqlmnger_try_connect($conn) {
	$driver = isset($conn['driver']) ? $conn['driver'] : '';
	if ($driver === 'mysql') {
		return sqlmnger_try_mysql($conn);
	}
	if ($driver === 'sqlite') {
		return sqlmnger_try_sqlite($conn);
	}
	if ($driver === 'sqlsrv') {
		return sqlmnger_try_sqlsrv($conn);
	}
	if ($driver === 'mssql_tcp') {
		return sqlmnger_try_mssql_tcp($conn);
	}
	if ($driver === 'mssql_net') {
		return sqlmnger_try_mssql_net($conn);
	}
	return array('ok' => false, 'message' => '不支持的引擎: ' . $driver, 'server_version' => '', 'driver' => $driver);
}

/**
 * SQL Server 方言族（官方 sqlsrv 扩展 或 自研 TCP/TDS）
 */
function sqlmnger_is_mssql_family($driver) {
	return $driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net' || $driver === 'mssql';
}

function sqlmnger_try_mysql($conn) {
	if (!extension_loaded('pdo_mysql')) {
		return array('ok' => false, 'message' => '未加载 pdo_mysql 扩展', 'server_version' => '', 'driver' => 'mysql');
	}
	$host = isset($conn['host']) ? $conn['host'] : '127.0.0.1';
	$port = isset($conn['port']) ? intval($conn['port']) : 3306;
	if ($port <= 0) {
		$port = 3306;
	}
	$user = isset($conn['user']) ? $conn['user'] : '';
	$pass = isset($conn['password']) ? $conn['password'] : '';
	$db = isset($conn['database']) ? $conn['database'] : '';

	$dsn = 'mysql:host=' . $host . ';port=' . $port . ';charset=utf8';
	if ($db !== '') {
		$dsn .= ';dbname=' . $db;
	}
	try {
		$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
		if ($cto < 1) {
			$cto = 8;
		}
		$pdo = new PDO($dsn, $user, $pass, array(
			PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
			PDO::ATTR_TIMEOUT => $cto,
		));
		$ver = '';
		try {
			$ver = strval($pdo->getAttribute(PDO::ATTR_SERVER_VERSION));
		} catch (Exception $e) {
			$ver = '';
		}
		$pdo = null;
		return array('ok' => true, 'message' => 'ok', 'server_version' => $ver, 'driver' => 'mysql');
	} catch (Exception $e) {
		return array('ok' => false, 'message' => $e->getMessage(), 'server_version' => '', 'driver' => 'mysql');
	}
}

function sqlmnger_try_sqlite($conn) {
	if (!extension_loaded('pdo_sqlite')) {
		return array('ok' => false, 'message' => '未加载 pdo_sqlite 扩展', 'server_version' => '', 'driver' => 'sqlite');
	}
	$path = isset($conn['path']) ? $conn['path'] : '';
	$path = trim($path);
	if ($path === '') {
		return array('ok' => false, 'message' => '请填写 SQLite 文件路径', 'server_version' => '', 'driver' => 'sqlite');
	}

	$resolved = sqlmnger_sqlite_resolve_path($path);
	if ($resolved === false) {
		return array('ok' => false, 'message' => 'SQLite 路径不在允许目录内或不合法', 'server_version' => '', 'driver' => 'sqlite');
	}

	// 文件可不存在时：若目录可写，允许创建；否则要求已存在
	$dir = dirname($resolved);
	if (!is_file($resolved) && !is_writable($dir)) {
		return array('ok' => false, 'message' => 'SQLite 文件不存在且目录不可写: ' . $resolved, 'server_version' => '', 'driver' => 'sqlite');
	}

	try {
		$pdo = new PDO('sqlite:' . $resolved, null, null, array(
			PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
		));
		$ver = '';
		try {
			$st = $pdo->query('SELECT sqlite_version()');
			if ($st) {
				$ver = strval($st->fetchColumn());
			}
		} catch (Exception $e) {
			$ver = '';
		}
		$pdo = null;
		$conn['path'] = $resolved;
		return array(
			'ok' => true,
			'message' => 'ok',
			'server_version' => $ver,
			'driver' => 'sqlite',
			'resolved_path' => $resolved,
		);
	} catch (Exception $e) {
		return array('ok' => false, 'message' => $e->getMessage(), 'server_version' => '', 'driver' => 'sqlite');
	}
}

function sqlmnger_sqlite_resolve_path($userPath) {
	$cfg = sqlmnger_config();
	$root = isset($cfg['sqlite_root']) ? $cfg['sqlite_root'] : (SQLMNGER_ROOT . '/storage/sqlite');
	if (!is_dir($root)) {
		@mkdir($root, 0755, true);
	}
	$rootReal = realpath($root);
	if ($rootReal === false) {
		return false;
	}

	// 禁止 UNC 与空
	if (preg_match('#^\\\\\\\\#', $userPath) || strpos($userPath, "\0") !== false) {
		return false;
	}

	// 相对路径拼到 jail 根下
	$isAbs = sqlmnger_path_is_absolute($userPath);
	if ($isAbs) {
		// 绝对路径：必须已存在且在 root 下
		$real = realpath($userPath);
		if ($real === false) {
			return false;
		}
	} else {
		// 去掉 .. 段的简单处理
		$norm = str_replace(array('/', '\\'), DIRECTORY_SEPARATOR, $userPath);
		$parts = explode(DIRECTORY_SEPARATOR, $norm);
		$safe = array();
		foreach ($parts as $p) {
			if ($p === '' || $p === '.') {
				continue;
			}
			if ($p === '..') {
				return false;
			}
			$safe[] = $p;
		}
		$candidate = $rootReal . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $safe);
		// 若文件不存在，检查父目录 realpath
		if (is_file($candidate)) {
			$real = realpath($candidate);
		} else {
			$parent = realpath(dirname($candidate));
			if ($parent === false) {
				return false;
			}
			// 父目录必须在 root 下
			if (strpos($parent, $rootReal) !== 0) {
				return false;
			}
			$real = $parent . DIRECTORY_SEPARATOR . basename($candidate);
		}
	}

	if ($real === false) {
		return false;
	}

	// 前缀约束（Windows 大小写不敏感）
	$rootCmp = strtolower(str_replace('\\', '/', $rootReal));
	$realCmp = strtolower(str_replace('\\', '/', $real));
	if (strpos($realCmp, $rootCmp) !== 0) {
		return false;
	}

	// 扩展名（config sqlite_allowed_extensions）
	$ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
	$allowed = sqlmnger_cfg('sqlite_allowed_extensions', array('db', 'sqlite', 'sqlite3'));
	if (!is_array($allowed) || count($allowed) === 0) {
		$allowed = array('db', 'sqlite', 'sqlite3');
	}
	$allowedNorm = array();
	foreach ($allowed as $a) {
		$allowedNorm[] = strtolower(strval($a));
	}
	if ($ext !== '' && !in_array($ext, $allowedNorm, true)) {
		return false;
	}

	return $real;
}

function sqlmnger_try_sqlsrv($conn) {
	if (!extension_loaded('sqlsrv')) {
		return array('ok' => false, 'message' => '未加载 sqlsrv 扩展（php_sqlsrv.dll）', 'server_version' => '', 'driver' => 'sqlsrv');
	}
	$host = isset($conn['host']) ? $conn['host'] : '127.0.0.1';
	$port = isset($conn['port']) ? intval($conn['port']) : 1433;
	if ($port <= 0) {
		$port = 1433;
	}
	$user = isset($conn['user']) ? $conn['user'] : '';
	$pass = isset($conn['password']) ? $conn['password'] : '';
	$db = isset($conn['database']) ? $conn['database'] : '';

	$server = $host . ',' . $port;
	$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
	if ($cto < 1) {
		$cto = 8;
	}
	$info = array(
		'UID' => $user,
		'PWD' => $pass,
		'CharacterSet' => 'UTF-8',
		'LoginTimeout' => $cto,
		'ReturnDatesAsStrings' => true,
	);
	if ($db !== '') {
		$info['Database'] = $db;
	}

	$connRes = @sqlsrv_connect($server, $info);
	if ($connRes === false) {
		$errs = sqlsrv_errors();
		$msg = '连接失败';
		if (is_array($errs) && isset($errs[0]['message'])) {
			$msg = $errs[0]['message'];
		}
		return array('ok' => false, 'message' => $msg, 'server_version' => '', 'driver' => 'sqlsrv');
	}

	$ver = '';
	$stmt = @sqlsrv_query($connRes, 'SELECT @@VERSION AS v');
	if ($stmt) {
		$row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC);
		if ($row && isset($row['v'])) {
			$ver = strval($row['v']);
			// 截断过长版本串
			if (strlen($ver) > 120) {
				$ver = substr($ver, 0, 120) . '...';
			}
		}
		sqlsrv_free_stmt($stmt);
	}
	sqlsrv_close($connRes);
	return array('ok' => true, 'message' => 'ok', 'server_version' => $ver, 'driver' => 'sqlsrv');
}

/**
 * 自研 TCP/TDS 引擎试连（不依赖 sqlsrv 扩展）
 */
function sqlmnger_try_mssql_tcp($conn) {
	require_once __DIR__ . '/tds/TdsClient.php';
	$host = isset($conn['host']) ? $conn['host'] : '127.0.0.1';
	$port = isset($conn['port']) ? intval($conn['port']) : 1433;
	if ($port <= 0) {
		$port = 1433;
	}
	$user = isset($conn['user']) ? $conn['user'] : '';
	$pass = isset($conn['password']) ? $conn['password'] : '';
	$db = isset($conn['database']) ? $conn['database'] : '';
	$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
	if ($cto < 1) {
		$cto = 8;
	}
	$opts = array(
		'encrypt' => sqlmnger_cfg('mssql_tcp_encrypt', 'auto'),
		'trustServerCertificate' => sqlmnger_cfg('mssql_tcp_trust_server_certificate', true),
	);
	// 连接级覆盖（登录 body 可选）
	if (isset($conn['encrypt']) && strval($conn['encrypt']) !== '') {
		$opts['encrypt'] = $conn['encrypt'];
	}
	if (array_key_exists('trust_server_certificate', $conn)) {
		$opts['trustServerCertificate'] = !!$conn['trust_server_certificate'];
	}
	$client = new SqlmngerTdsClient();
	$ok = $client->connect($host, $port, $user, $pass, $db, $cto * 1000, $opts);
	if (!$ok) {
		$msg = $client->getLastError();
		if ($msg === null || $msg === '') {
			$msg = 'TCP/TDS 连接失败';
		}
		$client->disconnect();
		return array('ok' => false, 'message' => $msg, 'server_version' => '', 'driver' => 'mssql_tcp');
	}
	$ver = '';
	$tls = $client->isTlsEnabled();
	$r = $client->execute('SELECT @@VERSION AS v');
	if (empty($r['error']) && !empty($r['rows']) && is_array($r['rows'][0])) {
		$row = $r['rows'][0];
		if (isset($row['v'])) {
			$ver = strval($row['v']);
		} else {
			// 取第一列
			foreach ($row as $k => $v) {
				$ver = strval($v);
				break;
			}
		}
		if (strlen($ver) > 120) {
			$ver = substr($ver, 0, 120) . '...';
		}
	}
	$client->disconnect();
	return array(
		'ok' => true,
		'message' => 'ok',
		'server_version' => $ver,
		'driver' => 'mssql_tcp',
		'tls' => $tls,
	);
}

/**
 * .NET 4.8 命令行 SqlmngerMsCli（Schannel，适合 PHP 5.5 远程加密）
 */
function sqlmnger_try_mssql_net($conn) {
	require_once __DIR__ . '/tds/MssqlNetClient.php';
	if (!SqlmngerMssqlNetClient::isAvailable()) {
		return array(
			'ok' => false,
			'message' => '未找到 bin/SqlmngerMsCli.exe（需 .NET Framework 4.8，Windows）',
			'server_version' => '',
			'driver' => 'mssql_net',
		);
	}
	$host = isset($conn['host']) ? $conn['host'] : '127.0.0.1';
	$port = isset($conn['port']) ? intval($conn['port']) : 1433;
	if ($port <= 0) {
		$port = 1433;
	}
	$user = isset($conn['user']) ? $conn['user'] : '';
	$pass = isset($conn['password']) ? $conn['password'] : '';
	$db = isset($conn['database']) ? $conn['database'] : '';
	$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
	if ($cto < 1) {
		$cto = 8;
	}
	$opts = array(
		'encrypt' => sqlmnger_cfg('mssql_tcp_encrypt', 'auto'),
		'trustServerCertificate' => sqlmnger_cfg('mssql_tcp_trust_server_certificate', true),
	);
	if (isset($conn['encrypt']) && strval($conn['encrypt']) !== '') {
		$opts['encrypt'] = $conn['encrypt'];
	}
	if (array_key_exists('trust_server_certificate', $conn)) {
		$opts['trustServerCertificate'] = !!$conn['trust_server_certificate'];
	}
	$client = new SqlmngerMssqlNetClient();
	$ok = $client->connect($host, $port, $user, $pass, $db, $cto * 1000, $opts);
	if (!$ok) {
		$msg = $client->getLastError();
		if ($msg === null || $msg === '') {
			$msg = '.NET CLI 连接失败';
		}
		$client->disconnect();
		return array('ok' => false, 'message' => $msg, 'server_version' => '', 'driver' => 'mssql_net');
	}
	$ver = $client->getServerVersion();
	$tls = $client->isTlsEnabled();
	$client->disconnect();
	return array(
		'ok' => true,
		'message' => 'ok',
		'server_version' => $ver !== null ? $ver : '',
		'driver' => 'mssql_net',
		'tls' => $tls,
	);
}

/**
 * 多连接会话（类似 Adminer：连接标识在 URL ?c=xxxx）
 * 结构：$_SESSION['sqlmnger_conns'][$connId] = 连接数据
 * 兼容旧版：自动迁移 sqlmnger_conn
 */

function sqlmnger_conns_init() {
	if (!isset($_SESSION['sqlmnger_conns']) || !is_array($_SESSION['sqlmnger_conns'])) {
		$_SESSION['sqlmnger_conns'] = array();
	}
	// 迁移旧单连接
	if (!empty($_SESSION['sqlmnger_conn']) && is_array($_SESSION['sqlmnger_conn'])) {
		$old = $_SESSION['sqlmnger_conn'];
		$cid = isset($old['id']) ? $old['id'] : sqlmnger_new_conn_id();
		$old['id'] = $cid;
		$_SESSION['sqlmnger_conns'][$cid] = $old;
		unset($_SESSION['sqlmnger_conn']);
	}
}

function sqlmnger_new_conn_id() {
	return substr(bin2hex(sqlmnger_random_bytes(8)), 0, 16);
}

/**
 * 从请求解析连接 ID：query c / conn_id，或 JSON body 同名字段
 */
function sqlmnger_request_conn_id() {
	if (isset($_GET['c']) && strval($_GET['c']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($_GET['c']));
	}
	if (isset($_GET['conn_id']) && strval($_GET['conn_id']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($_GET['conn_id']));
	}
	// multipart / form POST
	if (isset($_POST['c']) && strval($_POST['c']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($_POST['c']));
	}
	if (isset($_POST['conn_id']) && strval($_POST['conn_id']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($_POST['conn_id']));
	}
	// body 可能已读过：用全局缓存
	if (isset($GLOBALS['sqlmnger_json_body']) && is_array($GLOBALS['sqlmnger_json_body'])) {
		$body = $GLOBALS['sqlmnger_json_body'];
	} else {
		$body = sqlmnger_read_json_body();
		$GLOBALS['sqlmnger_json_body'] = $body;
	}
	if (isset($body['c']) && strval($body['c']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($body['c']));
	}
	if (isset($body['conn_id']) && strval($body['conn_id']) !== '') {
		return preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($body['conn_id']));
	}
	return '';
}

function sqlmnger_conn_get($connId) {
	sqlmnger_conns_init();
	if ($connId === '' || empty($_SESSION['sqlmnger_conns'][$connId])) {
		return null;
	}
	return $_SESSION['sqlmnger_conns'][$connId];
}

function sqlmnger_conn_set($connId, $data) {
	sqlmnger_conns_init();
	$data['id'] = $connId;
	$_SESSION['sqlmnger_conns'][$connId] = $data;
}

function sqlmnger_conn_remove($connId) {
	sqlmnger_conns_init();
	if ($connId !== '' && isset($_SESSION['sqlmnger_conns'][$connId])) {
		unset($_SESSION['sqlmnger_conns'][$connId]);
	}
}

/**
 * 当前请求对应的连接（需已 require_login）
 */
function sqlmnger_current_conn() {
	$id = sqlmnger_request_conn_id();
	return sqlmnger_conn_get($id);
}

/**
 * 当前会话连接信息（无密码明文）
 * @param string|null $connId 指定 ID；null 则从请求取
 */
function sqlmnger_session_public($connId = null) {
	if ($connId === null || $connId === '') {
		$connId = sqlmnger_request_conn_id();
	}
	$c = sqlmnger_conn_get($connId);
	if ($c === null) {
		return null;
	}
	return array(
		'id' => $connId,
		'driver' => isset($c['driver']) ? $c['driver'] : '',
		'host' => isset($c['host']) ? $c['host'] : '',
		'port' => isset($c['port']) ? $c['port'] : null,
		'database' => isset($c['database']) ? $c['database'] : '',
		'user' => isset($c['user']) ? $c['user'] : '',
		'path' => isset($c['path']) ? $c['path'] : '',
		'readonly' => !empty($c['readonly']),
		'server_version' => isset($c['server_version']) ? $c['server_version'] : '',
		'logged_in_at' => isset($c['logged_in_at']) ? $c['logged_in_at'] : null,
		// SQL Server TCP/TDS 是否 TLS 加密登录
		'tls' => !empty($c['tls']),
		'ssl' => !empty($c['tls']),
		'encrypt' => isset($c['encrypt']) ? $c['encrypt'] : '',
	);
}

/**
 * 要求 URL/请求带有效连接 ID（多 Tab 各自独立）
 */
function sqlmnger_require_login() {
	sqlmnger_session_start();
	sqlmnger_conns_init();
	$cid = sqlmnger_request_conn_id();
	if ($cid === '' || sqlmnger_conn_get($cid) === null) {
		sqlmnger_json_err('UNAUTHORIZED', '未登录或连接无效，请重新连接数据库（请检查 URL 参数 c）', 401, null);
	}
	// 兼容部分旧代码读 $_SESSION['sqlmnger_conn']
	$_SESSION['sqlmnger_conn'] = $_SESSION['sqlmnger_conns'][$cid];
}

function sqlmnger_enabled_drivers() {
	$cfg = sqlmnger_config();
	$list = isset($cfg['enabled_drivers']) ? $cfg['enabled_drivers'] : array('mysql', 'sqlite', 'sqlsrv');
	// 附带扩展探测
	$out = array();
	foreach ($list as $d) {
		$avail = false;
		$hint = '';
		if ($d === 'mysql') {
			$avail = extension_loaded('pdo_mysql');
			$hint = $avail ? 'pdo_mysql' : '缺少 pdo_mysql';
		} elseif ($d === 'sqlite') {
			$avail = extension_loaded('pdo_sqlite');
			$hint = $avail ? 'pdo_sqlite' : '缺少 pdo_sqlite';
		} elseif ($d === 'sqlsrv') {
			$avail = extension_loaded('sqlsrv');
			$hint = $avail ? 'sqlsrv' : '缺少 sqlsrv';
		} elseif ($d === 'mssql_tcp') {
			// 纯 TCP/TDS，仅需 stream_socket_client（PHP 核心）
			$avail = function_exists('stream_socket_client');
			$hint = $avail ? 'TCP/TDS' : '缺少 stream_socket_client';
		} elseif ($d === 'mssql_net') {
			require_once __DIR__ . '/tds/MssqlNetClient.php';
			$avail = SqlmngerMssqlNetClient::isAvailable();
			$hint = $avail ? '.NET 4.8 SqlClient' : '缺少 bin/SqlmngerMsCli.exe（Windows + .NET 4.8）';
		}
		$out[] = array(
			'id' => $d,
			'label' => sqlmnger_driver_label($d),
			'available' => $avail,
			'hint' => $hint,
		);
	}
	return $out;
}

function sqlmnger_driver_label($d) {
	if ($d === 'mysql') {
		return 'MySQL / MariaDB';
	}
	if ($d === 'sqlite') {
		return 'SQLite';
	}
	if ($d === 'sqlsrv') {
		return 'SQL Server (sqlsrv)';
	}
	if ($d === 'mssql_tcp') {
		return 'SQL Server (TCP/TDS)';
	}
	if ($d === 'mssql_net') {
		return 'SQL Server (.NET CLI)';
	}
	return $d;
}
