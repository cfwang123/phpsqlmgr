<?php
/**
 * 服务器概览：版本、用户、数据库列表（及校对/表数/大小等，按引擎尽力提供）
 * POST/GET 需登录
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$h = sqlmnger_open_handle(null);
try {
	$info = sqlmnger_server_info($h);
	$pub = sqlmnger_session_public();
	$info['connection'] = $pub;
	$info['current'] = $pub && isset($pub['database']) ? $pub['database'] : '';
	sqlmnger_json_ok($info);
} catch (Exception $e) {
	sqlmnger_json_err('ERR', $e->getMessage(), 500, null);
}
sqlmnger_close_handle($h);

/**
 * @return array
 */
function sqlmnger_server_info($h) {
	$driver = $h['driver'];
	$version = '';
	$user = '';
	$databases = array();

	if ($driver === 'mysql') {
		$r = sqlmnger_query_all($h, 'SELECT VERSION()', array());
		if (!empty($r['rows'][0][0])) {
			$version = strval($r['rows'][0][0]);
		}
		$ru = sqlmnger_query_all($h, 'SELECT USER()', array());
		if (!empty($ru['rows'][0][0])) {
			$user = strval($ru['rows'][0][0]);
		}
		// 库 + 默认校对
		$rs = sqlmnger_query_all($h,
			'SELECT SCHEMA_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME',
			array()
		);
		$map = array();
		foreach ($rs['rows'] as $row) {
			$name = isset($row[0]) ? strval($row[0]) : '';
			if ($name === '') continue;
			$map[$name] = array(
				'name' => $name,
				'collation' => isset($row[1]) ? $row[1] : null,
				'table_count' => null,
				'data_size' => null,
				'index_size' => null,
				'size' => null,
			);
		}
		// 表数 + 数据/索引/合计大小（information_schema，与 sqlinfo 同源字段）
		$rz = sqlmnger_query_all($h,
			'SELECT TABLE_SCHEMA, COUNT(*),
			        SUM(DATA_LENGTH), SUM(INDEX_LENGTH),
			        SUM(DATA_LENGTH + INDEX_LENGTH)
			 FROM information_schema.TABLES
			 GROUP BY TABLE_SCHEMA',
			array()
		);
		foreach ($rz['rows'] as $row) {
			$n = isset($row[0]) ? strval($row[0]) : '';
			if ($n === '' || !isset($map[$n])) continue;
			$map[$n]['table_count'] = isset($row[1]) ? intval($row[1]) : 0;
			$map[$n]['data_size'] = isset($row[2]) ? intval($row[2]) : 0;
			$map[$n]['index_size'] = isset($row[3]) ? intval($row[3]) : 0;
			$map[$n]['size'] = isset($row[4]) ? intval($row[4]) : 0;
		}
		foreach ($map as $db) {
			$databases[] = $db;
		}
	} elseif ($driver === 'sqlite') {
		$version = '';
		try {
			$r = sqlmnger_query_all($h, 'SELECT sqlite_version()', array());
			if (!empty($r['rows'][0][0])) {
				$version = 'SQLite ' . strval($r['rows'][0][0]);
			}
		} catch (Exception $e) {
			$version = 'SQLite';
		}
		$pub = sqlmnger_session_public();
		$path = $pub && !empty($pub['path']) ? $pub['path'] : ($h['database'] !== '' ? $h['database'] : 'main');
		$user = '';
		$databases[] = array(
			'name' => $path,
			'collation' => null,
			'table_count' => null,
			'data_size' => null,
			'index_size' => null,
			'size' => null,
		);
	} else {
		// SQL Server
		try {
			$r = sqlmnger_query_all($h, 'SELECT @@VERSION', array());
			if (!empty($r['rows'][0][0])) {
				$version = strval($r['rows'][0][0]);
				// 只取第一行简介
				$nl = strpos($version, "\n");
				if ($nl !== false) {
					$version = trim(substr($version, 0, $nl));
				}
			}
		} catch (Exception $e) {
			$version = 'SQL Server';
		}
		try {
			$ru = sqlmnger_query_all($h, 'SELECT SUSER_SNAME()', array());
			if (!empty($ru['rows'][0][0])) {
				$user = strval($ru['rows'][0][0]);
			}
		} catch (Exception $e2) {
			$user = '';
		}
		$rs = sqlmnger_query_all($h,
			'SELECT name, collation_name, state_desc FROM sys.databases ORDER BY name',
			array()
		);
		foreach ($rs['rows'] as $row) {
			$databases[] = array(
				'name' => isset($row[0]) ? strval($row[0]) : '',
				'collation' => isset($row[1]) ? $row[1] : null,
				'state' => isset($row[2]) ? $row[2] : null,
				'table_count' => null,
				'data_size' => null,
				'index_size' => null,
				'size' => null,
			);
		}
	}

	$pub = sqlmnger_session_public();
	return array(
		'driver' => $driver,
		'version' => $version,
		'user' => $user !== '' ? $user : (isset($pub['user']) ? $pub['user'] : ''),
		'host' => isset($pub['host']) ? $pub['host'] : '',
		'databases' => $databases,
	);
}
