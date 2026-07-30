<?php
/**
 * GET/POST 列出数据库
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$h = sqlmnger_open_handle(null);
try {
	$list = sqlmnger_list_databases($h);
	$pub = sqlmnger_session_public();
	$current = $pub && isset($pub['database']) ? $pub['database'] : '';
	sqlmnger_json_ok(array(
		'databases' => $list,
		'current' => $current,
		'connection' => $pub,
	));
} catch (Exception $e) {
	sqlmnger_json_err('ERR', $e->getMessage(), 500, null);
}
sqlmnger_close_handle($h);
