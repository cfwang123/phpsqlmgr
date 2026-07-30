<?php
/**
 * POST { database, table, limit?, offset?, page?, where?, sort? }
 * 真实表数据：columns + rows[][] + primary_key + 分页元数据
 * where：可选条件片段（可不含 WHERE 关键字）
 * sort：服务端 ORDER BY，支持 "col:1,col2:-1" 或 [{name,dir}] 或 {keys:[...]}
 * limit 默认见 config default_table_limit（100000）；可用 page 代替 offset（1-based）
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
$table = isset($body['table']) ? trim(strval($body['table'])) : '';
// limit：缺省见 config default_table_limit；0 表示不限（仍受 unlimited_soft_max）
if (array_key_exists('limit', $body)) {
	$limit = intval($body['limit']);
} else {
	$limit = intval(sqlmnger_cfg('default_table_limit', 100000));
}
$maxFetch = intval(sqlmnger_cfg('max_fetch_rows', 1000000));
if ($maxFetch > 0 && $limit > $maxFetch) {
	$limit = $maxFetch;
}
$where = isset($body['where']) ? strval($body['where']) : '';
$sort = null;
if (array_key_exists('sort', $body)) {
	$sort = $body['sort'];
} elseif (array_key_exists('s', $body)) {
	$sort = $body['s'];
} elseif (array_key_exists('order', $body)) {
	$sort = $body['order'];
}
$offset = 0;
if (isset($body['offset'])) {
	$offset = intval($body['offset']);
} elseif (isset($body['page'])) {
	$page = intval($body['page']);
	if ($page < 1) {
		$page = 1;
	}
	// 不限时忽略 page，始终 offset=0
	if ($limit > 0) {
		$offset = ($page - 1) * $limit;
	} else {
		$offset = 0;
	}
}
// 兼容旧 demo 参数：无 table 时仍拒绝
if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);
$t0 = microtime(true);
$payload = sqlmnger_table_data_payload($h, $db, $table, $limit, $where, $offset, $sort);
$payload['elapsed_ms'] = (int) round((microtime(true) - $t0) * 1000);
$pub = sqlmnger_session_public(null);
$payload['connection'] = $pub;
$payload['readonly'] = $pub && !empty($pub['readonly']);
$payload['c'] = sqlmnger_request_conn_id();
sqlmnger_close_handle($h);

sqlmnger_json_ok($payload);
