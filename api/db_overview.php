<?php
/**
 * 数据库概览：表和视图列表（引擎、校对、大小、行数等）
 * POST { database }
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
if ($db === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database', 400, null);
}

$h = sqlmnger_open_handle($db);
try {
	$tables = sqlmnger_db_overview_tables($h, $db);
	$pub = sqlmnger_session_public();
	sqlmnger_json_ok(array(
		'database' => $db,
		'tables' => $tables,
		'table_count' => count($tables),
		'connection' => $pub,
	));
} catch (Exception $e) {
	sqlmnger_json_err('ERR', $e->getMessage(), 500, null);
}
sqlmnger_close_handle($h);

/**
 * @return array
 */
function sqlmnger_db_overview_tables($h, $database) {
	$driver = $h['driver'];
	$out = array();

	if ($driver === 'mysql') {
		$sql = 'SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION,
			DATA_LENGTH, INDEX_LENGTH, TABLE_ROWS, AUTO_INCREMENT, TABLE_COMMENT
			FROM information_schema.TABLES
			WHERE TABLE_SCHEMA = ?
			ORDER BY TABLE_NAME';
		$r = sqlmnger_query_all($h, $sql, array($database));
		foreach ($r['rows'] as $row) {
			$isView = isset($row[1]) && stripos(strval($row[1]), 'VIEW') !== false;
			$out[] = array(
				'name' => $row[0],
				'type' => $isView ? 'view' : 'table',
				'engine' => $isView ? null : (isset($row[2]) ? $row[2] : null),
				'collation' => isset($row[3]) ? $row[3] : null,
				'data_length' => isset($row[4]) ? intval($row[4]) : null,
				'index_length' => isset($row[5]) ? intval($row[5]) : null,
				'rows_est' => isset($row[6]) ? intval($row[6]) : null,
				'auto_increment' => isset($row[7]) ? $row[7] : null,
				'comment' => isset($row[8]) ? $row[8] : null,
			);
		}
		return $out;
	}

	if ($driver === 'sqlite') {
		$r = sqlmnger_query_all($h,
			"SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
			array()
		);
		foreach ($r['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => (isset($row[1]) && $row[1] === 'view') ? 'view' : 'table',
				'engine' => null,
				'collation' => null,
				'data_length' => null,
				'index_length' => null,
				'rows_est' => null,
				'auto_increment' => null,
				'comment' => null,
			);
		}
		return $out;
	}

	// SQL Server dbo
	$sql = "SELECT t.name, 'table' AS typ, NULL AS eng,
		NULL AS col, NULL AS dlen, NULL AS ilen, NULL AS rows_est, NULL AS ai, NULL AS cmt
		FROM sys.tables t
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = 'dbo'
		UNION ALL
		SELECT v.name, 'view', NULL, NULL, NULL, NULL, NULL, NULL, NULL
		FROM sys.views v
		INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
		WHERE s.name = 'dbo'
		ORDER BY 1";
	// SQL Server UNION ALL + ORDER BY 列位置在部分版本 OK；若失败则分两次查
	try {
		$r = sqlmnger_query_all($h, $sql, array());
		foreach ($r['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => (isset($row[1]) && strval($row[1]) === 'view') ? 'view' : 'table',
				'engine' => null,
				'collation' => null,
				'data_length' => null,
				'index_length' => null,
				'rows_est' => null,
				'auto_increment' => null,
				'comment' => null,
			);
		}
	} catch (Exception $e) {
		$out = sqlmnger_list_tables($h, $database);
		// 规范字段
		$norm = array();
		foreach ($out as $t) {
			$norm[] = array(
				'name' => $t['name'],
				'type' => isset($t['type']) ? $t['type'] : 'table',
				'engine' => null,
				'collation' => null,
				'data_length' => null,
				'index_length' => null,
				'rows_est' => null,
				'auto_increment' => null,
				'comment' => null,
			);
		}
		return $norm;
	}
	return $out;
}
