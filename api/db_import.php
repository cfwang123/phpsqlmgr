<?php
/**
 * 库级 SQL 导入
 * 支持：
 * 1) JSON POST { database, sql, stop_on_error?, errors_only? }
 * 2) multipart: c, database, stop_on_error, errors_only, file
 * 3) JSON { database, sql_base64, ... }  大文件 base64
 *
 * 将脚本拆成多语句依次执行（支持简单引号/注释，DELIMITER 块粗略支持）
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
sqlmnger_require_not_readonly();

$isMultipart = !empty($_FILES['file']);
if ($isMultipart) {
	$db = isset($_POST['database']) ? trim(strval($_POST['database'])) : '';
	if ($db === '' && isset($_GET['database'])) {
		$db = trim(strval($_GET['database']));
	}
	// 多连接 c
	if (isset($_POST['c']) && strval($_POST['c']) !== '') {
		// bootstrap 已从 query/body 读；multipart 时写入全局模拟
		$_REQUEST['c'] = $_POST['c'];
	}
	$stopOnError = !isset($_POST['stop_on_error']) || $_POST['stop_on_error'] === '1' || $_POST['stop_on_error'] === 'true';
	$errorsOnly = !empty($_POST['errors_only']) && ($_POST['errors_only'] === '1' || $_POST['errors_only'] === 'true');
	$f = $_FILES['file'];
	if (!empty($f['error'])) {
		sqlmnger_json_err('UPLOAD', '上传失败 code=' . intval($f['error']), 400, null);
	}
	$path = isset($f['tmp_name']) ? $f['tmp_name'] : '';
	if ($path === '' || !is_uploaded_file($path)) {
		sqlmnger_json_err('UPLOAD', '无效上传文件', 400, null);
	}
	$raw = file_get_contents($path);
	if ($raw === false) {
		sqlmnger_json_err('UPLOAD', '读取上传失败', 400, null);
	}
	// gzip
	$origName = isset($f['name']) ? strval($f['name']) : '';
	if (preg_match('/\.gz$/i', $origName) || (strlen($raw) >= 2 && ord($raw[0]) === 0x1f && ord($raw[1]) === 0x8b)) {
		if (!function_exists('gzdecode')) {
			sqlmnger_json_err('GZIP', '服务器不支持 gzdecode', 500, null);
		}
		$dec = @gzdecode($raw);
		if ($dec === false) {
			sqlmnger_json_err('GZIP', '解压 gzip 失败', 400, null);
		}
		$raw = $dec;
	}
	$sqlText = $raw;
} else {
	$body = sqlmnger_read_json_body();
	$db = sqlmnger_req_database($body);
	$stopOnError = !array_key_exists('stop_on_error', $body) || !empty($body['stop_on_error']);
	$errorsOnly = !empty($body['errors_only']);
	if (!empty($body['sql_base64'])) {
		$sqlText = base64_decode(strval($body['sql_base64']), true);
		if ($sqlText === false) {
			sqlmnger_json_err('BAD_B64', 'sql_base64 无效', 400, null);
		}
	} else {
		$sqlText = isset($body['sql']) ? strval($body['sql']) : '';
	}
}

if ($db === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database', 400, null);
}
if ($sqlText === null || trim($sqlText) === '') {
	sqlmnger_json_err('BAD_REQ', '请提供 SQL 内容或上传文件', 400, null);
}

// 体积保护
$maxBytes = intval(sqlmnger_cfg('import_max_bytes', 32 * 1024 * 1024));
if ($maxBytes > 0 && strlen($sqlText) > $maxBytes) {
	sqlmnger_json_err('TOO_LARGE', '导入内容超过限制（' . $maxBytes . ' 字节）', 400, null);
}

$h = sqlmnger_open_handle($db);
$stmts = sqlmnger_split_sql_script($sqlText);
$maxStmts = intval(sqlmnger_cfg('import_max_statements', 50000));
if ($maxStmts > 0 && count($stmts) > $maxStmts) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('TOO_MANY', '语句数超过限制（' . $maxStmts . '）', 400, null);
}

$started = microtime(true);
$ok = 0;
$fail = 0;
$errors = array();
$log = array();
$i = 0;
foreach ($stmts as $stmt) {
	$i++;
	$stmt = trim($stmt);
	if ($stmt === '' || $stmt === ';') continue;
	// 跳过纯 DELIMITER 指令
	if (preg_match('/^DELIMITER\b/i', $stmt)) continue;

	$run = sqlmnger_import_run_stmt($h, $stmt);
	if ($run['ok']) {
		$ok++;
		if (!$errorsOnly) {
			$log[] = array('n' => $i, 'ok' => true, 'preview' => sqlmnger_sql_preview($stmt));
		}
	} else {
		$fail++;
		$errItem = array(
			'n' => $i,
			'ok' => false,
			'message' => $run['message'],
			'preview' => sqlmnger_sql_preview($stmt),
		);
		$errors[] = $errItem;
		$log[] = $errItem;
		if ($stopOnError) {
			break;
		}
	}
}

$ms = (int) round((microtime(true) - $started) * 1000);
sqlmnger_close_handle($h);

sqlmnger_json_ok(array(
	'database' => $db,
	'statements' => count($stmts),
	'ok' => $ok,
	'fail' => $fail,
	'stopped' => ($fail > 0 && $stopOnError),
	'elapsed_ms' => $ms,
	'errors' => $errors,
	'log' => $errorsOnly ? $errors : array_slice($log, 0, 500),
));

function sqlmnger_import_run_stmt($h, $sql) {
	if ($h['type'] === 'pdo') {
		try {
			$pdo = $h['handle'];
			$pdo->exec($sql);
			return array('ok' => true, 'message' => '');
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
		return array('ok' => true, 'message' => '');
	}
	// sqlsrv
	$handle = $h['handle'];
	$stmt = @sqlsrv_query($handle, $sql);
	if ($stmt === false) {
		$errs = sqlsrv_errors();
		$msg = is_array($errs) && isset($errs[0]['message']) ? $errs[0]['message'] : 'sqlsrv 执行失败';
		return array('ok' => false, 'message' => $msg);
	}
	sqlsrv_free_stmt($stmt);
	return array('ok' => true, 'message' => '');
}

function sqlmnger_import_sql_kind($sql) {
	$s = ltrim($sql);
	while (true) {
		if (preg_match('/^--[^\n]*\n/s', $s, $m)) {
			$s = ltrim(substr($s, strlen($m[0])));
			continue;
		}
		if (preg_match('/^\/\*.*?\*\//s', $s, $m)) {
			$s = ltrim(substr($s, strlen($m[0])));
			continue;
		}
		break;
	}
	if (preg_match('/^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH|PRAGMA|VALUES)\b/i', $s)) {
		return 'query';
	}
	return 'exec';
}

function sqlmnger_sql_preview($sql) {
	$s = preg_replace('/\s+/', ' ', trim(strval($sql)));
	if (strlen($s) > 160) {
		$s = substr($s, 0, 160) . '…';
	}
	return $s;
}
