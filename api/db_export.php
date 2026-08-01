<?php
/**
 * 库级导出（类 mysqldump / Adminer）
 * POST JSON {
 *   database,
 *   format: sql|csv|tsv,
 *   zip?: bool,
 *   options: {
 *     drop: bool,           // DROP TABLE IF EXISTS
 *     create: bool,         // CREATE TABLE (SHOW CREATE)
 *     auto_increment: bool, // 保留 AUTO_INCREMENT
 *     triggers: bool,
 *     routines: bool,       // 存储过程/函数
 *     events: bool,
 *     data_mode: none|insert|insert_ignore|replace
 *   },
 *   tables: [ { name, structure?:bool, data?:bool }, ... ]
 *     若省略 tables 则导出库内全部表（结构+数据）
 * }
 * 成功：附件；失败：JSON
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$db = sqlmnger_req_database($body);
if ($db === '') {
	sqlmnger_json_err('BAD_REQ', '需要 database', 400, null);
}

$format = isset($body['format']) ? strtolower(trim(strval($body['format']))) : 'sql';
if (!in_array($format, array('sql', 'csv', 'tsv'), true)) {
	sqlmnger_json_err('BAD_FORMAT', 'format 支持 sql / csv / tsv', 400, null);
}
$wantZip = !empty($body['zip']);
$optIn = isset($body['options']) && is_array($body['options']) ? $body['options'] : array();
$options = array(
	'drop' => !empty($optIn['drop']),
	'create' => array_key_exists('create', $optIn) ? !empty($optIn['create']) : true,
	'auto_increment' => array_key_exists('auto_increment', $optIn) ? !empty($optIn['auto_increment']) : true,
	'triggers' => !empty($optIn['triggers']),
	'routines' => !empty($optIn['routines']),
	'events' => !empty($optIn['events']),
	'data_mode' => isset($optIn['data_mode']) ? strtolower(trim(strval($optIn['data_mode']))) : 'insert',
);
if (!in_array($options['data_mode'], array('none', 'insert', 'insert_ignore', 'replace'), true)) {
	$options['data_mode'] = 'insert';
}

$h = sqlmnger_open_handle($db);
$driver = $h['driver'];

// 解析表清单
$tablesSpec = array();
if (!empty($body['tables']) && is_array($body['tables'])) {
	foreach ($body['tables'] as $t) {
		if (is_string($t)) {
			$n = trim($t);
			if ($n !== '') {
				$tablesSpec[] = array('name' => $n, 'structure' => true, 'data' => true);
			}
		} elseif (is_array($t) && !empty($t['name'])) {
			$tablesSpec[] = array(
				'name' => trim(strval($t['name'])),
				'structure' => array_key_exists('structure', $t) ? !empty($t['structure']) : true,
				'data' => array_key_exists('data', $t) ? !empty($t['data']) : true,
			);
		}
	}
}
if (!count($tablesSpec)) {
	// 全部表
	$all = sqlmnger_list_tables_simple($h, $db);
	foreach ($all as $n) {
		$tablesSpec[] = array('name' => $n, 'structure' => true, 'data' => true);
	}
}

$safeDb = preg_replace('/[^\w\-\.\x{4e00}-\x{9fff}]+/u', '_', $db);
if ($safeDb === '' || $safeDb === null) {
	$safeDb = 'db';
}
$stamp = date('Ymd_His');
$base = $safeDb . '_' . $stamp;

try {
	if ($format === 'sql') {
		$content = sqlmnger_db_export_sql($h, $db, $tablesSpec, $options);
		$innerName = $base . '.sql';
		$mime = 'application/sql; charset=utf-8';
	} else {
		// 多表 CSV/TSV → 始终 zip（多文件）或单表单文件
		$delim = $format === 'tsv' ? "\t" : ',';
		$ext = $format === 'tsv' ? 'tsv' : 'csv';
		$files = sqlmnger_db_export_delimited($h, $db, $tablesSpec, $options, $delim, $ext);
		if (count($files) === 1 && !$wantZip) {
			$only = reset($files);
			$content = $only['content'];
			$innerName = $only['name'];
			$mime = $format === 'tsv' ? 'text/tab-separated-values; charset=utf-8' : 'text/csv; charset=utf-8';
		} else {
			$wantZip = true;
			$content = null;
			$innerName = $base . '.' . $ext;
			$mime = 'application/zip';
			$zipBin = sqlmnger_export_files_zip($files);
			if ($zipBin === false) {
				sqlmnger_json_err('ZIP', '打包失败', 500, null);
			}
			sqlmnger_close_handle($h);
			while (ob_get_level() > 0) {
				ob_end_clean();
			}
			$zipName = $base . '.zip';
			header('Content-Type: application/zip');
			header('Content-Disposition: attachment; filename="' . $zipName . '"; filename*=UTF-8\'\'' . rawurlencode($zipName));
			header('Cache-Control: no-store');
			header('Content-Length: ' . strlen($zipBin));
			echo $zipBin;
			exit;
		}
	}
} catch (Exception $e) {
	sqlmnger_close_handle($h);
	sqlmnger_json_err('EXPORT', '导出失败: ' . $e->getMessage(), 500, null);
}
sqlmnger_close_handle($h);

while (ob_get_level() > 0) {
	ob_end_clean();
}

if ($wantZip) {
	if (!class_exists('ZipArchive')) {
		sqlmnger_json_err('EXT', '缺少 ZipArchive', 500, null);
	}
	$zipBin = sqlmnger_export_files_zip(array(array('name' => $innerName, 'content' => $content)));
	if ($zipBin === false) {
		sqlmnger_json_err('ZIP', '打包失败', 500, null);
	}
	$zipName = $base . '.zip';
	header('Content-Type: application/zip');
	header('Content-Disposition: attachment; filename="' . $zipName . '"; filename*=UTF-8\'\'' . rawurlencode($zipName));
	header('Cache-Control: no-store');
	header('Content-Length: ' . strlen($zipBin));
	echo $zipBin;
	exit;
}

header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . $innerName . '"; filename*=UTF-8\'\'' . rawurlencode($innerName));
header('Cache-Control: no-store');
header('Content-Length: ' . strlen($content));
echo $content;
exit;

// ── helpers ──────────────────────────────────────────────

function sqlmnger_list_tables_simple($h, $database) {
	$driver = $h['driver'];
	$names = array();
	if ($driver === 'mysql') {
		$r = sqlmnger_query_all($h,
			'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME',
			array($database)
		);
		foreach ($r['rows'] as $row) {
			if (!empty($row[0])) $names[] = strval($row[0]);
		}
		return $names;
	}
	if ($driver === 'sqlite') {
		$r = sqlmnger_query_all($h,
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
			array()
		);
		foreach ($r['rows'] as $row) {
			if (!empty($row[0])) $names[] = strval($row[0]);
		}
		return $names;
	}
	// sqlsrv
	$r = sqlmnger_query_all($h,
		"SELECT t.name FROM sys.tables t INNER JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='dbo' ORDER BY t.name",
		array()
	);
	foreach ($r['rows'] as $row) {
		if (!empty($row[0])) $names[] = strval($row[0]);
	}
	return $names;
}

function sqlmnger_db_export_sql($h, $database, $tablesSpec, $options) {
	$driver = $h['driver'];
	$buf = '';
	$buf .= "-- sqlmnger database export\n";
	$buf .= '-- ' . date('c') . "\n";
	$buf .= '-- database: ' . str_replace(array("\r", "\n"), '', $database) . "\n";
	$buf .= '-- driver: ' . $driver . "\n\n";

	if ($driver === 'mysql') {
		$buf .= "SET NAMES utf8mb4;\n";
		$buf .= "SET FOREIGN_KEY_CHECKS=0;\n";
		$buf .= "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n";
	}

	// routines / events 先于表数据（mysql）
	if ($driver === 'mysql' && !empty($options['routines'])) {
		$buf .= sqlmnger_export_mysql_routines($h, $database);
	}
	if ($driver === 'mysql' && !empty($options['events'])) {
		$buf .= sqlmnger_export_mysql_events($h, $database);
	}

	foreach ($tablesSpec as $ts) {
		$name = $ts['name'];
		$wantStruct = !empty($ts['structure']);
		$wantData = !empty($ts['data']) && $options['data_mode'] !== 'none';
		if (!$wantStruct && !$wantData) continue;

		$qTable = sqlmnger_ident_quote($driver, $name);
		$buf .= "-- ----------------------------\n-- Table: {$name}\n-- ----------------------------\n";

		if ($wantStruct) {
			if (!empty($options['drop'])) {
				if ($driver === 'mysql') {
					$buf .= 'DROP TABLE IF EXISTS ' . $qTable . ";\n";
				} elseif ($driver === 'sqlite') {
					$buf .= 'DROP TABLE IF EXISTS ' . $qTable . ";\n";
				} else {
					$buf .= 'IF OBJECT_ID(N\'dbo.' . str_replace("'", "''", $name) . '\', N\'U\') IS NOT NULL DROP TABLE ' . $qTable . ";\n";
				}
			}
			if (!empty($options['create'])) {
				$ddl = sqlmnger_export_show_create($h, $driver, $database, $name);
				if ($ddl !== '') {
					if ($driver === 'mysql' && empty($options['auto_increment'])) {
						// 去掉 AUTO_INCREMENT=N 表选项
						$ddl = preg_replace('/\s*AUTO_INCREMENT=\d+/i', '', $ddl);
					}
					$buf .= $ddl;
					if (substr(rtrim($ddl), -1) !== ';') {
						$buf .= ";\n";
					}
					$buf .= "\n";
				}
			}
		}

		if ($wantData) {
			$buf .= sqlmnger_export_table_data_sql($h, $driver, $name, $options['data_mode']);
			$buf .= "\n";
		}

		if ($wantStruct && $driver === 'mysql' && !empty($options['triggers'])) {
			$buf .= sqlmnger_export_mysql_triggers($h, $database, $name);
		}
	}

	if ($driver === 'mysql') {
		$buf .= "SET FOREIGN_KEY_CHECKS=1;\n";
	}
	return $buf;
}

function sqlmnger_export_show_create($h, $driver, $database, $table) {
	if ($driver === 'mysql') {
		$r = sqlmnger_query_all($h, 'SHOW CREATE TABLE ' . sqlmnger_ident_quote('mysql', $table), array());
		// columns: Table, Create Table
		if (!empty($r['rows'][0][1])) {
			return strval($r['rows'][0][1]);
		}
		return '';
	}
	if ($driver === 'sqlite') {
		$r = sqlmnger_query_all($h,
			"SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
			array($table)
		);
		if (!empty($r['rows'][0][0])) {
			return strval($r['rows'][0][0]);
		}
		return '';
	}
	// sqlsrv：无标准 SHOW CREATE，输出注释说明
	return '-- SQL Server: structure export limited; table [' . $table . "]\n";
}

function sqlmnger_export_table_data_sql($h, $driver, $table, $dataMode) {
	$qTable = sqlmnger_ident_quote($driver, $table);
	if ($driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') {
		$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	}
	$sql = 'SELECT * FROM ' . $qTable;
	// 软上限
	$soft = intval(sqlmnger_cfg('unlimited_soft_max', 2000000));
	if ($soft < 1) $soft = 2000000;
	if ($driver === 'mysql' || $driver === 'sqlite') {
		$sql .= ' LIMIT ' . $soft;
	}

	$r = sqlmnger_query_all($h, $sql, array());
	$cols = $r['columns'];
	$rows = $r['rows'];
	if (!count($cols) || !count($rows)) {
		return "-- (no data for {$table})\n";
	}

	$qCols = array();
	foreach ($cols as $cn) {
		$qCols[] = sqlmnger_ident_quote($driver, $cn);
	}
	$colList = implode(', ', $qCols);
	$verb = 'INSERT INTO';
	if ($dataMode === 'insert_ignore') {
		$verb = ($driver === 'mysql') ? 'INSERT IGNORE INTO' : 'INSERT INTO';
	} elseif ($dataMode === 'replace') {
		$verb = ($driver === 'mysql') ? 'REPLACE INTO' : 'INSERT INTO';
	}

	$buf = '';
	$n = count($cols);
	$batchSize = 50;
	$batch = array();
	foreach ($rows as $row) {
		$vals = array();
		for ($i = 0; $i < $n; $i++) {
			$v = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
			$vals[] = sqlmnger_sql_literal_export($driver, $v);
		}
		$batch[] = '(' . implode(', ', $vals) . ')';
		if (count($batch) >= $batchSize) {
			$buf .= $verb . ' ' . $qTable . ' (' . $colList . ") VALUES\n" . implode(",\n", $batch) . ";\n";
			$batch = array();
		}
	}
	if (count($batch)) {
		$buf .= $verb . ' ' . $qTable . ' (' . $colList . ") VALUES\n" . implode(",\n", $batch) . ";\n";
	}
	return $buf;
}

function sqlmnger_sql_literal_export($driver, $v) {
	if ($v === null) return 'NULL';
	if (is_bool($v)) return $v ? '1' : '0';
	if (is_int($v) || is_float($v)) return strval($v);
	$s = strval($v);
	if ($driver === 'mysql') {
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
	return "N'" . str_replace("'", "''", $s) . "'";
}

/** 导出用查询：失败返回 null，不 json_err 退出 */
function sqlmnger_export_q($h, $sql) {
	if ($h['type'] !== 'pdo') {
		try {
			return sqlmnger_query_all($h, $sql, array());
		} catch (Exception $e) {
			return null;
		}
	}
	try {
		$pdo = $h['handle'];
		$st = $pdo->query($sql);
		if ($st === false) return null;
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
				$line[] = array_key_exists($cn, $ra) ? $ra[$cn] : null;
			}
			$rows[] = $line;
		}
		return array('columns' => $cols, 'rows' => $rows);
	} catch (Exception $e) {
		return null;
	}
}

