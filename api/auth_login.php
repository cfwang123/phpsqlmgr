<?php
/**
 * POST JSON 登录/连接数据库
 * 成功返回 conn id，前端写入 URL ?c=xxxx（多 Tab 可各自连不同库）
 */
require_once __DIR__ . '/_bootstrap.php';

sqlmnger_session_start();
sqlmnger_conns_init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sqlmnger_json_err('METHOD', '请使用 POST', 405, null);
}

sqlmnger_login_rate_check();

$body = sqlmnger_read_json_body();
$driver = isset($body['driver']) ? strtolower(trim(strval($body['driver']))) : '';

$enabled = array();
foreach (sqlmnger_enabled_drivers() as $d) {
	$enabled[$d['id']] = $d;
}
if ($driver === '' || !isset($enabled[$driver])) {
	sqlmnger_login_rate_fail();
	sqlmnger_json_err('BAD_DRIVER', '请选择有效的数据库引擎', 400, null);
}
if (empty($enabled[$driver]['available'])) {
	sqlmnger_login_rate_fail();
	sqlmnger_json_err('DRIVER_UNAVAILABLE', '当前 PHP 环境未启用该引擎扩展: ' . $enabled[$driver]['hint'], 400, null);
}

// encrypt：登录页「强制 SSL」→ require；未勾选可不传（用 config auto/disable）
$encrypt = '';
if (isset($body['encrypt']) && strval($body['encrypt']) !== '') {
	$encrypt = strtolower(trim(strval($body['encrypt'])));
} elseif (!empty($body['force_ssl']) || !empty($body['forceSsl'])) {
	$encrypt = 'require';
}
if ($encrypt !== '' && $encrypt !== 'auto' && $encrypt !== 'require' && $encrypt !== 'disable') {
	$encrypt = '';
}

$conn = array(
	'driver' => $driver,
	'host' => isset($body['host']) ? trim(strval($body['host'])) : '127.0.0.1',
	'port' => isset($body['port']) ? intval($body['port']) : 0,
	'database' => isset($body['database']) ? trim(strval($body['database'])) : '',
	'user' => isset($body['user']) ? strval($body['user']) : '',
	'password' => isset($body['password']) ? strval($body['password']) : '',
	'path' => isset($body['path']) ? trim(strval($body['path'])) : '',
	'readonly' => !empty($body['readonly']),
);
if ($encrypt !== '') {
	$conn['encrypt'] = $encrypt;
}

if ($driver === 'mysql') {
	if ($conn['host'] === '') {
		$conn['host'] = '127.0.0.1';
	}
	if ($conn['port'] <= 0) {
		$conn['port'] = 3306;
	}
}
if ($driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') {
	if ($conn['host'] === '') {
		$conn['host'] = '127.0.0.1';
	}
	if ($conn['port'] <= 0) {
		$conn['port'] = 1433;
	}
}

// 空密码策略（仅网络库账号；SQLite 无密码）
if (($driver === 'mysql' || $driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') && $conn['password'] === '') {
	if (!sqlmnger_cfg('allow_empty_password', true)) {
		sqlmnger_login_rate_fail();
		sqlmnger_json_err(
			'EMPTY_PASSWORD',
			'当前配置禁止空密码登录（config allow_empty_password=false）',
			400,
			null
		);
	}
}

// 连库可能很慢（SQL Server TLS 等）：先放掉 session 文件锁，避免卡住其它 Tab 的 auth_me
$connsEmpty = empty($_SESSION['sqlmnger_conns']) || count($_SESSION['sqlmnger_conns']) === 0;
sqlmnger_session_close();

$result = sqlmnger_try_connect($conn);
if (empty($result['ok'])) {
	sqlmnger_session_start();
	sqlmnger_conns_init();
	sqlmnger_login_rate_fail();
	$cfg = sqlmnger_config();
	$detail = !empty($cfg['debug']) ? $result['message'] : null;
	sqlmnger_json_err('CONNECT_FAILED', '无法连接数据库，请检查引擎、地址与账号密码', 401, $detail);
}

if ($driver === 'sqlite' && !empty($result['resolved_path'])) {
	$conn['path'] = $result['resolved_path'];
}

$passEnc = sqlmnger_vault_encrypt($conn['password']);
if ($passEnc === false) {
	sqlmnger_json_err('VAULT', '凭证加密失败', 500, null);
}

// 写回 session
sqlmnger_session_start();
sqlmnger_conns_init();

// 仅在尚无任何连接时再生 session id，避免踢掉其它 Tab 的连接
if ($connsEmpty && count($_SESSION['sqlmnger_conns']) === 0 && function_exists('session_regenerate_id')) {
	@session_regenerate_id(true);
}

// 可复用 URL 传入的 c（同 Tab 重连），否则新建
$cid = '';
if (isset($body['c']) && strval($body['c']) !== '') {
	$cid = preg_replace('/[^a-zA-Z0-9_\-]/', '', strval($body['c']));
}
if ($cid === '') {
	$cid = sqlmnger_new_conn_id();
}

$tlsOn = !empty($result['tls']);
// 仅 SQL Server TDS / .NET CLI 报告 TLS
if ($driver !== 'mssql_tcp' && $driver !== 'mssql_net') {
	$tlsOn = false;
}
$row = array(
	'id' => $cid,
	'driver' => $conn['driver'],
	'host' => $conn['host'],
	'port' => $conn['port'],
	'database' => $conn['database'],
	'user' => $conn['user'],
	'password_enc' => $passEnc,
	'path' => $conn['path'],
	'readonly' => $conn['readonly'],
	'server_version' => isset($result['server_version']) ? $result['server_version'] : '',
	'logged_in_at' => date('c'),
	'tls' => $tlsOn,
	'encrypt' => isset($conn['encrypt']) ? $conn['encrypt'] : '',
);
sqlmnger_conn_set($cid, $row);

sqlmnger_login_rate_clear();

sqlmnger_audit('login', array(
	'driver' => $driver,
	'host' => $conn['host'],
	'port' => $conn['port'],
	'user' => $conn['user'],
	'database' => $conn['database'],
	'path' => $driver === 'sqlite' ? $conn['path'] : '',
	'readonly' => !empty($conn['readonly']),
	'tls' => $tlsOn,
	'encrypt' => isset($conn['encrypt']) ? $conn['encrypt'] : '',
	'conn_id' => $cid,
));

sqlmnger_json_ok(array(
	'conn_id' => $cid,
	'c' => $cid,
	'connection' => sqlmnger_session_public($cid),
	'drivers' => sqlmnger_enabled_drivers(),
));
