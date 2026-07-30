<?php
/**
 * POST 插入行
 * { "database", "table", "set": { "col": "val", ... } }
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
$set = isset($body['set']) && is_array($body['set']) ? $body['set'] : array();

if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);
$st = sqlmnger_table_structure($h, $db, $table);
$allowed = array();
foreach ($st['columns'] as $c) {
	$allowed[$c['name']] = true;
}

$safeSet = array();
foreach ($set as $k => $v) {
	if (!isset($allowed[$k])) {
		continue;
	}
	// 空字符串对非字符串列可仍提交，由引擎转换
	if ($v === '') {
		// 跳过空，让 DEFAULT/NULL 生效；若全空则下面补一列
		continue;
	}
	$safeSet[$k] = $v;
}

// 若用户未填任何值：找一个可空或有默认的列插入 NULL，或用第一个非 PK 列空串
if (count($safeSet) < 1) {
	$pk = $st['primary_key'];
	$picked = null;
	foreach ($st['columns'] as $c) {
		if (in_array($c['name'], $pk, true)) {
			continue;
		}
		$picked = $c['name'];
		if (!empty($c['nullable'])) {
			$safeSet[$picked] = null;
			break;
		}
	}
	if (count($safeSet) < 1 && $picked) {
		$safeSet[$picked] = '';
	}
	if (count($safeSet) < 1) {
		// 仅有自增主键时：INSERT 空列列表 — MySQL 可用 DEFAULT
		$driver = $h['driver'];
		$qTable = sqlmnger_ident_quote($driver, $table);
		if ($driver === 'mysql') {
			sqlmnger_exec($h, 'INSERT INTO ' . $qTable . ' () VALUES ()', array());
			$lastId = null;
			try {
				$lastId = $h['handle']->lastInsertId();
			} catch (Exception $e) {
				$lastId = null;
			}
			sqlmnger_close_handle($h);
			sqlmnger_json_ok(array('last_insert_id' => $lastId, 'set' => array()));
		}
		sqlmnger_close_handle($h);
		sqlmnger_json_err('NO_SET', '无法构造空插入，请至少提供一个字段值', 400, null);
	}
}

$res = sqlmnger_insert_row($h, $db, $table, $safeSet);
sqlmnger_close_handle($h);
sqlmnger_json_ok(array(
	'last_insert_id' => $res['last_insert_id'],
	'set' => $safeSet,
));
