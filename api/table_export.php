<?php
/**
 * 表数据导出（附件，非 JSON 包络）
 * POST {
 *   database, table,
 *   format: sql|csv|xlsx|json,
 *   zip?: bool,        // true 时将内容打成 .zip 下载
 *   where?,
 *   sort?,             // 与 table_data 相同：服务端 ORDER BY
 *   scope: page|all,   // page=当前页；all=筛选全部（软上限）
 *   limit?, offset?, page?
 * }
 * 成功：Content-Disposition attachment
 * 失败：JSON 错误包络
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
$table = isset($body['table']) ? trim(strval($body['table'])) : '';
$format = isset($body['format']) ? strtolower(trim(strval($body['format']))) : 'csv';
$scope = isset($body['scope']) ? strtolower(trim(strval($body['scope']))) : 'all';
$where = isset($body['where']) ? strval($body['where']) : '';
$sort = null;
if (array_key_exists('sort', $body)) {
	$sort = $body['sort'];
} elseif (array_key_exists('s', $body)) {
	$sort = $body['s'];
}
$wantZip = !empty($body['zip']);

if ($db === '' || $table === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database 与 table', 400, null);
}
if (!in_array($format, array('sql', 'csv', 'xlsx', 'json'), true)) {
	sqlmnger_json_err('BAD_FORMAT', 'format 支持 sql / csv / xlsx / json', 400, null);
}
if ($scope !== 'page' && $scope !== 'all') {
	$scope = 'all';
}

// 分页参数
if (array_key_exists('limit', $body)) {
	$limit = intval($body['limit']);
} else {
	$limit = intval(sqlmnger_cfg('default_table_limit', 100000));
}
$maxFetch = intval(sqlmnger_cfg('max_fetch_rows', 1000000));
if ($maxFetch > 0 && $limit > $maxFetch) {
	$limit = $maxFetch;
}
$offset = 0;
if (isset($body['offset'])) {
	$offset = intval($body['offset']);
} elseif (isset($body['page'])) {
	$page = intval($body['page']);
	if ($page < 1) {
		$page = 1;
	}
	if ($limit > 0) {
		$offset = ($page - 1) * $limit;
	}
}

// all：不限行数（table_data_payload 内仍有 soft max）
if ($scope === 'all') {
	$limit = 0;
	$offset = 0;
}

$h = sqlmnger_open_handle($db);
$payload = sqlmnger_table_data_payload($h, $db, $table, $limit, $where, $offset, $sort);
$driver = $h['driver'];
sqlmnger_close_handle($h);

$cols = array();
if (!empty($payload['columns']) && is_array($payload['columns'])) {
	foreach ($payload['columns'] as $c) {
		if (is_array($c) && isset($c['name'])) {
			$cols[] = strval($c['name']);
		} elseif (is_string($c)) {
			$cols[] = $c;
		}
	}
}
$rows = isset($payload['rows']) && is_array($payload['rows']) ? $payload['rows'] : array();

$safeName = sqlmnger_export_safe_name($table);
$stamp = date('Ymd_His');
$base = $safeName . '_' . $stamp;

// 先生成内容（便于 zip 打包）
$built = sqlmnger_export_build_content($format, $driver, $db, $table, $cols, $rows, $payload, $base);
if ($built === false || !is_array($built)) {
	sqlmnger_json_err('EXPORT', '生成导出内容失败', 500, null);
}
$innerName = $built['filename'];
$content = $built['content'];
$mime = $built['mime'];

// 关闭可能的输出缓冲，避免污染文件
while (ob_get_level() > 0) {
	ob_end_clean();
}

if ($wantZip) {
	if (!class_exists('ZipArchive')) {
		sqlmnger_json_err('EXT', '服务器缺少 ZipArchive，无法导出 ZIP', 500, null);
	}
	$zipBin = sqlmnger_export_wrap_zip($innerName, $content);
	if ($zipBin === false || $zipBin === '') {
		sqlmnger_json_err('ZIP', '打包 ZIP 失败', 500, null);
	}
	$zipName = $base . '.zip';
	header('Content-Type: application/zip');
	header('Content-Disposition: attachment; filename="' . $zipName . '"; filename*=UTF-8\'\'' . rawurlencode($zipName));
	header('Cache-Control: no-store');
	header('X-Content-Type-Options: nosniff');
	header('Content-Length: ' . strlen($zipBin));
	echo $zipBin;
	exit;
}

header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . $innerName . '"; filename*=UTF-8\'\'' . rawurlencode($innerName));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Content-Length: ' . strlen($content));
echo $content;
exit;

// ── helpers ──────────────────────────────────────────────

/**
 * 生成导出正文
 * @return array|false array(filename, content, mime)
 */
