<?php
/**
 * 执行 SQL（管理端）
 * POST { database?, sql, limit? }
 * - 支持分号分隔的多条语句（应用层拆分，逐条执行，非 PDO 原生 multi）
 * - SELECT / SHOW / DESCRIBE / EXPLAIN / WITH / PRAGMA / VALUES → 返回 columns + rows（可选 limit；0/缺省且配置为 0 则不自动加 LIMIT）
 * - 其它语句 → 需非只读，返回 affected
 * - 单条：兼容旧响应 { kind: query|exec, ... }
 * - 多条：{ kind: batch, results: [...], ok, fail, count, ... }；遇错停止
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$sql = isset($body['sql']) ? trim(strval($body['sql'])) : '';
// limit：缺省见 config default_sql_limit；0 = 不限（查询时不加 TOP/LIMIT）
if (array_key_exists('limit', $body)) {
	$limit = intval($body['limit']);
} else {
	$limit = intval(sqlmnger_cfg('default_sql_limit', 0));
}
if ($limit < 0) {
	$limit = 0;
}
$maxFetch = intval(sqlmnger_cfg('max_fetch_rows', 1000000));
if ($maxFetch > 0 && $limit > $maxFetch) {
	$limit = $maxFetch;
}
if ($sql === '') {
	sqlmnger_json_err('BAD_REQ', '请输入 SQL', 400, null);
}

// 应用层拆分多语句（尊重引号/注释/DELIMITER）
$rawStmts = sqlmnger_split_sql_script($sql);
$stmts = array();
foreach ($rawStmts as $s) {
	$s = trim(strval($s));
	if ($s === '' || $s === ';') {
		continue;
	}
	// 跳过纯 DELIMITER 指令
	if (preg_match('/^DELIMITER\b/i', $s)) {
		continue;
	}
	$stmts[] = $s;
}
if (count($stmts) < 1) {
	sqlmnger_json_err('BAD_REQ', '请输入 SQL', 400, null);
}

$maxStmts = intval(sqlmnger_cfg('sql_exec_max_statements', 200));
if ($maxStmts > 0 && count($stmts) > $maxStmts) {
	sqlmnger_json_err('TOO_MANY', '语句数超过限制（' . $maxStmts . '）', 400, null);
}

// 危险语句：需二次确认（confirm_dangerous）
$dangers = sqlmnger_sql_collect_dangers($stmts);
$needConfirm = sqlmnger_cfg('sql_require_danger_confirm', true);
$confirmed = !empty($body['confirm_dangerous']) || !empty($body['confirmDangerous']);
if ($needConfirm && count($dangers) > 0 && !$confirmed) {
	sqlmnger_audit('sql_danger_blocked', array(
		'database' => isset($body['database']) ? $body['database'] : '',
		'dangers' => $dangers,
	));
	sqlmnger_json_err(
		'DANGEROUS_SQL',
		'检测到危险语句，请确认后重试',
		400,
		array(
			'dangers' => $dangers,
			'need_confirm' => true,
		)
	);
}

// 任一写语句则要求非只读
$hasExec = false;
foreach ($stmts as $s) {
	if (sqlmnger_sql_kind($s) === 'exec') {
		$hasExec = true;
		break;
	}
}
if ($hasExec) {
	sqlmnger_require_not_readonly();
}

$db = sqlmnger_req_database($body);
$h = sqlmnger_open_handle($db !== '' ? $db : null);

$started = microtime(true);
$results = array();
$fail = 0;
$failMsg = null;
$failDetail = null;
$failIndex = 0;

foreach ($stmts as $idx => $one) {
	$n = $idx + 1;
	$kind = sqlmnger_sql_kind($one);
	$t0 = microtime(true);
	if ($kind === 'query') {
		$runSql = sqlmnger_sql_apply_row_limit($h['driver'], $one, $limit);
		$r = sqlmnger_sql_try_query($h, $runSql);
		$ms = (int) round((microtime(true) - $t0) * 1000);
		if (!$r['ok']) {
			$fail = 1;
			$failIndex = $n;
			$failMsg = '第 ' . $n . ' 条语句查询失败';
			$failDetail = $r['message'];
			$results[] = array(
				'index' => $n,
				'kind' => 'query',
				'ok' => false,
				'message' => $r['message'],
				'sql' => $one,
				'preview' => sqlmnger_sql_stmt_preview($one),
				'elapsed_ms' => $ms,
			);
			break;
		}
		$results[] = array(
			'index' => $n,
			'kind' => 'query',
			'ok' => true,
			'columns' => $r['columns'],
			'rows' => $r['rows'],
			'total' => count($r['rows']),
			'sql' => $one,
			'preview' => sqlmnger_sql_stmt_preview($one),
			'limit' => $limit,
			'elapsed_ms' => $ms,
		);
	} else {
		$r = sqlmnger_sql_try_exec($h, $one);
		$ms = (int) round((microtime(true) - $t0) * 1000);
		if (!$r['ok']) {
			$fail = 1;
			$failIndex = $n;
			$failMsg = '第 ' . $n . ' 条语句执行失败';
			$failDetail = $r['message'];
			$results[] = array(
				'index' => $n,
				'kind' => 'exec',
				'ok' => false,
				'message' => $r['message'],
				'sql' => $one,
				'preview' => sqlmnger_sql_stmt_preview($one),
				'elapsed_ms' => $ms,
			);
			break;
		}
		$results[] = array(
			'index' => $n,
			'kind' => 'exec',
			'ok' => true,
			'affected' => $r['affected'],
			'sql' => $one,
			'preview' => sqlmnger_sql_stmt_preview($one),
			'elapsed_ms' => $ms,
		);
	}
}

$totalMs = (int) round((microtime(true) - $started) * 1000);
sqlmnger_close_handle($h);

// 审计（SQL 正文截断，不记过大 payload）
$auditSql = preg_replace('/\s+/', ' ', $sql);
if (function_exists('mb_substr') && mb_strlen($auditSql, 'UTF-8') > 500) {
	$auditSql = mb_substr($auditSql, 0, 500, 'UTF-8') . '…';
} elseif (strlen($auditSql) > 500) {
	$auditSql = substr($auditSql, 0, 500) . '…';
}
sqlmnger_audit('sql_exec', array(
	'database' => $db,
	'stmt_count' => count($stmts),
	'fail' => $fail,
	'elapsed_ms' => $totalMs,
	'dangerous' => count($dangers) > 0,
	'danger_flags' => $dangers,
	'sql_preview' => $auditSql,
));

// 失败：若已有成功语句，仍返回 batch 供前端展示部分结果；纯失败则 json_err
if ($fail) {
	$okCount = 0;
	foreach ($results as $rr) {
		if (!empty($rr['ok'])) {
			$okCount++;
		}
	}
	// 单条且无成功：保持旧错误形态
	if (count($stmts) === 1 && $okCount === 0) {
		sqlmnger_json_err('SQL', $failMsg, 400, $failDetail);
	}
	// 多条：返回 batch（含错误条），HTTP 200 但 fail>0；前端根据 fail 展示
	sqlmnger_json_ok(array(
		'kind' => 'batch',
		'count' => count($stmts),
		'ok' => $okCount,
		'fail' => $fail,
		'stopped' => true,
		'fail_index' => $failIndex,
		'message' => $failMsg . ($failDetail ? (' — ' . $failDetail) : ''),
		'elapsed_ms' => $totalMs,
		'database' => $db,
		'limit' => $limit,
		'results' => $results,
	));
}

// 单条成功：兼容旧响应
if (count($results) === 1) {
	$one = $results[0];
	if ($one['kind'] === 'query') {
		sqlmnger_json_ok(array(
			'kind' => 'query',
			'columns' => $one['columns'],
			'rows' => $one['rows'],
			'total' => $one['total'],
			'sql' => $one['sql'],
			'limit' => $limit,
			'elapsed_ms' => $totalMs,
			'database' => $db,
		));
	}
	sqlmnger_json_ok(array(
		'kind' => 'exec',
		'affected' => $one['affected'],
		'sql' => $one['sql'],
		'elapsed_ms' => $totalMs,
		'database' => $db,
	));
}

// 多条全部成功
sqlmnger_json_ok(array(
	'kind' => 'batch',
	'count' => count($stmts),
	'ok' => count($results),
	'fail' => 0,
	'stopped' => false,
	'elapsed_ms' => $totalMs,
	'database' => $db,
	'limit' => $limit,
	'results' => $results,
));

/**
 * @return string query|exec
 */
