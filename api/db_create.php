<?php
/**
 * 创建数据库
 * POST { name, charset?, collation? }
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
sqlmnger_require_not_readonly();
$body = sqlmnger_read_json_body();
$name = isset($body['name']) ? trim(strval($body['name'])) : '';
if ($name === '' || !preg_match('/^[A-Za-z0-9_\x80-\xff\-]+$/u', $name)) {
	sqlmnger_json_err('BAD_REQ', '数据库名不合法（仅字母数字下划线等）', 400, null);
}
$charset = isset($body['charset']) ? trim(strval($body['charset'])) : '';
$collation = isset($body['collation']) ? trim(strval($body['collation'])) : '';

$h = sqlmnger_open_handle(null);
$driver = $h['driver'];

try {
	if ($driver === 'mysql') {
		$q = sqlmnger_ident_quote($driver, $name);
		$sql = 'CREATE DATABASE ' . $q;
		if ($charset !== '' && preg_match('/^[A-Za-z0-9_]+$/', $charset)) {
			$sql .= ' CHARACTER SET ' . $charset;
		}
		if ($collation !== '' && preg_match('/^[A-Za-z0-9_]+$/', $collation)) {
			$sql .= ' COLLATE ' . $collation;
		}
		sqlmnger_exec($h, $sql, array());
	} elseif ($driver === 'sqlsrv' || $driver === 'mssql_tcp') {
		$q = sqlmnger_ident_quote($driver, $name);
		$sql = 'CREATE DATABASE ' . $q;
		// SQL Server：COLLATE 放在库名后
		if ($collation !== '' && preg_match('/^[A-Za-z0-9_]+$/', $collation)) {
			$sql .= ' COLLATE ' . $collation;
		}
		sqlmnger_exec($h, $sql, array());
	} else {
		sqlmnger_json_err('UNSUPPORTED', 'SQLite 不支持创建数据库（使用文件路径连接）', 400, null);
	}
	sqlmnger_json_ok(array(
		'ok' => true,
		'name' => $name,
		'charset' => $charset,
		'collation' => $collation,
	));
} catch (Exception $e) {
	sqlmnger_json_err('ERR', $e->getMessage(), 400, null);
}
sqlmnger_close_handle($h);
