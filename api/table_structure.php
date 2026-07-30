<?php
/**
 * POST { database, table }
 * 表结构 + 索引
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
$table = isset($body['table']) ? trim(strval($body['table'])) : '';
if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);
$st = sqlmnger_table_structure($h, $db, $table);
sqlmnger_close_handle($h);

sqlmnger_json_ok($st);
