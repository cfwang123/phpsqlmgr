<?php
/**
 * POST 行内编辑提交
 * {
 *   "database": "...",
 *   "table": "...",
 *   "keys": { "id": 1 },
 *   "set": { "name": "x" }
 * }
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
sqlmnger_require_not_readonly();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sqlmnger_json_err('METHOD', '请使用 POST', 405, null);
}

$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
$table = isset($body['table']) ? trim(strval($body['table'])) : '';
$keys = isset($body['keys']) && is_array($body['keys']) ? $body['keys'] : array();
$set = isset($body['set']) && is_array($body['set']) ? $body['set'] : array();

if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);
// 校验列名来自结构，防止乱写
$st = sqlmnger_table_structure($h, $db, $table);
$allowed = array();
foreach ($st['columns'] as $c) {
	$allowed[$c['name']] = true;
}
$pk = $st['primary_key'];
if (count($pk) < 1) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('NO_PK', '表无主键，禁止表单更新（请用 SQL）', 409, null);
}

// keys 必须覆盖全部主键
foreach ($pk as $p) {
	if (!array_key_exists($p, $keys)) {
		sqlmnger_close_handle($h);
		sqlmnger_json_err('BAD_KEY', '主键不完整: ' . $p, 400, null);
	}
}

$safeSet = array();
foreach ($set as $k => $v) {
	if (!isset($allowed[$k])) {
		continue;
	}
	// 不允许改主键列（简化）
	if (in_array($k, $pk, true)) {
		continue;
	}
	$safeSet[$k] = $v;
}
if (count($safeSet) < 1) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('NO_SET', '没有可更新字段', 400, null);
}

$safeKeys = array();
foreach ($pk as $p) {
	$safeKeys[$p] = $keys[$p];
}

$res = sqlmnger_update_row($h, $db, $table, $safeKeys, $safeSet);
sqlmnger_close_handle($h);

if (intval($res['affected']) === 0) {
	sqlmnger_json_err('NO_ROW', '未更新任何行（主键不匹配或值未变）', 409, null);
}

sqlmnger_audit('table_row_save', array(
	'database' => $db,
	'table' => $table,
	'affected' => intval($res['affected']),
));

sqlmnger_json_ok(array(
	'affected' => $res['affected'],
	'keys' => $safeKeys,
	'set' => $safeSet,
));