function sqlmnger_sql_kind($sql) {
	$s = ltrim($sql);
	// 去掉前导注释
	while (true) {
		if (preg_match('/^--[^\n]*\n/s', $s, $m)) {
			$s = substr($s, strlen($m[0]));
			$s = ltrim($s);
			continue;
		}
		if (preg_match('/^\/\*.*?\*\//s', $s, $m)) {
			$s = substr($s, strlen($m[0]));
			$s = ltrim($s);
			continue;
		}
		break;
	}
	if (preg_match('/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH|PRAGMA|VALUES)\b/i', $s)) {
		return 'query';
	}
	return 'exec';
}

/**
 * 为 SELECT 类语句附加行数上限（已有 LIMIT/TOP/FETCH 则不改）
 * SQL Server 用 TOP，避免 OFFSET 兼容问题
 */
function sqlmnger_sql_apply_row_limit($driver, $sql, $limit) {
	$limit = intval($limit);
	if ($limit <= 0) {
		return $sql; // 0 = 不限
	}
	if (preg_match('/\bLIMIT\s+\d+/i', $sql)) {
		return $sql;
	}
	if (preg_match('/\bFETCH\s+(FIRST|NEXT)\s+/i', $sql)) {
		return $sql;
	}
	if (preg_match('/^\s*SELECT\s+TOP\s+/i', $sql)) {
		return $sql;
	}
	// SHOW / DESCRIBE 等一般无需 limit
	if (!preg_match('/^\s*(SELECT|WITH)\b/i', ltrim($sql))) {
		return $sql;
	}
	if ($driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') {
		// SELECT / SELECT DISTINCT 后插入 TOP n（2000+ 兼容，不用 OFFSET）
		$out = preg_replace(
			'/^(\s*SELECT\s+)(DISTINCT\s+)?/i',
			'$1$2TOP ' . $limit . ' ',
			$sql,
			1,
			$count
		);
		if ($count > 0) {
			return $out;
		}
		return $sql;
	}
	if (sqlmnger_is_oracle_family($driver)) {
		// Oracle 12c+：FETCH FIRST；勿套 TOP / LIMIT
		return $sql . ' FETCH FIRST ' . $limit . ' ROWS ONLY';
	}
	return $sql . ' LIMIT ' . $limit;
}