function sqlmnger_export_mysql_triggers($h, $database, $table) {
	$buf = '';
	$r = sqlmnger_export_q($h, 'SHOW TRIGGERS FROM ' . sqlmnger_ident_quote('mysql', $database));
	if (!$r) return '';
	// columns vary; look for Trigger name
	foreach ($r['rows'] as $row) {
		$trg = isset($row[0]) ? strval($row[0]) : '';
		$tbl = isset($row[2]) ? strval($row[2]) : (isset($row[1]) ? strval($row[1]) : '');
		// filter by table if we got all
		if ($table !== '' && $tbl !== '' && strcasecmp($tbl, $table) !== 0) continue;
		if ($trg === '') continue;
		$cr = sqlmnger_export_q($h, 'SHOW CREATE TRIGGER ' . sqlmnger_ident_quote('mysql', $trg));
		$ddl = '';
		if ($cr && !empty($cr['rows'][0])) {
			foreach ($cr['rows'][0] as $cell) {
				if (is_string($cell) && stripos($cell, 'TRIGGER') !== false && strlen($cell) > strlen($ddl)) {
					$ddl = $cell;
				}
			}
		}
		if ($ddl !== '') {
			$buf .= "DROP TRIGGER IF EXISTS " . sqlmnger_ident_quote('mysql', $trg) . ";\n";
			$buf .= "DELIMITER ;;\n" . $ddl . ";;\nDELIMITER ;\n\n";
		}
	}
	return $buf;
}

