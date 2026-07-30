<?php
/**
 * POST 索引操作
 * { "action": "create"|"drop", "database", "table", "name", "columns":[], "unique": false }
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
sqlmnger_require_not_readonly();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sqlmnger_json_err('METHOD', '请使用 POST', 405, null);
}

$body = sqlmnger_read_json_body();
$action = isset($body['action']) ? strtolower(trim(strval($body['action']))) : '';
$db = sqlmnger_req_database($body);
$table = isset($body['table']) ? trim(strval($body['table'])) : '';
$name = isset($body['name']) ? trim(strval($body['name'])) : '';

if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);
if ($action === 'drop') {
	sqlmnger_drop_index($h, $db, $table, $name);
	$st = sqlmnger_table_structure($h, $db, $table);
	sqlmnger_close_handle($h);
	sqlmnger_json_ok(array('ok' => true, 'action' => 'drop', 'structure' => $st));
}

if ($action === 'create') {
	$cols = isset($body['columns']) && is_array($body['columns']) ? $body['columns'] : array();
	$unique = !empty($body['unique']);
	sqlmnger_create_index($h, $db, $table, $name, $cols, $unique);
	$st = sqlmnger_table_structure($h, $db, $table);
	sqlmnger_close_handle($h);
	sqlmnger_json_ok(array('ok' => true, 'action' => 'create', 'structure' => $st));
}

sqlmnger_close_handle($h);
sqlmnger_json_err('BAD_ACTION', 'action 必须是 create 或 drop', 400, null);