/**
 * 查询（不 json_err 退出）
 * @return array{ok:bool,columns?:array,rows?:array,message?:string}
 */
function sqlmnger_sql_try_query($h, $sql) {
	if ($h['type'] === 'pdo') {
		/** @var PDO $pdo */
		$pdo = $h['handle'];
		try {
			$st = $pdo->query($sql);
			if ($st === false) {
				return array('ok' => false, 'message' => '查询失败');
			}
			$cols = array();
			$cc = $st->columnCount();
			for ($i = 0; $i < $cc; $i++) {
				$meta = $st->getColumnMeta($i);
				$cols[] = isset($meta['name']) ? $meta['name'] : ('c' . $i);
			}
			$rowsAssoc = $st->fetchAll(PDO::FETCH_ASSOC);
			$rows = array();
			foreach ($rowsAssoc as $ra) {
				$line = array();
				foreach ($cols as $cn) {
					$v = array_key_exists($cn, $ra) ? $ra[$cn] : null;
					$line[] = sqlmnger_cell_export($v);
				}
				$rows[] = $line;
			}
			return array('ok' => true, 'columns' => $cols, 'rows' => $rows);
		} catch (Exception $e) {
			return array('ok' => false, 'message' => $e->getMessage());
		}
	}

	// 自研 TCP/TDS
	if (isset($h['type']) && $h['type'] === 'tds') {
		/** @var SqlmngerTdsClient $client */
		$client = $h['handle'];
		$r = $client->execute($sql);
		if (!empty($r['error'])) {
			return array('ok' => false, 'message' => $r['error']);
		}
		$cols = isset($r['columns']) && is_array($r['columns']) ? $r['columns'] : array();
		$rows = array();
		if (!empty($r['rows']) && is_array($r['rows'])) {
			foreach ($r['rows'] as $ra) {
				$line = array();
				if (count($cols) === 0 && is_array($ra)) {
					$cols = array_keys($ra);
				}
				foreach ($cols as $cn) {
					$v = (is_array($ra) && array_key_exists($cn, $ra)) ? $ra[$cn] : null;
					$line[] = sqlmnger_cell_export($v);
				}
				$rows[] = $line;
			}
		}
		return array('ok' => true, 'columns' => $cols, 'rows' => $rows);
	}

	$handle = $h['handle'];
	$stmt = @sqlsrv_query($handle, $sql);
	if ($stmt === false) {
		$errs = sqlsrv_errors();
		$msg = is_array($errs) && isset($errs[0]['message']) ? $errs[0]['message'] : 'sqlsrv 查询失败';
		return array('ok' => false, 'message' => $msg);
	}
	$cols = array();
	$meta = sqlsrv_field_metadata($stmt);
	if (is_array($meta)) {
		foreach ($meta as $m) {
			$cols[] = $m['Name'];
		}
	}
	$rows = array();
	while ($ra = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC)) {
		$line = array();
		foreach ($cols as $cn) {
			$v = array_key_exists($cn, $ra) ? $ra[$cn] : null;
			$line[] = sqlmnger_cell_export($v);
		}
		$rows[] = $line;
	}
	sqlsrv_free_stmt($stmt);
	return array('ok' => true, 'columns' => $cols, 'rows' => $rows);
}

