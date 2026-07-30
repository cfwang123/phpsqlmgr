<?php
/**
 * POST { "database": "..." } 列出表
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
if ($db === '') {
	sqlmnger_json_err('NO_DB', '请先选择数据库', 400, null);
}

$h = sqlmnger_open_handle($db);
$tables = sqlmnger_list_tables($h, $db);
sqlmnger_close_handle($h);

sqlmnger_json_ok(array(
	'database' => $db,
	'tables' => $tables,
	'connection' => sqlmnger_session_public(),
));
