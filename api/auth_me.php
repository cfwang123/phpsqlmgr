<?php
/**
 * GET/POST 当前连接状态
 * 查询参数或 body：c=连接ID（多 Tab 必需）
 * 无 c 或 c 无效 → logged_in=false（本 Tab 显示登录页，其它 Tab 不受影响）
 */
require_once __DIR__ . '/_bootstrap.php';

// 启动页会立刻打本接口：必须快返回。读完 session 立即释放文件锁，
// 避免与 auth_login 连库（可数十秒）互相阻塞导致前端白屏 2 分钟。
@set_time_limit(15);
sqlmnger_session_start();
sqlmnger_conns_init();

$cfg = sqlmnger_config();
$cid = sqlmnger_request_conn_id();
$pub = ($cid !== '') ? sqlmnger_session_public($cid) : null;
$activeCount = isset($_SESSION['sqlmnger_conns']) && is_array($_SESSION['sqlmnger_conns'])
	? count($_SESSION['sqlmnger_conns']) : 0;
$drivers = sqlmnger_enabled_drivers();

// 本接口不再写 session，尽早放锁
sqlmnger_session_close();

sqlmnger_json_ok(array(
	'logged_in' => ($pub !== null),
	'conn_id' => $cid,
	'c' => $cid,
	'connection' => $pub,
	'drivers' => $drivers,
	'app' => array(
		'name' => isset($cfg['app_name']) ? $cfg['app_name'] : 'sqlmnger',
		'version' => isset($cfg['app_version']) ? $cfg['app_version'] : '',
	),
	// 前端可读的非敏感系统参数（不含 app_key）
	'limits' => array(
		'default_table_limit' => intval(sqlmnger_cfg('default_table_limit', 2000)),
		'default_sql_limit' => intval(sqlmnger_cfg('default_sql_limit', 0)),
		'max_fetch_rows' => intval(sqlmnger_cfg('max_fetch_rows', 1000000)),
	),
	/** 是否允许 MySQL/SQL Server 空密码登录 */
	'allow_empty_password' => !!sqlmnger_cfg('allow_empty_password', true),
	'sqlite_root_hint' => '相对路径相对于 storage/sqlite；也可用 jail 内绝对路径',
	'php' => PHP_VERSION,
	'debug' => !empty($cfg['debug']),
	'crypto' => array(
		'openssl' => function_exists('openssl_encrypt'),
		'vault' => function_exists('openssl_encrypt') ? 'aes-256-cbc' : 'hmac-xor-fallback',
	),
	// 当前 PHP Session 内仍存活的连接数（不含密码）
	'active_conn_count' => $activeCount,
));