function sqlmnger_export_build_content($format, $driver, $db, $table, $cols, $rows, $payload, $base) {
	if ($format === 'csv') {
		$filename = $base . '.csv';
		// 内存 fputcsv
		$fh = fopen('php://temp', 'r+');
		if ($fh === false) {
			return false;
		}
		// Excel 友好 BOM
		fwrite($fh, "\xEF\xBB\xBF");
		fputcsv($fh, $cols);
		foreach ($rows as $row) {
			$line = array();
			$n = count($cols);
			for ($i = 0; $i < $n; $i++) {
				$v = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
				$line[] = $v === null ? '' : $v;
			}
			fputcsv($fh, $line);
		}
		rewind($fh);
		$content = stream_get_contents($fh);
		fclose($fh);
		return array(
			'filename' => $filename,
			'content' => $content === false ? '' : $content,
			'mime' => 'text/csv; charset=utf-8',
		);
	}

	if ($format === 'json') {
		$filename = $base . '.json';
		$objs = array();
		$n = count($cols);
		foreach ($rows as $row) {
			$o = array();
			for ($i = 0; $i < $n; $i++) {
				$cn = $cols[$i];
				$o[$cn] = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
			}
			$objs[] = $o;
		}
		$wrap = array(
			'database' => $db,
			'table' => $table,
			'where' => isset($payload['where']) ? $payload['where'] : '',
			'exported_at' => date('c'),
			'row_count' => count($objs),
			'columns' => $cols,
			'rows' => $objs,
		);
		$flags = 0;
		if (defined('JSON_UNESCAPED_UNICODE')) {
			$flags |= JSON_UNESCAPED_UNICODE;
		}
		if (defined('JSON_UNESCAPED_SLASHES')) {
			$flags |= JSON_UNESCAPED_SLASHES;
		}
		$json = json_encode($wrap, $flags);
		return array(
			'filename' => $filename,
			'content' => $json === false ? '{}' : $json,
			'mime' => 'application/json; charset=utf-8',
		);
	}

	if ($format === 'sql') {
		$filename = $base . '.sql';
		$buf = '';
		$buf .= "-- sqlmnger export\n";
		$buf .= '-- ' . date('c') . "\n";
		$buf .= '-- database: ' . str_replace(array("\r", "\n"), '', $db) . "\n";
		$buf .= '-- table: ' . str_replace(array("\r", "\n"), '', $table) . "\n";
		if (!empty($payload['where'])) {
			$buf .= '-- where: ' . str_replace(array("\r", "\n"), ' ', $payload['where']) . "\n";
		}
		$buf .= '-- rows: ' . count($rows) . "\n\n";
		$qTable = sqlmnger_ident_quote($driver, $table);
		if ($driver === 'sqlsrv' || $driver === 'mssql_tcp') {
			$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
		}
		$qCols = array();
		foreach ($cols as $cn) {
			$qCols[] = sqlmnger_ident_quote($driver, $cn);
		}
		$colList = implode(', ', $qCols);
		$n = count($cols);
		foreach ($rows as $row) {
			$vals = array();
			for ($i = 0; $i < $n; $i++) {
				$v = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
				$vals[] = sqlmnger_sql_literal($driver, $v);
			}
			$buf .= 'INSERT INTO ' . $qTable . ' (' . $colList . ') VALUES (' . implode(', ', $vals) . ");\n";
		}
		return array(
			'filename' => $filename,
			'content' => $buf,
			'mime' => 'application/sql; charset=utf-8',
		);
	}

	// xlsx
	if (!class_exists('ZipArchive')) {
		sqlmnger_json_err('EXT', '服务器缺少 ZipArchive，无法导出 XLSX（可改用 CSV）', 500, null);
	}
	$filename = $base . '.xlsx';
	$bin = sqlmnger_build_xlsx($cols, $rows);
	if ($bin === false || $bin === '') {
		return false;
	}
	return array(
		'filename' => $filename,
		'content' => $bin,
		'mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);
}

/**
 * 将单文件内容打成 zip
 * @param string $innerName zip 内文件名
 * @param string $content
 * @return string|false
 */
function sqlmnger_export_wrap_zip($innerName, $content) {
	$tmp = tempnam(sys_get_temp_dir(), 'smz');
	if ($tmp === false) {
		return false;
	}
	$zipPath = $tmp . '.zip';
	@unlink($tmp);
	$zip = new ZipArchive();
	if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
		@unlink($zipPath);
		return false;
	}
	// 内层文件名仅保留安全字符
	$safeInner = preg_replace('/[\\\\\\/]+/', '_', strval($innerName));
	if ($safeInner === '' || $safeInner === null) {
		$safeInner = 'export.dat';
	}
	$zip->addFromString($safeInner, $content);
	$zip->close();
	$bin = @file_get_contents($zipPath);
	@unlink($zipPath);
	return $bin;
}

/**
 * @param string $name
 * @return string
 */