function sqlmnger_export_mysql_routines($h, $database) {
	$buf = "-- Routines\n";
	// 用拼接库名（已 quote 上下文来自 session 库名）
	$dbEsc = str_replace(array("\\", "'"), array("\\\\", "\\'"), $database);
	$r = sqlmnger_export_q($h,
		"SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = '" . $dbEsc . "'"
	);
	if (!$r) return '';
	foreach ($r['rows'] as $row) {
		$nm = isset($row[0]) ? strval($row[0]) : '';
		$ty = isset($row[1]) ? strtoupper(strval($row[1])) : 'PROCEDURE';
		if ($nm === '') continue;
		$kw = ($ty === 'FUNCTION') ? 'FUNCTION' : 'PROCEDURE';
		$cr = sqlmnger_export_q($h, 'SHOW CREATE ' . $kw . ' ' . sqlmnger_ident_quote('mysql', $nm));
		$ddl = '';
		if ($cr && !empty($cr['rows'][0])) {
			foreach ($cr['rows'][0] as $cell) {
				if (is_string($cell) && stripos($cell, $kw) !== false && strlen($cell) > strlen($ddl)) {
					$ddl = $cell;
				}
			}
		}
		if ($ddl !== '') {
			$buf .= 'DROP ' . $kw . ' IF EXISTS ' . sqlmnger_ident_quote('mysql', $nm) . ";\n";
			$buf .= "DELIMITER ;;\n" . $ddl . ";;\nDELIMITER ;\n\n";
		}
	}
	return $buf;
}

