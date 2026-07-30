<?php
/**
 * POST 注销：仅移除当前 URL 对应连接（不影响其它 Tab）
 * body/query: c 或 conn_id
 */
require_once __DIR__ . '/_bootstrap.php';

sqlmnger_session_start();
sqlmnger_conns_init();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
	sqlmnger_json_err('METHOD', '请使用 POST', 405, null);
}

$cid = sqlmnger_request_conn_id();
if ($cid !== '') {
	sqlmnger_audit('logout', array('conn_id' => $cid));
	sqlmnger_conn_remove($cid);
}
// 清理兼容字段
if (isset($_SESSION['sqlmnger_conn']) && is_array($_SESSION['sqlmnger_conn'])
	&& isset($_SESSION['sqlmnger_conn']['id']) && $_SESSION['sqlmnger_conn']['id'] === $cid) {
	unset($_SESSION['sqlmnger_conn']);
}

sqlmnger_json_ok(array(
	'logged_out' => true,
	'c' => $cid,
	'remaining' => count($_SESSION['sqlmnger_conns']),
));