function sqlmnger_export_safe_name($name) {
	$name = strval($name);
	$name = preg_replace('/[^\w\-\.\x{4e00}-\x{9fff}]+/u', '_', $name);
	$name = trim($name, '._');
	if ($name === '' || $name === null) {
		$name = 'export';
	}
	if (strlen($name) > 80) {
		$name = substr($name, 0, 80);
	}
	return $name;
}

/**
 * SQL 字面量（INSERT 用）
 * @param string $driver
 * @param mixed $v
 * @return string
 */
function sqlmnger_sql_literal($driver, $v) {
	if ($v === null) {
		return 'NULL';
	}
	if (is_bool($v)) {
		return $v ? '1' : '0';
	}
	if (is_int($v) || is_float($v)) {
		return strval($v);
	}
	// 数值字符串保持引号包裹更安全（避免前导 0 丢失）
	$s = strval($v);
	if ($driver === 'mysql') {
		// 标准转义
		$s = str_replace(
			array('\\', "\0", "\n", "\r", "'", '"', "\x1a"),
			array('\\\\', '\\0', '\\n', '\\r', "\\'", '\\"', '\\Z'),
			$s
		);
		return "'" . $s . "'";
	}
	if ($driver === 'sqlite') {
		return "'" . str_replace("'", "''", $s) . "'";
	}
	// sqlsrv：N'...' 支持 unicode
	return "N'" . str_replace("'", "''", $s) . "'";
}

/**
 * 列号 0 → A, 25 → Z, 26 → AA
 * @param int $n 0-based
 * @return string
 */
function sqlmnger_xlsx_col_name($n) {
	$n = intval($n);
	$s = '';
	$n++;
	while ($n > 0) {
		$n--;
		$s = chr(65 + ($n % 26)) . $s;
		$n = intval($n / 26);
	}
	return $s;
}

/**
 * @param string $s
 * @return string
 */
function sqlmnger_xml_esc($s) {
	return htmlspecialchars(strval($s), ENT_QUOTES, 'UTF-8');
}

/**
 * 最小 OOXML xlsx（inlineStr，无样式）
 * @param array $cols
 * @param array $rows
 * @return string|false
 */
function sqlmnger_build_xlsx($cols, $rows) {
	$sheet = array();
	$sheet[] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
	$sheet[] = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
	$sheet[] = '<sheetData>';

	// header row
	$sheet[] = '<row r="1">';
	$ci = 0;
	foreach ($cols as $cn) {
		$ref = sqlmnger_xlsx_col_name($ci) . '1';
		$sheet[] = '<c r="' . $ref . '" t="inlineStr"><is><t>' . sqlmnger_xml_esc($cn) . '</t></is></c>';
		$ci++;
	}
	$sheet[] = '</row>';

	$ri = 2;
	$n = count($cols);
	foreach ($rows as $row) {
		$sheet[] = '<row r="' . $ri . '">';
		for ($i = 0; $i < $n; $i++) {
			$ref = sqlmnger_xlsx_col_name($i) . $ri;
			$v = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
			if ($v === null) {
				// 空单元格可省略
				continue;
			}
			if (is_int($v) || is_float($v) || (is_string($v) && is_numeric($v) && strlen($v) < 16
					&& !preg_match('/^0\d+$/', $v) && strpos($v, 'e') === false && strpos($v, 'E') === false)) {
				// 数字
				$sheet[] = '<c r="' . $ref . '"><v>' . sqlmnger_xml_esc($v) . '</v></c>';
			} else {
				// 控制字符清理，避免坏 XML
				$t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', strval($v));
				$sheet[] = '<c r="' . $ref . '" t="inlineStr"><is><t>' . sqlmnger_xml_esc($t) . '</t></is></c>';
			}
		}
		$sheet[] = '</row>';
		$ri++;
	}
	$sheet[] = '</sheetData>';
	$sheet[] = '</worksheet>';
	$sheetXml = implode('', $sheet);

	$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
		. '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
		. '<Default Extension="xml" ContentType="application/xml"/>'
		. '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
		. '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
		. '</Types>';

	$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		. '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
		. '</Relationships>';

	$wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
		. 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
		. '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
		. '</workbook>';

	$wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		. '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		. '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
		. '</Relationships>';

	$tmp = tempnam(sys_get_temp_dir(), 'smx');
	if ($tmp === false) {
		return false;
	}
	$zipPath = $tmp . '.xlsx';
	@unlink($tmp);

	$zip = new ZipArchive();
	if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
		@unlink($zipPath);
		return false;
	}
	$zip->addFromString('[Content_Types].xml', $contentTypes);
	$zip->addFromString('_rels/.rels', $rels);
	$zip->addFromString('xl/workbook.xml', $wb);
	$zip->addFromString('xl/_rels/workbook.xml.rels', $wbRels);
	$zip->addFromString('xl/worksheets/sheet1.xml', $sheetXml);
	$zip->close();

	$bin = @file_get_contents($zipPath);
	@unlink($zipPath);
	return $bin;
}