function sqlmnger_export_mysql_events($h, $database) {
	$buf = "-- Events\n";
	$r = sqlmnger_export_q($h, 'SHOW EVENTS FROM ' . sqlmnger_ident_quote('mysql', $database));
	if (!$r) return '';
	foreach ($r['rows'] as $row) {
		$nm = '';
		if (isset($row[1])) $nm = strval($row[1]);
		elseif (isset($row[0])) $nm = strval($row[0]);
		if ($nm === '') continue;
		$cr = sqlmnger_export_q($h, 'SHOW CREATE EVENT ' . sqlmnger_ident_quote('mysql', $nm));
		$ddl = '';
		if ($cr && !empty($cr['rows'][0])) {
			foreach ($cr['rows'][0] as $cell) {
				if (is_string($cell) && stripos($cell, 'EVENT') !== false && strlen($cell) > strlen($ddl)) {
					$ddl = $cell;
				}
			}
		}
		if ($ddl !== '') {
			$buf .= 'DROP EVENT IF EXISTS ' . sqlmnger_ident_quote('mysql', $nm) . ";\n";
			$buf .= "DELIMITER ;;\n" . $ddl . ";;\nDELIMITER ;\n\n";
		}
	}
	return $buf;
}

function sqlmnger_db_export_delimited($h, $db, $tablesSpec, $options, $delim, $ext) {
	$files = array();
	$driver = $h['driver'];
	foreach ($tablesSpec as $ts) {
		if (empty($ts['data']) && $options['data_mode'] === 'none') continue;
		if (empty($ts['data']) && empty($ts['structure'])) continue;
		// CSV 主要导出数据
		if (empty($ts['data'])) continue;
		$name = $ts['name'];
		$qTable = sqlmnger_ident_quote($driver, $name);
		if ($driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') {
			$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
		}
		$soft = intval(sqlmnger_cfg('unlimited_soft_max', 2000000));
		$sql = 'SELECT * FROM ' . $qTable;
		if ($driver === 'mysql' || $driver === 'sqlite') {
			$sql .= ' LIMIT ' . max(1, $soft);
		}
		$r = sqlmnger_query_all($h, $sql, array());
		$fh = fopen('php://temp', 'r+');
		if ($fh === false) continue;
		if ($delim === ',') {
			fwrite($fh, "\xEF\xBB\xBF");
		}
		if (count($r['columns'])) {
			if ($delim === ',') {
				fputcsv($fh, $r['columns']);
			} else {
				fwrite($fh, implode("\t", $r['columns']) . "\n");
			}
		}
		foreach ($r['rows'] as $row) {
			$line = array();
			$n = count($r['columns']);
			for ($i = 0; $i < $n; $i++) {
				$v = is_array($row) && array_key_exists($i, $row) ? $row[$i] : null;
				$line[] = $v === null ? '' : $v;
			}
			if ($delim === ',') {
				fputcsv($fh, $line);
			} else {
				$esc = array();
				foreach ($line as $c) {
					$c = str_replace(array("\t", "\r", "\n"), array(' ', ' ', ' '), strval($c));
					$esc[] = $c;
				}
				fwrite($fh, implode("\t", $esc) . "\n");
			}
		}
		rewind($fh);
		$content = stream_get_contents($fh);
		fclose($fh);
		$safe = preg_replace('/[^\w\-\.]+/', '_', $name);
		$files[] = array('name' => $safe . '.' . $ext, 'content' => $content === false ? '' : $content);
	}
	return $files;
}

function sqlmnger_export_files_zip($files) {
	if (!class_exists('ZipArchive')) return false;
	$tmp = tempnam(sys_get_temp_dir(), 'dbz');
	if ($tmp === false) return false;
	$path = $tmp . '.zip';
	@unlink($tmp);
	$zip = new ZipArchive();
	if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
		@unlink($path);
		return false;
	}
	foreach ($files as $f) {
		$n = isset($f['name']) ? preg_replace('/[\\\\\\/]+/', '_', $f['name']) : 'file.dat';
		$zip->addFromString($n, isset($f['content']) ? $f['content'] : '');
	}
	$zip->close();
	$bin = @file_get_contents($path);
	@unlink($path);
	return $bin;
}
