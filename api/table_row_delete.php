<?php
/**
 * POST 删除行（支持多行）
 * { "database", "table", "keys_list": [ {"id":1}, {"id":2} ] }
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
$keysList = isset($body['keys_list']) && is_array($body['keys_list']) ? $body['keys_list'] : array();

if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}
if (count($keysList) < 1) {
	sqlmnger_json_err('NO_KEY', '请选择要删除的行', 400, null);
}

$h = sqlmnger_open_handle($db);
$st = sqlmnger_table_structure($h, $db, $table);
$pk = $st['primary_key'];
if (count($pk) < 1) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('NO_PK', '表无主键，禁止表单删除', 409, null);
}

// 规范化 keys_list：只保留主键字段
$safeList = array();
foreach ($keysList as $keys) {
	if (!is_array($keys)) {
		continue;
	}
	$one = array();
	$ok = true;
	foreach ($pk as $p) {
		if (!array_key_exists($p, $keys)) {
			$ok = false;
			break;
		}
		$one[$p] = $keys[$p];
	}
	if ($ok) {
		$safeList[] = $one;
	}
}
if (count($safeList) < 1) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('BAD_KEY', '主键不完整', 400, null);
}

$res = sqlmnger_delete_rows($h, $db, $table, $safeList);
sqlmnger_close_handle($h);
sqlmnger_json_ok(array(
	'affected' => $res['affected'],
	'count' => count($safeList),
));
