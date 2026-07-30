<?php
/**
 * 列结构编辑
 * POST {
 *   action: modify|add|drop|apply|preview,
 *   database, table,
 *   // 单列：name, type?, nullable?, default?, comment?, new_name?
 *   // apply/preview 批量：columns[], drops[]
 *   // preview：只生成 SQL，不写库
 * }
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
if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}

$h = sqlmnger_open_handle($db);

if ($action === 'modify') {
	sqlmnger_column_modify($h, $db, $table, $body);
	$st = sqlmnger_table_structure($h, $db, $table);
	sqlmnger_close_handle($h);
	sqlmnger_audit('table_column', array('action' => 'modify', 'database' => $db, 'table' => $table));
	sqlmnger_json_ok(array('action' => 'modify', 'structure' => $st));
}

if ($action === 'add') {
	sqlmnger_column_add($h, $db, $table, $body);
	$st = sqlmnger_table_structure($h, $db, $table);
	sqlmnger_close_handle($h);
	sqlmnger_audit('table_column', array('action' => 'add', 'database' => $db, 'table' => $table));
	sqlmnger_json_ok(array('action' => 'add', 'structure' => $st));
}

if ($action === 'drop') {
	$name = isset($body['name']) ? $body['name'] : '';
	sqlmnger_column_drop($h, $db, $table, $name);
	$st = sqlmnger_table_structure($h, $db, $table);
	sqlmnger_close_handle($h);
	sqlmnger_audit('table_column', array('action' => 'drop', 'database' => $db, 'table' => $table, 'name' => $name));
	sqlmnger_json_ok(array('action' => 'drop', 'structure' => $st));
}

// 预览 SQL：不写库
if ($action === 'preview') {
	try {
		$result = sqlmnger_column_build_batch_sqls($h, $db, $table, $body);
		sqlmnger_close_handle($h);
		if (!empty($result['blocked'])) {
			sqlmnger_json_ok(array(
				'action' => 'preview',
				'blocked' => true,
				'block_code' => isset($result['block_code']) ? $result['block_code'] : 'PK_DEPENDENCY',
				'message' => isset($result['message']) ? $result['message'] : '',
				'affected_columns' => isset($result['affected_columns']) ? $result['affected_columns'] : array(),
				'deps' => isset($result['deps']) ? $result['deps'] : array(),
				'plan' => isset($result['plan']) ? $result['plan'] : array(),
				'can_auto_handle' => !empty($result['can_auto_handle']),
				'auto_sql' => isset($result['auto_sql']) ? $result['auto_sql'] : '',
				'auto_statements' => isset($result['auto_statements']) ? $result['auto_statements'] : array(),
				'preview' => $result,
				'sql' => isset($result['auto_sql']) ? $result['auto_sql'] : '',
				'statement_count' => isset($result['auto_statements']) ? count($result['auto_statements']) : 0,
			));
		}
		$stmts = isset($result['statements']) ? $result['statements'] : array();
		$sqlText = '';
		foreach ($stmts as $i => $s) {
			$sqlText .= rtrim($s, "; \t\r\n") . ";\n";
		}
		sqlmnger_json_ok(array(
			'action' => 'preview',
			'preview' => $result,
			'sql' => $sqlText,
			'statement_count' => count($stmts),
		));
	} catch (Exception $e) {
		sqlmnger_close_handle($h);
		sqlmnger_json_err('ERR', $e->getMessage(), 400, null);
	}
}

// 一次性提交：列增删改 + 顺序
if ($action === 'apply') {
	try {
		$result = sqlmnger_column_apply_batch($h, $db, $table, $body);
		if (!empty($result['blocked'])) {
			sqlmnger_close_handle($h);
			sqlmnger_json_ok(array(
				'action' => 'apply',
				'blocked' => true,
				'block_code' => isset($result['block_code']) ? $result['block_code'] : 'PK_DEPENDENCY',
				'message' => isset($result['message']) ? $result['message'] : '',
				'affected_columns' => isset($result['affected_columns']) ? $result['affected_columns'] : array(),
				'deps' => isset($result['deps']) ? $result['deps'] : array(),
				'plan' => isset($result['plan']) ? $result['plan'] : array(),
				'can_auto_handle' => !empty($result['can_auto_handle']),
				'auto_sql' => isset($result['auto_sql']) ? $result['auto_sql'] : '',
				'auto_statements' => isset($result['auto_statements']) ? $result['auto_statements'] : array(),
				'applied' => $result,
			));
		}
		$st = sqlmnger_table_structure($h, $db, $table);
		sqlmnger_close_handle($h);
		sqlmnger_json_ok(array(
			'action' => 'apply',
			'structure' => $st,
			'applied' => $result,
		));
	} catch (Exception $e) {
		sqlmnger_close_handle($h);
		sqlmnger_json_err('ERR', $e->getMessage(), 400, null);
	}
}

sqlmnger_close_handle($h);
sqlmnger_json_err('BAD_ACTION', 'action 必须是 modify / add / drop / apply / preview', 400, null);