/**
 * 执行写语句（不 json_err 退出）
 * @return array{ok:bool,affected?:int,message?:string}
 */
function sqlmnger_sql_try_exec($h, $sql) {
	if ($h['type'] === 'pdo') {
		$pdo = $h['handle'];
		try {
			$n = $pdo->exec($sql);
			if ($n === false) {
				return array('ok' => false, 'message' => '执行失败');
			}
			return array('ok' => true, 'affected' => intval($n));
		} catch (Exception $e) {
			return array('ok' => false, 'message' => $e->getMessage());
		}
	}
	if (isset($h['type']) && $h['type'] === 'tds') {
		/** @var SqlmngerTdsClient $client */
		$client = $h['handle'];
		$r = $client->execute($sql);
		if (!empty($r['error'])) {
			$msg = strval($r['error']);
			if (
				strpos($msg, '15477') !== false
				|| stripos($msg, 'Changing any part of an object name') !== false
				|| strpos($msg, '更改对象名') !== false
			) {
				return array('ok' => true, 'affected' => 0);
			}
			return array('ok' => false, 'message' => $msg);
		}
		return array('ok' => true, 'affected' => isset($r['rows_affected']) ? intval($r['rows_affected']) : 0);
	}

	$handle = $h['handle'];
	$stmt = @sqlsrv_query($handle, $sql);
	if ($stmt === false) {
		$errs = sqlsrv_errors();
		if (sqlmnger_sqlsrv_errors_are_warnings_only($errs)) {
			return array('ok' => true, 'affected' => 0);
		}
		$msg = sqlmnger_sqlsrv_errors_message($errs);
		return array('ok' => false, 'message' => $msg);
	}
	$n = sqlsrv_rows_affected($stmt);
	sqlsrv_free_stmt($stmt);
	return array('ok' => true, 'affected' => intval($n));
}

function sqlmnger_sql_stmt_preview($sql) {
	$s = preg_replace('/\s+/', ' ', trim(strval($sql)));
	if (function_exists('mb_strlen') && function_exists('mb_substr')) {
		if (mb_strlen($s, 'UTF-8') > 120) {
			$s = mb_substr($s, 0, 120, 'UTF-8') . '…';
		}
	} elseif (strlen($s) > 120) {
		$s = substr($s, 0, 120) . '…';
	}
	return $s;
}
