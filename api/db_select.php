<?php
/**
 * POST { "database": "name" } 切换当前库（写入 Session）
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sqlmnger_json_err('METHOD', '请使用 POST', 405, null);
}

$body = sqlmnger_read_json_body();
$db = isset($body['database']) ? trim(strval($body['database'])) : '';
if ($db === '' && isset($body['db'])) {
	$db = trim(strval($body['db']));
}
if ($db === '') {
	sqlmnger_json_err('BAD_DB', '请指定 database', 400, null);
}

// 验证库存在并可连接
$h = sqlmnger_open_handle($db);
$list = sqlmnger_list_databases($h);
sqlmnger_close_handle($h);

$cid = sqlmnger_request_conn_id();
$row = sqlmnger_conn_get($cid);
if ($row === null) {
	sqlmnger_json_err('UNAUTHORIZED', '连接无效', 401, null);
}
$driver = isset($row['driver']) ? $row['driver'] : '';
if ($driver !== 'sqlite') {
	$ok = false;
	foreach ($list as $n) {
		if (strval($n) === $db) {
			$ok = true;
			break;
		}
	}
	if (!$ok) {
		sqlmnger_json_err('NOT_FOUND', '数据库不存在或无权访问: ' . $db, 404, null);
	}
}

$row['database'] = $db;
sqlmnger_conn_set($cid, $row);
$_SESSION['sqlmnger_conn'] = $row;

sqlmnger_json_ok(array(
	'connection' => sqlmnger_session_public($cid),
	'databases' => $list,
	'current' => $db,
	'c' => $cid,
));
