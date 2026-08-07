<?php
/**
 * 已登录会话下的真实库操作（MySQL / SQLite / SQL Server / Oracle）
 * 依赖 _bootstrap.php
 * 兼容 PHP 5.5.12+
 */

require_once __DIR__ . '/_bootstrap.php';

/**
 * Oracle 限定表名："SCHEMA"."TABLE"；schema 空则仅表名
 */
function sqlmnger_oracle_qtable($driver, $schema, $table) {
	$qTable = sqlmnger_ident_quote($driver, $table);
	$schema = strval($schema);
	if ($schema === '') {
		return $qTable;
	}
	return sqlmnger_ident_quote($driver, $schema) . '.' . $qTable;
}

/**
 * 解析 Oracle schema：优先 $database；空则查 USER
 */
function sqlmnger_oracle_resolve_schema($h, $database) {
	$schema = trim(strval($database));
	if ($schema !== '') {
		return $schema;
	}
	if (isset($h['database']) && strval($h['database']) !== '') {
		// open_handle 可能把当前 schema 放在 database 字段（非 Service Name）
		$cand = trim(strval($h['database']));
		if ($cand !== '' && (!isset($h['service_name']) || strcasecmp($cand, strval($h['service_name'])) !== 0)) {
			return $cand;
		}
	}
	$r = sqlmnger_query_all($h, 'SELECT USER FROM DUAL', array());
	if (!empty($r['rows'][0][0])) {
		return strval($r['rows'][0][0]);
	}
	return '';
}

/**
 * 解密得到完整连接数组（含 password 明文，仅服务端内存使用）
 */
function sqlmnger_session_conn_full() {
	sqlmnger_require_login();
	$cid = sqlmnger_request_conn_id();
	$c = sqlmnger_conn_get($cid);
	if ($c === null) {
		sqlmnger_json_err('UNAUTHORIZED', '连接无效', 401, null);
	}
	$pass = '';
	if (!empty($c['password_enc'])) {
		$dec = sqlmnger_vault_decrypt($c['password_enc']);
		if ($dec !== false) {
			$pass = $dec;
		}
	}
	return array(
		'id' => $cid,
		'driver' => isset($c['driver']) ? $c['driver'] : '',
		'host' => isset($c['host']) ? $c['host'] : '',
		'port' => isset($c['port']) ? intval($c['port']) : 0,
		'database' => isset($c['database']) ? $c['database'] : '',
		'user' => isset($c['user']) ? $c['user'] : '',
		'password' => $pass,
		'path' => isset($c['path']) ? $c['path'] : '',
		'readonly' => !empty($c['readonly']),
		'encrypt' => isset($c['encrypt']) ? $c['encrypt'] : '',
		'tls' => !empty($c['tls']),
	);
}

function sqlmnger_require_not_readonly() {
	$c = sqlmnger_session_conn_full();
	if (!empty($c['readonly'])) {
		sqlmnger_json_err('READONLY', '当前为只读连接，禁止写操作', 403, null);
	}
}

/**
 * 打开连接句柄
 * @return array array(type=>pdo|sqlsrv, handle=>, driver=>, close=>callable)
 */
function sqlmnger_open_handle($databaseOverride) {
	$c = sqlmnger_session_conn_full();
	$driver = $c['driver'];
	$db = ($databaseOverride !== null && $databaseOverride !== '')
		? $databaseOverride
		: $c['database'];

	if ($driver === 'mysql') {
		if (!extension_loaded('pdo_mysql')) {
			sqlmnger_json_err('EXT', '缺少 pdo_mysql', 500, null);
		}
		$host = $c['host'] !== '' ? $c['host'] : '127.0.0.1';
		$port = $c['port'] > 0 ? $c['port'] : 3306;
		$dsn = 'mysql:host=' . $host . ';port=' . $port . ';charset=utf8';
		if ($db !== '') {
			$dsn .= ';dbname=' . $db;
		}
		try {
			$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
			if ($cto < 1) {
				$cto = 8;
			}
			$pdo = new PDO($dsn, $c['user'], $c['password'], array(
				PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
				PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
				PDO::ATTR_TIMEOUT => $cto,
			));
		} catch (Exception $e) {
			sqlmnger_json_err('CONNECT', '打开连接失败', 500, $e->getMessage());
		}
		return array(
			'type' => 'pdo',
			'handle' => $pdo,
			'driver' => 'mysql',
			'database' => $db,
			'close' => function () use ($pdo) { $pdo = null; },
		);
	}

	if ($driver === 'sqlite') {
		if (!extension_loaded('pdo_sqlite')) {
			sqlmnger_json_err('EXT', '缺少 pdo_sqlite', 500, null);
		}
		$path = $c['path'];
		try {
			$pdo = new PDO('sqlite:' . $path, null, null, array(
				PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
				PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
			));
		} catch (Exception $e) {
			sqlmnger_json_err('CONNECT', '打开 SQLite 失败', 500, $e->getMessage());
		}
		return array(
			'type' => 'pdo',
			'handle' => $pdo,
			'driver' => 'sqlite',
			'database' => $path,
			'close' => function () use ($pdo) { $pdo = null; },
		);
	}

	if ($driver === 'sqlsrv') {
		if (!extension_loaded('sqlsrv')) {
			sqlmnger_json_err('EXT', '缺少 sqlsrv', 500, null);
		}
		// sp_rename 等会返回严重级别 10 的「注意」消息；默认 WarningsReturnAsErrors=1 会当成失败
		if (function_exists('sqlsrv_configure')) {
			@sqlsrv_configure('WarningsReturnAsErrors', 0);
		}
		$host = $c['host'] !== '' ? $c['host'] : '127.0.0.1';
		$port = $c['port'] > 0 ? $c['port'] : 1433;
		$server = $host . ',' . $port;
		$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
		if ($cto < 1) {
			$cto = 8;
		}
		$info = array(
			'UID' => $c['user'],
			'PWD' => $c['password'],
			'CharacterSet' => 'UTF-8',
			'ReturnDatesAsStrings' => true,
			'LoginTimeout' => $cto,
		);
		if ($db !== '') {
			$info['Database'] = $db;
		}
		$h = @sqlsrv_connect($server, $info);
		if ($h === false) {
			$errs = sqlsrv_errors();
			$msg = is_array($errs) && isset($errs[0]['message']) ? $errs[0]['message'] : 'sqlsrv 连接失败';
			sqlmnger_json_err('CONNECT', '打开连接失败', 500, $msg);
		}
		return array(
			'type' => 'sqlsrv',
			'handle' => $h,
			'driver' => 'sqlsrv',
			'database' => $db,
			'close' => function () use ($h) { @sqlsrv_close($h); },
		);
	}

	// 自研 TCP/TDS（无 sqlsrv 扩展；支持 PRELOGIN 后 TLS）
	if ($driver === 'mssql_tcp') {
		require_once __DIR__ . '/tds/TdsClient.php';
		$host = $c['host'] !== '' ? $c['host'] : '127.0.0.1';
		$port = $c['port'] > 0 ? $c['port'] : 1433;
		$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
		if ($cto < 1) {
			$cto = 8;
		}
		$opts = array(
			'encrypt' => sqlmnger_cfg('mssql_tcp_encrypt', 'auto'),
			'trustServerCertificate' => sqlmnger_cfg('mssql_tcp_trust_server_certificate', true),
		);
		if (isset($c['encrypt']) && strval($c['encrypt']) !== '') {
			$opts['encrypt'] = $c['encrypt'];
		}
		if (array_key_exists('trust_server_certificate', $c)) {
			$opts['trustServerCertificate'] = !!$c['trust_server_certificate'];
		}
		$client = new SqlmngerTdsClient();
		$ok = $client->connect($host, $port, $c['user'], $c['password'], $db, $cto * 1000, $opts);
		if (!$ok) {
			$msg = $client->getLastError();
			if ($msg === null || $msg === '') {
				$msg = 'TCP/TDS 连接失败';
			}
			sqlmnger_json_err('CONNECT', '打开连接失败', 500, $msg);
		}
		return array(
			'type' => 'tds',
			'handle' => $client,
			'driver' => 'mssql_tcp',
			'database' => $db,
			'tls' => $client->isTlsEnabled(),
			'close' => function () use ($client) {
				try {
					$client->disconnect();
				} catch (Exception $e) {
					// ignore
				}
			},
		);
	}

	// .NET CLI（SqlClient / Schannel，推荐 PHP 5.5 远程加密）
	if ($driver === 'mssql_net') {
		require_once __DIR__ . '/tds/MssqlNetClient.php';
		$host = $c['host'] !== '' ? $c['host'] : '127.0.0.1';
		$port = $c['port'] > 0 ? $c['port'] : 1433;
		$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
		if ($cto < 1) {
			$cto = 8;
		}
		$opts = array(
			'encrypt' => sqlmnger_cfg('mssql_tcp_encrypt', 'auto'),
			'trustServerCertificate' => sqlmnger_cfg('mssql_tcp_trust_server_certificate', true),
		);
		if (isset($c['encrypt']) && strval($c['encrypt']) !== '') {
			$opts['encrypt'] = $c['encrypt'];
		}
		if (array_key_exists('trust_server_certificate', $c)) {
			$opts['trustServerCertificate'] = !!$c['trust_server_certificate'];
		}
		$client = new SqlmngerMssqlNetClient();
		$ok = $client->connect($host, $port, $c['user'], $c['password'], $db, $cto * 1000, $opts);
		if (!$ok) {
			$msg = $client->getLastError();
			if ($msg === null || $msg === '') {
				$msg = '.NET CLI 连接失败';
			}
			sqlmnger_json_err('CONNECT', '打开连接失败', 500, $msg);
		}
		return array(
			'type' => 'tds', // 与 TdsClient 相同 execute 接口，复用 query/exec 路径
			'handle' => $client,
			'driver' => 'mssql_net',
			'database' => $db,
			'tls' => $client->isTlsEnabled(),
			'close' => function () use ($client) {
				try {
					$client->disconnect();
				} catch (Exception $e) {
					// ignore
				}
			},
		);
	}

	// Oracle .NET CLI（Oracle.ManagedDataAccess；database 登录=Service Name，进库后 schema 列表）
	if ($driver === 'oracle_net') {
		require_once __DIR__ . '/tds/MssqlNetClient.php';
		$host = $c['host'] !== '' ? $c['host'] : '127.0.0.1';
		$port = $c['port'] > 0 ? $c['port'] : 1521;
		$cto = intval(sqlmnger_cfg('connect_timeout_sec', 8));
		if ($cto < 1) {
			$cto = 8;
		}
		// 连接必须用登录时的 Service Name；override 仅为当前 schema（勿当 service）
		$service = $c['database'];
		$schema = ($databaseOverride !== null && $databaseOverride !== '')
			? strval($databaseOverride)
			: '';
		$opts = array('engine' => 'oracle');
		$client = SqlmngerMssqlNetClient::create('oracle');
		$ok = $client->connect($host, $port, $c['user'], $c['password'], $service, $cto * 1000, $opts);
		if (!$ok) {
			$msg = $client->getLastError();
			if ($msg === null || $msg === '') {
				$msg = 'Oracle .NET CLI 连接失败';
			}
			sqlmnger_json_err('CONNECT', '打开连接失败', 500, $msg);
		}
		return array(
			'type' => 'tds',
			'handle' => $client,
			'driver' => 'oracle_net',
			'database' => $schema !== '' ? $schema : $service,
			'service_name' => $service,
			'tls' => $client->isTlsEnabled(),
			'close' => function () use ($client) {
				try {
					$client->disconnect();
				} catch (Exception $e) {
					// ignore
				}
			},
		);
	}

	sqlmnger_json_err('DRIVER', '不支持的引擎', 400, $driver);
	return null;
}

function sqlmnger_close_handle($h) {
	if (is_array($h) && isset($h['close']) && is_callable($h['close'])) {
		$fn = $h['close'];
		$fn();
	}
}

function sqlmnger_ident_quote($driver, $name) {
	$name = strval($name);
	// 拒绝危险字符（仍 quote）
	if ($driver === 'mysql') {
		return '`' . str_replace('`', '``', $name) . '`';
	}
	if ($driver === 'sqlite' || sqlmnger_is_oracle_family($driver)) {
		return '"' . str_replace('"', '""', $name) . '"';
	}
	// sqlsrv / mssql_tcp / mssql_net
	return '[' . str_replace(']', ']]', $name) . ']';
}

/**
 * 将 ? 占位参数内联到 SQL（TDS 无 prepared statement）
 * @param callable|string|null $quoteFn 默认 sqlmnger_tds_quote_value；Oracle 用 sqlmnger_oracle_quote_value
 */
function sqlmnger_tds_inline_params($sql, $params, $quoteFn = null) {
	if (!is_array($params) || count($params) === 0) {
		return $sql;
	}
	if ($quoteFn === null || $quoteFn === '') {
		$quoteFn = 'sqlmnger_tds_quote_value';
	}
	$sql = strval($sql);
	$out = '';
	$pi = 0;
	$n = strlen($sql);
	$inS = false;
	for ($i = 0; $i < $n; $i++) {
		$ch = $sql[$i];
		if ($ch === "'") {
			// 简单字符串内单引号加倍
			if ($inS && $i + 1 < $n && $sql[$i + 1] === "'") {
				$out .= "''";
				$i++;
				continue;
			}
			$inS = !$inS;
			$out .= $ch;
			continue;
		}
		if (!$inS && $ch === '?' && $pi < count($params)) {
			$out .= call_user_func($quoteFn, $params[$pi]);
			$pi++;
			continue;
		}
		$out .= $ch;
	}
	return $out;
}

function sqlmnger_tds_quote_value($v) {
	if ($v === null) {
		return 'NULL';
	}
	if (is_bool($v)) {
		return $v ? '1' : '0';
	}
	if (is_int($v) || is_float($v)) {
		return strval($v);
	}
	// 资源/数组：转字符串
	if (is_array($v)) {
		// sqlsrv 参数有时是 array($val, SQLSRV_PARAM_IN)
		if (array_key_exists(0, $v)) {
			return sqlmnger_tds_quote_value($v[0]);
		}
	}
	$s = strval($v);
	return "N'" . str_replace("'", "''", $s) . "'";
}

/** Oracle 字符串字面量：'...'（非 N'...'） */
function sqlmnger_oracle_quote_value($v) {
	if ($v === null) {
		return 'NULL';
	}
	if (is_bool($v)) {
		return $v ? '1' : '0';
	}
	if (is_int($v) || is_float($v)) {
		return strval($v);
	}
	if (is_array($v) && array_key_exists(0, $v)) {
		return sqlmnger_oracle_quote_value($v[0]);
	}
	$s = strval($v);
	return "'" . str_replace("'", "''", $s) . "'";
}

/** 按驱动选 TDS 参数引用函数名 */
function sqlmnger_tds_quote_fn_for_driver($driver) {
	if (sqlmnger_is_oracle_family($driver)) {
		return 'sqlmnger_oracle_quote_value';
	}
	return 'sqlmnger_tds_quote_value';
}

/**
 * @param SqlmngerTdsClient $client
 * @return array columns + rows[][]
 */
function sqlmnger_tds_query_all($client, $sql) {
	$r = $client->execute($sql);
	if (!empty($r['error'])) {
		sqlmnger_json_err('SQL', '查询失败', 400, $r['error']);
	}
	return sqlmnger_tds_normalize_result($r);
}

/**
 * TDS 软查询：失败返回 false（不 exit），用于方言回退
 * @return array|false
 */
function sqlmnger_tds_query_all_soft($client, $sql) {
	$r = $client->execute($sql);
	if (!empty($r['error'])) {
		return false;
	}
	return sqlmnger_tds_normalize_result($r);
}

/**
 * 将 CLI execute 结果规范为 columns + rows[][]
 * @param array $r
 * @return array
 */
function sqlmnger_tds_normalize_result($r) {
	$cols = isset($r['columns']) && is_array($r['columns']) ? $r['columns'] : array();
	$rows = array();
	$rowFmt = isset($r['row_format']) ? strval($r['row_format']) : '';
	if (!empty($r['rows']) && is_array($r['rows'])) {
		foreach ($r['rows'] as $ra) {
			if (!is_array($ra)) {
				continue;
			}
			// mssql_net 默认 array 行：[[v0,v1],...]，避免按列名二次映射
			$isList = ($rowFmt === 'array');
			if (!$isList) {
				// 无标记时：存在 0 下标且不像关联列名 → 数组行
				$firstCol = (count($cols) > 0) ? $cols[0] : null;
				$isList = array_key_exists(0, $ra) && ($firstCol === null || !array_key_exists($firstCol, $ra));
			}
			if ($isList) {
				$line = array();
				$n = count($ra);
				$lim = (count($cols) > 0) ? count($cols) : $n;
				for ($i = 0; $i < $lim; $i++) {
					$v = array_key_exists($i, $ra) ? $ra[$i] : null;
					$line[] = sqlmnger_cell_export($v);
				}
				$rows[] = $line;
				continue;
			}
			$line = array();
			if (count($cols) === 0) {
				$cols = array_keys($ra);
			}
			foreach ($cols as $cn) {
				$v = array_key_exists($cn, $ra) ? $ra[$cn] : null;
				$line[] = sqlmnger_cell_export($v);
			}
			$rows[] = $line;
		}
	}
	return array('columns' => $cols, 'rows' => $rows);
}

function sqlmnger_tds_exec($client, $sql) {
	$r = $client->execute($sql);
	if (!empty($r['error'])) {
		// 与 sqlsrv 一致：部分注意消息可忽略
		$msg = strval($r['error']);
		if (
			strpos($msg, '15477') !== false
			|| stripos($msg, 'Changing any part of an object name') !== false
			|| strpos($msg, '更改对象名') !== false
		) {
			return 0;
		}
		sqlmnger_json_err('SQL', '执行失败', 400, $msg);
	}
	return isset($r['rows_affected']) ? intval($r['rows_affected']) : 0;
}

/**
 * 执行查询返回二维数组 rows + 列名
 */
function sqlmnger_query_all($h, $sql, $params) {
	if (!is_array($params)) {
		$params = array();
	}
	if ($h['type'] === 'pdo') {
		/** @var PDO $pdo */
		$pdo = $h['handle'];
		try {
			if (count($params) > 0) {
				$st = $pdo->prepare($sql);
				$st->execute($params);
			} else {
				$st = $pdo->query($sql);
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
			return array('columns' => $cols, 'rows' => $rows);
		} catch (Exception $e) {
			sqlmnger_json_err('SQL', '查询失败', 400, $e->getMessage());
		}
	}

	// 自研 TCP/TDS / .NET CLI
	if ($h['type'] === 'tds') {
		/** @var SqlmngerTdsClient $client */
		$client = $h['handle'];
		$qfn = sqlmnger_tds_quote_fn_for_driver(isset($h['driver']) ? $h['driver'] : '');
		$sqlRun = sqlmnger_tds_inline_params($sql, $params, $qfn);
		return sqlmnger_tds_query_all($client, $sqlRun);
	}

	// sqlsrv
	$handle = $h['handle'];
	if (count($params) > 0) {
		$stmt = @sqlsrv_query($handle, $sql, $params);
	} else {
		$stmt = @sqlsrv_query($handle, $sql);
	}
	if ($stmt === false) {
		$errs = sqlsrv_errors();
		$msg = is_array($errs) && isset($errs[0]['message']) ? $errs[0]['message'] : 'sqlsrv 查询失败';
		sqlmnger_json_err('SQL', '查询失败', 400, $msg);
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
	return array('columns' => $cols, 'rows' => $rows);
}

/**
 * sqlsrv 错误是否仅为警告/提示（无真正失败）
 * sp_rename 成功时常见：注意: 更改对象名的任一部分都可能会破坏脚本和存储过程。
 * （消息号 15477；sqlsrv 默认 WarningsReturnAsErrors 会把其当失败）
 */
function sqlmnger_sqlsrv_errors_are_warnings_only($errs) {
	if (!is_array($errs) || !count($errs)) {
		return false;
	}
	foreach ($errs as $e) {
		if (!is_array($e)) {
			return false;
		}
		$state = isset($e['SQLSTATE']) ? strval($e['SQLSTATE']) : '';
		$code = isset($e['code']) ? intval($e['code']) : 0;
		$msg = isset($e['message']) ? strval($e['message']) : '';
		// 已知无害：sp_rename 提示（中/英/繁）
		if (
			$code === 15477
			|| stripos($msg, 'Changing any part of an object name') !== false
			|| strpos($msg, '更改对象名') !== false
			|| strpos($msg, '更改物件名稱') !== false
		) {
			continue;
		}
		// SQLSTATE 00xxx / 01xxx = 成功或警告
		if ($state !== '' && (strpos($state, '00') === 0 || strpos($state, '01') === 0)) {
			continue;
		}
		// 其它 → 真错误
		return false;
	}
	return true;
}

/** 拼接 sqlsrv 错误消息 */
function sqlmnger_sqlsrv_errors_message($errs) {
	if (!is_array($errs) || !count($errs)) {
		return 'sqlsrv 错误';
	}
	$parts = array();
	foreach ($errs as $e) {
		if (is_array($e) && isset($e['message'])) {
			$parts[] = strval($e['message']);
		}
	}
	return count($parts) ? implode(' | ', $parts) : 'sqlsrv 错误';
}

function sqlmnger_exec($h, $sql, $params) {
	if (!is_array($params)) {
		$params = array();
	}
	if ($h['type'] === 'pdo') {
		$pdo = $h['handle'];
		try {
			if (count($params) > 0) {
				$st = $pdo->prepare($sql);
				$st->execute($params);
				return $st->rowCount();
			}
			return $pdo->exec($sql);
		} catch (Exception $e) {
			sqlmnger_json_err('SQL', '执行失败', 400, $e->getMessage());
		}
	}
	if ($h['type'] === 'tds') {
		/** @var SqlmngerTdsClient $client */
		$client = $h['handle'];
		$qfn = sqlmnger_tds_quote_fn_for_driver(isset($h['driver']) ? $h['driver'] : '');
		$sqlRun = sqlmnger_tds_inline_params($sql, $params, $qfn);
		return sqlmnger_tds_exec($client, $sqlRun);
	}
	$handle = $h['handle'];
	if (count($params) > 0) {
		$stmt = @sqlsrv_query($handle, $sql, $params);
	} else {
		$stmt = @sqlsrv_query($handle, $sql);
	}
	if ($stmt === false) {
		$errs = sqlsrv_errors();
		// 仅 sp_rename 类注意消息：实际已成功，勿当失败
		if (sqlmnger_sqlsrv_errors_are_warnings_only($errs)) {
			return 0;
		}
		$msg = sqlmnger_sqlsrv_errors_message($errs);
		sqlmnger_json_err('SQL', '执行失败', 400, $msg);
	}
	$n = sqlsrv_rows_affected($stmt);
	sqlsrv_free_stmt($stmt);
	return $n;
}

function sqlmnger_cell_export($v) {
	if ($v === null) {
		return null;
	}
	if (is_bool($v)) {
		return $v ? 1 : 0;
	}
	if (is_resource($v)) {
		return '[resource]';
	}
	// 大对象截断展示
	if (is_string($v) && strlen($v) > 200000) {
		return substr($v, 0, 200000) . '…';
	}
	return $v;
}

function sqlmnger_list_databases($h) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		$r = sqlmnger_query_all($h, 'SHOW DATABASES', array());
		$list = array();
		foreach ($r['rows'] as $row) {
			if (isset($row[0])) {
				$list[] = strval($row[0]);
			}
		}
		return $list;
	}
	if ($driver === 'sqlite') {
		return array($h['database'] !== '' ? $h['database'] : 'main');
	}
	// Oracle：进库后「库列表」= schema（用户）列表
	if (sqlmnger_is_oracle_family($driver)) {
		$list = array();
		$r = null;
		if ($h['type'] === 'tds') {
			$r = sqlmnger_tds_query_all_soft($h['handle'], 'SELECT USERNAME FROM ALL_USERS ORDER BY 1');
			if ($r === false) {
				$r = sqlmnger_tds_query_all_soft($h['handle'], 'SELECT USER FROM DUAL');
			}
		}
		if ($r === null || $r === false) {
			// 非 tds 或软查均失败：硬查 USER
			$r = sqlmnger_query_all($h, 'SELECT USER FROM DUAL', array());
		}
		foreach ($r['rows'] as $row) {
			if (isset($row[0]) && strval($row[0]) !== '') {
				$list[] = strval($row[0]);
			}
		}
		return $list;
	}
	// sqlsrv / mssql_*
	$r = sqlmnger_query_all($h, 'SELECT name FROM sys.databases ORDER BY name', array());
	$list = array();
	foreach ($r['rows'] as $row) {
		if (isset($row[0])) {
			$list[] = strval($row[0]);
		}
	}
	return $list;
}

function sqlmnger_list_tables($h, $database) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		// 若指定库且当前未 use，用 information_schema
		$sql = 'SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, TABLE_COMMENT
			FROM information_schema.TABLES
			WHERE TABLE_SCHEMA = ?
			ORDER BY TABLE_NAME';
		$r = sqlmnger_query_all($h, $sql, array($database));
		$out = array();
		foreach ($r['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => (isset($row[1]) && stripos(strval($row[1]), 'VIEW') !== false) ? 'view' : 'table',
				'engine' => isset($row[2]) ? $row[2] : null,
				'rows_est' => isset($row[3]) ? $row[3] : null,
				'comment' => isset($row[4]) ? $row[4] : null,
			);
		}
		return $out;
	}
	if ($driver === 'sqlite') {
		$r = sqlmnger_query_all($h, "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name", array());
		$out = array();
		foreach ($r['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => isset($row[1]) ? $row[1] : 'table',
				'engine' => null,
				'rows_est' => null,
				'comment' => null,
			);
		}
		return $out;
	}
	// Oracle：schema = $database（空则当前 USER）
	if (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$owner = strtoupper($schema);
		$out = array();
		$sql = 'SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME';
		$r = sqlmnger_query_all($h, $sql, array($owner));
		foreach ($r['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => 'table',
				'schema' => $schema,
				'engine' => null,
				'rows_est' => null,
				'comment' => null,
			);
		}
		$sql2 = 'SELECT VIEW_NAME FROM ALL_VIEWS WHERE OWNER = ? ORDER BY VIEW_NAME';
		$r2 = sqlmnger_query_all($h, $sql2, array($owner));
		foreach ($r2['rows'] as $row) {
			$out[] = array(
				'name' => $row[0],
				'type' => 'view',
				'schema' => $schema,
				'engine' => null,
				'rows_est' => null,
				'comment' => null,
			);
		}
		return $out;
	}
	// sqlsrv — 默认 dbo
	$sql = "SELECT t.name, t.type_desc
		FROM sys.tables t
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = 'dbo'
		ORDER BY t.name";
	$r = sqlmnger_query_all($h, $sql, array());
	$out = array();
	foreach ($r['rows'] as $row) {
		$out[] = array(
			'name' => $row[0],
			'type' => 'table',
			'schema' => 'dbo',
			'engine' => null,
			'rows_est' => null,
			'comment' => null,
		);
	}
	// views
	$sql2 = "SELECT v.name FROM sys.views v
		INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
		WHERE s.name = 'dbo' ORDER BY v.name";
	$r2 = sqlmnger_query_all($h, $sql2, array());
	foreach ($r2['rows'] as $row) {
		$out[] = array(
			'name' => $row[0],
			'type' => 'view',
			'schema' => 'dbo',
			'engine' => null,
			'rows_est' => null,
			'comment' => null,
		);
	}
	return $out;
}

/**
 * 表结构：列 + 索引 + 主键列
 * @param array|null $opts light=true 时跳过索引与 create_sql（表数据页热路径，少 1～2 次往返）
 */
function sqlmnger_table_structure($h, $database, $table, $opts = null) {
	$driver = $h['driver'];
	$qTable = sqlmnger_ident_quote($driver, $table);
	$light = is_array($opts) && !empty($opts['light']);

	if ($driver === 'mysql') {
		$cols = array();
		$r = sqlmnger_query_all($h, 'SHOW FULL COLUMNS FROM ' . $qTable, array());
		// Field, Type, Collation, Null, Key, Default, Extra, Privileges, Comment
		// SHOW 列名可能是 Field...
		foreach ($r['rows'] as $row) {
			// 用 columns 名映射更稳：重新查 information_schema
		}
		$sql = 'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT, CHARACTER_SET_NAME, COLLATION_NAME, ORDINAL_POSITION
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
			ORDER BY ORDINAL_POSITION';
		$r = sqlmnger_query_all($h, $sql, array($database, $table));
		$pk = array();
		foreach ($r['rows'] as $row) {
			$col = array(
				'name' => $row[0],
				'type' => $row[1],
				'nullable' => (isset($row[2]) && strtoupper(strval($row[2])) === 'YES'),
				'key' => $row[3],
				'default' => $row[4],
				'extra' => $row[5],
				'comment' => $row[6],
				'charset' => $row[7],
				'collation' => $row[8],
				'pos' => intval($row[9]),
				'is_primary' => (isset($row[3]) && $row[3] === 'PRI'),
			);
			$cols[] = $col;
			if ($col['is_primary']) {
				$pk[] = $col['name'];
			}
		}

		// 索引（light 模式跳过）
		$indexes = array();
		if (!$light) {
			$idxMap = array();
			$ri = sqlmnger_query_all($h, 'SHOW INDEX FROM ' . $qTable, array());
			// Table, Non_unique, Key_name, Seq_in_index, Column_name, ...
			$colNames = $ri['columns'];
			$iKey = array_search('Key_name', $colNames);
			$iNon = array_search('Non_unique', $colNames);
			$iSeq = array_search('Seq_in_index', $colNames);
			$iCol = array_search('Column_name', $colNames);
			$iType = array_search('Index_type', $colNames);
			if ($iKey === false) {
				// 回退位置
				$iNon = 1; $iKey = 2; $iSeq = 3; $iCol = 4; $iType = 10;
			}
			foreach ($ri['rows'] as $row) {
				$kn = isset($row[$iKey]) ? strval($row[$iKey]) : '';
				if ($kn === '') {
					continue;
				}
				if (!isset($idxMap[$kn])) {
					$idxMap[$kn] = array(
						'name' => $kn,
						'unique' => (isset($row[$iNon]) && intval($row[$iNon]) === 0),
						'primary' => ($kn === 'PRIMARY'),
						'type' => isset($row[$iType]) ? $row[$iType] : null,
						'columns' => array(),
					);
				}
				if (isset($row[$iCol])) {
					$idxMap[$kn]['columns'][] = $row[$iCol];
				}
			}
			$indexes = array_values($idxMap);
		}

		return array(
			'columns' => $cols,
			'indexes' => $indexes,
			'primary_key' => $pk,
			'table' => $table,
			'database' => $database,
			'create_sql' => $light ? null : sqlmnger_table_create_sql($h, $database, $table),
		);
	}

	if ($driver === 'sqlite') {
		$r = sqlmnger_query_all($h, 'PRAGMA table_info(' . $qTable . ')', array());
		// cid, name, type, notnull, dflt_value, pk
		$cols = array();
		$pk = array();
		foreach ($r['rows'] as $row) {
			$isPk = !empty($row[5]);
			$cols[] = array(
				'name' => $row[1],
				'type' => $row[2],
				'nullable' => empty($row[3]),
				'key' => $isPk ? 'PRI' : '',
				'default' => $row[4],
				'extra' => '',
				'comment' => '',
				'is_primary' => $isPk,
				'pos' => intval($row[0]),
			);
			if ($isPk) {
				$pk[] = $row[1];
			}
		}
		$indexes = array();
		if (!$light) {
			$ri = sqlmnger_query_all($h, 'PRAGMA index_list(' . $qTable . ')', array());
			foreach ($ri['rows'] as $row) {
				// seq, name, unique, origin, partial
				$iname = $row[1];
				$unique = !empty($row[2]);
				$ix = sqlmnger_query_all($h, 'PRAGMA index_info(' . sqlmnger_ident_quote($driver, $iname) . ')', array());
				$icols = array();
				foreach ($ix['rows'] as $ir) {
					// seqno, cid, name
					$icols[] = $ir[2];
				}
				$indexes[] = array(
					'name' => $iname,
					'unique' => $unique,
					'primary' => false,
					'type' => null,
					'columns' => $icols,
				);
			}
		}
		return array(
			'columns' => $cols,
			'indexes' => $indexes,
			'primary_key' => $pk,
			'table' => $table,
			'database' => $database,
			'create_sql' => $light ? null : sqlmnger_table_create_sql($h, $database, $table),
		);
	}

	// Oracle：ALL_TAB_COLUMNS + PK + indexes
	if (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$owner = strtoupper($schema);
		$tab = strtoupper(strval($table));
		$sql = 'SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID, DATA_DEFAULT
			FROM ALL_TAB_COLUMNS
			WHERE OWNER = ? AND TABLE_NAME = ?
			ORDER BY COLUMN_ID';
		$r = sqlmnger_query_all($h, $sql, array($owner, $tab));
		$cols = array();
		foreach ($r['rows'] as $row) {
			$dtype = strtoupper(strval($row[1]));
			$len = isset($row[2]) ? $row[2] : null;
			$prec = isset($row[3]) ? $row[3] : null;
			$scale = isset($row[4]) ? $row[4] : null;
			$typeStr = $dtype;
			if ($prec !== null && strval($prec) !== '' && (
				strpos($dtype, 'NUMBER') !== false || strpos($dtype, 'FLOAT') !== false
				|| strpos($dtype, 'DECIMAL') !== false || strpos($dtype, 'NUMERIC') !== false
			)) {
				if ($scale !== null && strval($scale) !== '' && intval($scale) !== 0) {
					$typeStr = $dtype . '(' . intval($prec) . ',' . intval($scale) . ')';
				} else {
					$typeStr = $dtype . '(' . intval($prec) . ')';
				}
			} elseif ($len !== null && strval($len) !== '' && (
				strpos($dtype, 'CHAR') !== false || strpos($dtype, 'RAW') !== false
			)) {
				$typeStr = $dtype . '(' . intval($len) . ')';
			}
			$nullRaw = isset($row[5]) ? strtoupper(strval($row[5])) : 'Y';
			$cols[] = array(
				'name' => $row[0],
				'type' => $typeStr,
				'nullable' => ($nullRaw === 'Y' || $nullRaw === 'YES'),
				'key' => '',
				'default' => isset($row[7]) ? $row[7] : null,
				'extra' => '',
				'comment' => '',
				'is_primary' => false,
				'pos' => isset($row[6]) ? intval($row[6]) : 0,
			);
		}
		$sqlPk = "SELECT cc.COLUMN_NAME
			FROM ALL_CONSTRAINTS c
			INNER JOIN ALL_CONS_COLUMNS cc
				ON c.OWNER = cc.OWNER AND c.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
			WHERE c.CONSTRAINT_TYPE = 'P' AND c.OWNER = ? AND c.TABLE_NAME = ?
			ORDER BY cc.POSITION";
		$rpk = sqlmnger_query_all($h, $sqlPk, array($owner, $tab));
		$pk = array();
		foreach ($rpk['rows'] as $row) {
			if (isset($row[0])) {
				$pk[] = $row[0];
			}
		}
		foreach ($cols as $k => $col) {
			if (in_array($col['name'], $pk, true)) {
				$cols[$k]['is_primary'] = true;
				$cols[$k]['key'] = 'PRI';
			}
		}
		$indexes = array();
		if (!$light) {
			$sqlIx = "SELECT i.INDEX_NAME, i.UNIQUENESS, ic.COLUMN_NAME, ic.COLUMN_POSITION
				FROM ALL_INDEXES i
				INNER JOIN ALL_IND_COLUMNS ic
					ON i.OWNER = ic.INDEX_OWNER AND i.INDEX_NAME = ic.INDEX_NAME
				WHERE i.TABLE_OWNER = ? AND i.TABLE_NAME = ?
				ORDER BY i.INDEX_NAME, ic.COLUMN_POSITION";
			$rix = sqlmnger_query_all($h, $sqlIx, array($owner, $tab));
			$idxMap = array();
			foreach ($rix['rows'] as $row) {
				$kn = strval($row[0]);
				if ($kn === '') {
					continue;
				}
				if (!isset($idxMap[$kn])) {
					$uniq = isset($row[1]) ? strtoupper(strval($row[1])) : '';
					$idxMap[$kn] = array(
						'name' => $kn,
						'unique' => ($uniq === 'UNIQUE'),
						'primary' => in_array($kn, $pk, true), // 粗略；PK 索引名常不同
						'type' => null,
						'columns' => array(),
					);
				}
				if (isset($row[2])) {
					$idxMap[$kn]['columns'][] = $row[2];
				}
			}
			// 按 PK 列集合标记 primary
			foreach ($idxMap as $kn => $ix) {
				if (count($pk) > 0 && $ix['columns'] === $pk) {
					$idxMap[$kn]['primary'] = true;
				}
			}
			$indexes = array_values($idxMap);
		}
		return array(
			'columns' => $cols,
			'indexes' => $indexes,
			'primary_key' => $pk,
			'table' => $table,
			'database' => $schema,
			'create_sql' => $light ? null : sqlmnger_table_create_sql($h, $schema, $table),
		);
	}

	// sqlsrv
	$sql = "SELECT c.name, ty.name AS type_name, c.max_length, c.precision, c.scale, c.is_nullable, c.column_id
		FROM sys.columns c
		INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
		INNER JOIN sys.tables t ON c.object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE s.name = 'dbo' AND t.name = ?
		ORDER BY c.column_id";
	$r = sqlmnger_query_all($h, $sql, array($table));
	$cols = array();
	foreach ($r['rows'] as $row) {
		$type = strval($row[1]);
		$cols[] = array(
			'name' => $row[0],
			'type' => $type,
			'nullable' => !empty($row[5]),
			'key' => '',
			'default' => null,
			'extra' => '',
			'comment' => '',
			'is_primary' => false,
			'pos' => intval($row[6]),
		);
	}
	// PK
	$sqlPk = "SELECT c.name
		FROM sys.indexes i
		INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		INNER JOIN sys.tables t ON i.object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE i.is_primary_key = 1 AND s.name = 'dbo' AND t.name = ?
		ORDER BY ic.key_ordinal";
	$rpk = sqlmnger_query_all($h, $sqlPk, array($table));
	$pk = array();
	foreach ($rpk['rows'] as $row) {
		$pk[] = $row[0];
	}
	foreach ($cols as $k => $col) {
		if (in_array($col['name'], $pk, true)) {
			$cols[$k]['is_primary'] = true;
			$cols[$k]['key'] = 'PRI';
		}
	}
	// indexes（light 跳过）
	$indexes = array();
	if (!$light) {
		$sqlIx = "SELECT i.name, i.is_unique, i.is_primary_key, c.name AS col_name, ic.key_ordinal
			FROM sys.indexes i
			INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
			INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
			INNER JOIN sys.tables t ON i.object_id = t.object_id
			INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
			WHERE s.name = 'dbo' AND t.name = ? AND i.name IS NOT NULL
			ORDER BY i.name, ic.key_ordinal";
		$rix = sqlmnger_query_all($h, $sqlIx, array($table));
		$idxMap = array();
		foreach ($rix['rows'] as $row) {
			$kn = strval($row[0]);
			if (!isset($idxMap[$kn])) {
				$idxMap[$kn] = array(
					'name' => $kn,
					'unique' => !empty($row[1]),
					'primary' => !empty($row[2]),
					'type' => null,
					'columns' => array(),
				);
			}
			$idxMap[$kn]['columns'][] = $row[3];
		}
		$indexes = array_values($idxMap);
	}
	return array(
		'columns' => $cols,
		'indexes' => $indexes,
		'primary_key' => $pk,
		'table' => $table,
		'database' => $database,
		'create_sql' => $light ? null : sqlmnger_table_create_sql($h, $database, $table),
	);
}

/**
 * 表 DDL：MySQL SHOW CREATE TABLE；SQLite sqlite_master；SQL Server 尽力 OBJECT_DEFINITION / 注释
 * @return string|null
 */
function sqlmnger_table_create_sql($h, $database, $table) {
	$driver = $h['driver'];
	$qTable = sqlmnger_ident_quote($driver, $table);
	try {
		if ($driver === 'mysql') {
			// SHOW CREATE TABLE `t` → columns Table, Create Table
			$r = sqlmnger_query_all($h, 'SHOW CREATE TABLE ' . $qTable, array());
			if (empty($r['rows'][0])) {
				return null;
			}
			$row = $r['rows'][0];
			// 通常第 2 列是 Create Table
			if (isset($row[1]) && strval($row[1]) !== '') {
				return strval($row[1]);
			}
			// 按列名
			$cols = isset($r['columns']) ? $r['columns'] : array();
			for ($i = 0; $i < count($cols); $i++) {
				$cn = strtolower(strval($cols[$i]));
				if ($cn === 'create table' || strpos($cn, 'create') !== false) {
					if (isset($row[$i])) {
						return strval($row[$i]);
					}
				}
			}
			return null;
		}
		if ($driver === 'sqlite') {
			$r = sqlmnger_query_all(
				$h,
				"SELECT sql FROM sqlite_master WHERE type IN ('table','view') AND name = ? LIMIT 1",
				array($table)
			);
			if (!empty($r['rows'][0][0])) {
				return strval($r['rows'][0][0]);
			}
			return null;
		}
		// Oracle：尝试 DBMS_METADATA，失败返回简略注释或空串
		if (sqlmnger_is_oracle_family($driver)) {
			$schema = sqlmnger_oracle_resolve_schema($h, $database);
			$owner = strtoupper($schema);
			$tab = strtoupper(strval($table));
			if ($h['type'] === 'tds') {
				$sql = "SELECT DBMS_METADATA.GET_DDL('TABLE', "
					. sqlmnger_oracle_quote_value($tab) . ', '
					. sqlmnger_oracle_quote_value($owner) . ') FROM DUAL';
				$r = sqlmnger_tds_query_all_soft($h['handle'], $sql);
				if ($r !== false && !empty($r['rows'][0][0])) {
					return strval($r['rows'][0][0]);
				}
			}
			return "-- Oracle 表 DDL（DBMS_METADATA 不可用或失败）\n"
				. '-- 对象: "' . str_replace('"', '""', $owner) . '"."' . str_replace('"', '""', $tab) . "\"\n";
		}
		// sqlsrv / mssql_tcp：表通常无 MODULE definition；视图才有
		if (sqlmnger_is_mssql_family($driver)) {
			$obj = 'dbo.' . $table;
			$r = sqlmnger_query_all(
				$h,
				"SELECT m.definition
				FROM sys.sql_modules m
				INNER JOIN sys.objects o ON m.object_id = o.object_id
				INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
				WHERE s.name = N'dbo' AND o.name = ? AND o.type IN ('V', 'P', 'FN', 'IF', 'TF')",
				array($table)
			);
			if (!empty($r['rows'][0][0])) {
				return strval($r['rows'][0][0]);
			}
			// 表：返回说明 + 可手改的框架
			return "-- SQL Server 用户表无 SHOW CREATE 等价物\n"
				. "-- 对象: [" . str_replace(']', ']]', $table) . "]\n"
				. "-- 可在「SQL 命令」中执行: EXEC sp_help N'dbo." . str_replace("'", "''", $table) . "'\n";
		}
	} catch (Exception $e) {
		return null;
	}
	return null;
}

/**
 * 读取表数据 → columns 元数据(给 Grid) + rows 二维
 */
/**
 * 表数据。$where 为可选 SQL 条件片段（不含 WHERE 关键字，仿 HeidiSQL 过滤器）。
 * $limit / $offset：分页；返回 total_matched 为条件匹配总行数。
 * 管理端工具：由用户书写条件，拒绝多语句与明显危险片段。
 */
/**
 * 解析前端 sort 规格为 [ ['name'=>col, 'dir'=>1|-1], ... ]
 * 支持：
 * - 字符串 "col:1,col2:-1"（与 hash s= 一致）
 * - 数组 [{name|field, dir}, ...]
 * - 对象 { keys:[...], name, dir } / 单列 {name, dir}
 *
 * @param mixed $sort
 * @return array
 */
function sqlmnger_parse_sort_spec($sort) {
	$out = array();
	if ($sort === null || $sort === '' || $sort === false) {
		return $out;
	}
	// 字符串：col:1,col2:-1
	if (is_string($sort)) {
		$parts = explode(',', $sort);
		foreach ($parts as $p) {
			$p = trim(strval($p));
			if ($p === '') {
				continue;
			}
			$idx = strrpos($p, ':');
			if ($idx === false) {
				$idx = strrpos($p, '.');
			}
			if ($idx === false || $idx <= 0) {
				continue;
			}
			$name = trim(substr($p, 0, $idx));
			$dirRaw = trim(substr($p, $idx + 1));
			if ($name === '') {
				continue;
			}
			$dir = (strval($dirRaw) === '-1' || strtolower($dirRaw) === 'desc') ? -1 : 1;
			$out[] = array('name' => $name, 'dir' => $dir);
		}
		return $out;
	}
	if (!is_array($sort)) {
		return $out;
	}
	// 带 keys 的对象
	$list = array();
	if (isset($sort['keys']) && is_array($sort['keys'])) {
		$list = $sort['keys'];
	} elseif (isset($sort[0]) || array_key_exists(0, $sort)) {
		// 数字下标数组
		$list = $sort;
	} elseif (isset($sort['name']) || isset($sort['field'])) {
		$list = array($sort);
	}
	foreach ($list as $item) {
		if (!is_array($item)) {
			continue;
		}
		$name = '';
		if (isset($item['name']) && strval($item['name']) !== '') {
			$name = strval($item['name']);
		} elseif (isset($item['field']) && strval($item['field']) !== '') {
			// 纯数字 field 不可靠，跳过
			$f = strval($item['field']);
			if (preg_match('/^\d+$/', $f)) {
				continue;
			}
			$name = $f;
		}
		if ($name === '') {
			continue;
		}
		$dirRaw = isset($item['dir']) ? $item['dir'] : 1;
		$dir = (strval($dirRaw) === '-1' || strtolower(strval($dirRaw)) === 'desc') ? -1 : 1;
		$out[] = array('name' => $name, 'dir' => $dir);
	}
	return $out;
}

/**
 * 根据允许列名生成 ORDER BY 子句（含前导空格），非法列名丢弃。
 * $forOver：true 时用于 ROW_NUMBER() OVER (ORDER BY ...)，不带 "ORDER BY" 前缀以外的语义相同。
 *
 * @param string $driver
 * @param mixed $sort
 * @param array $allowedNames 真实列名列表
 * @param bool $forOver 若 true 返回 "col ASC, col2 DESC"；false 返回 " ORDER BY col ASC..."
 * @return string
 */
function sqlmnger_build_order_by_sql($driver, $sort, $allowedNames, $forOver) {
	if ($forOver === null) {
		$forOver = false;
	}
	$keys = sqlmnger_parse_sort_spec($sort);
	if (count($keys) === 0) {
		return '';
	}
	// 列名 → 真实名（大小写不敏感回退）
	$byLower = array();
	$allowed = array();
	foreach ($allowedNames as $cn) {
		$cn = strval($cn);
		if ($cn === '') {
			continue;
		}
		$allowed[$cn] = $cn;
		$byLower[strtolower($cn)] = $cn;
	}
	$parts = array();
	$seen = array();
	$maxKeys = 8;
	foreach ($keys as $k) {
		if (count($parts) >= $maxKeys) {
			break;
		}
		$name = isset($k['name']) ? strval($k['name']) : '';
		if ($name === '') {
			continue;
		}
		// 拒绝注入：仅允许结构中已存在的列
		$real = null;
		if (isset($allowed[$name])) {
			$real = $allowed[$name];
		} elseif (isset($byLower[strtolower($name)])) {
			$real = $byLower[strtolower($name)];
		}
		if ($real === null || $real === '') {
			continue;
		}
		if (preg_match('/[;\x00-\x1f]/', $real)) {
			continue;
		}
		if (isset($seen[strtolower($real)])) {
			continue;
		}
		$seen[strtolower($real)] = true;
		$dir = (isset($k['dir']) && intval($k['dir']) === -1) ? 'DESC' : 'ASC';
		$parts[] = sqlmnger_ident_quote($driver, $real) . ' ' . $dir;
	}
	if (count($parts) === 0) {
		return '';
	}
	$inner = implode(', ', $parts);
	if ($forOver) {
		return $inner;
	}
	return ' ORDER BY ' . $inner;
}

/**
 * @param mixed $sort 可选排序（见 sqlmnger_parse_sort_spec）
 */
function sqlmnger_table_data_payload($h, $database, $table, $limit, $where, $offset, $sort = null) {
	if ($where === null) {
		$where = '';
	}
	if ($offset === null) {
		$offset = 0;
	}
	$driver = $h['driver'];
	// light：只要列名 + PK，跳过索引/DDL（mssql_net 每次结构查询都是跨进程 RPC）
	$struct = sqlmnger_table_structure($h, $database, $table, array('light' => true));
	$qTable = sqlmnger_ident_quote($driver, $table);
	if (sqlmnger_is_mssql_family($driver)) {
		$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$qTable = sqlmnger_oracle_qtable($driver, $schema, $table);
	}

	// 允许排序的列名（结构列；视图在 sqlsrv 结构查询可能为空，再补一轮对象列）
	$allowedNames = array();
	if (!empty($struct['columns']) && is_array($struct['columns'])) {
		foreach ($struct['columns'] as $sc) {
			if (is_array($sc) && isset($sc['name'])) {
				$allowedNames[] = strval($sc['name']);
			}
		}
	}
	if (count($allowedNames) === 0 && sqlmnger_is_mssql_family($driver)) {
		// 表 + 视图列（structure 目前只查 sys.tables）
		$sqlCols = "SELECT c.name
			FROM sys.columns c
			INNER JOIN sys.objects o ON c.object_id = o.object_id
			INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
			WHERE s.name = 'dbo' AND o.name = ? AND o.type IN ('U', 'V')
			ORDER BY c.column_id";
		$rc = sqlmnger_query_all($h, $sqlCols, array($table));
		foreach ($rc['rows'] as $row) {
			if (isset($row[0]) && strval($row[0]) !== '') {
				$allowedNames[] = strval($row[0]);
			}
		}
	}

	// limit：>0 每页行数；0 或负数 = 不限（单页拉全量，有软上限防炸内存）
	$limit = intval($limit);
	$unlimited = ($limit <= 0);
	$maxFetch = intval(sqlmnger_cfg('max_fetch_rows', 1000000));
	if ($unlimited) {
		$limit = 0;
	} else {
		if ($maxFetch > 0 && $limit > $maxFetch) {
			$limit = $maxFetch;
		}
	}
	$offset = intval($offset);
	if ($offset < 0) {
		$offset = 0;
	}
	if ($unlimited) {
		$offset = 0;
	}

	$whereSql = sqlmnger_sanitize_where_clause($where);
	$orderSql = sqlmnger_build_order_by_sql($driver, $sort, $allowedNames, false);
	$orderOver = sqlmnger_build_order_by_sql($driver, $sort, $allowedNames, true);
	$appliedSort = sqlmnger_parse_sort_spec($sort);
	// 只保留真正生效的列
	if ($orderSql === '') {
		$appliedSort = array();
	} else {
		// 用 allowed 解析结果再编一次干净列表
		$appliedSort = array();
		$tmp = sqlmnger_parse_sort_spec($sort);
		$byLower = array();
		foreach ($allowedNames as $cn) {
			$byLower[strtolower(strval($cn))] = strval($cn);
		}
		foreach ($tmp as $k) {
			$nm = isset($k['name']) ? strval($k['name']) : '';
			$real = null;
			foreach ($allowedNames as $cn) {
				if ($cn === $nm) {
					$real = $cn;
					break;
				}
			}
			if ($real === null && isset($byLower[strtolower($nm)])) {
				$real = $byLower[strtolower($nm)];
			}
			if ($real === null) {
				continue;
			}
			$appliedSort[] = array(
				'name' => $real,
				'dir' => (isset($k['dir']) && intval($k['dir']) === -1) ? -1 : 1,
			);
			if (count($appliedSort) >= 8) {
				break;
			}
		}
	}

	// 总行数（WHERE 后）
	$countSql = 'SELECT COUNT(*) AS cnt FROM ' . $qTable . $whereSql;
	$cr = sqlmnger_query_all($h, $countSql, array());
	$totalMatched = 0;
	if (!empty($cr['rows']) && isset($cr['rows'][0][0])) {
		$totalMatched = intval($cr['rows'][0][0]);
	}
	// 偏移超出时夹到末页
	if (!$unlimited && $limit > 0 && $totalMatched > 0 && $offset >= $totalMatched) {
		$offset = (int) (floor(($totalMatched - 1) / $limit) * $limit);
	}
	if ($totalMatched === 0) {
		$offset = 0;
	}

	// 不限：仍设软上限，避免一次拖垮浏览器/内存（config unlimited_soft_max）
	$softMax = intval(sqlmnger_cfg('unlimited_soft_max', 2000000));
	if ($softMax < 1) {
		$softMax = 2000000;
	}
	if ($driver === 'mysql' || $driver === 'sqlite') {
		if ($unlimited) {
			$sql = 'SELECT * FROM ' . $qTable . $whereSql . $orderSql . ' LIMIT ' . $softMax;
		} else {
			$sql = 'SELECT * FROM ' . $qTable . $whereSql . $orderSql
				. ' LIMIT ' . $limit . ' OFFSET ' . $offset;
		}
		$r = sqlmnger_query_all($h, $sql, array());
	} elseif (sqlmnger_is_oracle_family($driver)) {
		// Oracle 12c+：OFFSET/FETCH；失败回退 ROWNUM 双层
		$ord = ($orderSql !== '') ? $orderSql : ' ORDER BY 1';
		$pageLimit = $unlimited ? $softMax : $limit;
		$pageOffset = $unlimited ? 0 : $offset;
		if ($unlimited) {
			$sql = 'SELECT * FROM ' . $qTable . $whereSql . $ord
				. ' FETCH FIRST ' . intval($pageLimit) . ' ROWS ONLY';
		} else {
			$sql = 'SELECT * FROM ' . $qTable . $whereSql . $ord
				. ' OFFSET ' . intval($pageOffset) . ' ROWS FETCH NEXT ' . intval($pageLimit) . ' ROWS ONLY';
		}
		$r = false;
		if ($h['type'] === 'tds') {
			$qfn = sqlmnger_tds_quote_fn_for_driver($driver);
			$sqlRun = sqlmnger_tds_inline_params($sql, array(), $qfn);
			$r = sqlmnger_tds_query_all_soft($h['handle'], $sqlRun);
		}
		if ($r === false) {
			$sql = sqlmnger_oracle_rownum_paged_sql(
				$qTable,
				$whereSql,
				$ord,
				$pageLimit,
				$pageOffset,
				$unlimited
			);
			$r = sqlmnger_query_all($h, $sql, array());
		}
		// 去掉 ROWNUM 辅助列
		if (!empty($r['columns'])) {
			$rnIdx = null;
			foreach ($r['columns'] as $ci => $cn) {
				if (strval($cn) === '__sqlmnger_rn' || strtoupper(strval($cn)) === '__SQLMNGER_RN') {
					$rnIdx = $ci;
					break;
				}
			}
			if ($rnIdx !== null) {
				array_splice($r['columns'], $rnIdx, 1);
				foreach ($r['rows'] as $ri => $row) {
					if (is_array($row) && array_key_exists($rnIdx, $row)) {
						array_splice($r['rows'][$ri], $rnIdx, 1);
					}
				}
			}
		}
	} else {
		// SQL Server：不用 OFFSET/FETCH（旧版/兼容级别易报错），改用 ROW_NUMBER（2005+）
		$sql = sqlmnger_sqlsrv_paged_sql(
			$qTable,
			$whereSql,
			$unlimited ? $softMax : $limit,
			$offset,
			$unlimited,
			$orderOver
		);
		$r = sqlmnger_query_all($h, $sql, array());
	}

	// 去掉 SQL Server 分页辅助列
	if (sqlmnger_is_mssql_family($driver) && !empty($r['columns']) && $r['columns'][0] === '__sqlmnger_rn') {
		array_shift($r['columns']);
		$ri = 0;
		foreach ($r['rows'] as $ri => $row) {
			if (is_array($row) && count($row) > 0) {
				array_shift($r['rows'][$ri]);
			}
		}
	}
	$colNames = $r['columns'];
	$pk = $struct['primary_key'];

	// Grid columns 定义
	$gridCols = array();
	$i = 0;
	foreach ($colNames as $cn) {
		$meta = null;
		foreach ($struct['columns'] as $sc) {
			if ($sc['name'] === $cn) {
				$meta = $sc;
				break;
			}
		}
		$isPk = in_array($cn, $pk, true);
		$w = 100;
		if ($meta && isset($meta['type'])) {
			$t = strtolower(strval($meta['type']));
			if (strpos($t, 'int') !== false) {
				$w = 70;
			}
			if (strpos($t, 'char') !== false || strpos($t, 'text') !== false) {
				$w = 140;
			}
		}
		$gridCols[] = array(
			'field' => $i,
			't' => $cn,
			'w' => $w,
			'name' => $cn,
			'editable' => !$isPk,
			'is_primary' => $isPk,
			'type' => $meta ? $meta['type'] : '',
		);
		$i++;
	}

	$rowCount = count($r['rows']);
	if ($unlimited || $limit <= 0) {
		$page = 1;
		$pageCount = 1;
		$effLimit = 0; // 前端显示「不限」
	} else {
		$page = (int) floor($offset / $limit) + 1;
		$pageCount = (int) ceil($totalMatched / $limit);
		if ($pageCount < 1) {
			$pageCount = 1;
		}
		$effLimit = $limit;
	}

	return array(
		'columns' => $gridCols,
		'rows' => $r['rows'],
		'total' => $rowCount, // 本页行数（兼容旧字段）
		'total_matched' => $totalMatched, // 条件匹配总行数
		'primary_key' => $pk,
		'database' => $database,
		'table' => $table,
		'limit' => $effLimit, // 0 = 不限
		'offset' => $offset,
		'page' => $page,
		'page_count' => $pageCount,
		'row_from' => $rowCount > 0 ? ($offset + 1) : 0,
		'row_to' => $rowCount > 0 ? ($offset + $rowCount) : 0,
		'where' => trim(strval($where)),
		'sort' => $appliedSort, // 服务端实际应用的排序
		'structure_columns' => $struct['columns'],
	);
}

/**
 * SQL Server 分页：ROW_NUMBER（兼容 2005+，避免 OFFSET/FETCH 语法错误）
 * $unlimited 时 offset 忽略，仅 TOP 语义（ROW_NUMBER <= softLimit）
 * $orderOver：OVER 内排序表达式，空则 (SELECT NULL)
 */
function sqlmnger_sqlsrv_paged_sql($qTable, $whereSql, $limit, $offset, $unlimited, $orderOver = '') {
	$limit = intval($limit);
	$offset = intval($offset);
	if ($limit <= 0) {
		$limit = 2000000;
	}
	if ($offset < 0) {
		$offset = 0;
	}
	if ($orderOver === null || trim(strval($orderOver)) === '') {
		$orderOver = '(SELECT NULL)';
	} else {
		$orderOver = trim(strval($orderOver));
	}
	// 内层用别名，避免 * 与 rn 冲突；外层去掉 rn 由调用方 strip 列
	$inner = 'SELECT ROW_NUMBER() OVER (ORDER BY ' . $orderOver . ') AS [__sqlmnger_rn], [__t].*'
		. ' FROM ' . $qTable . ' AS [__t]' . $whereSql;
	if ($unlimited || $offset === 0) {
		// 首页或不限：等价 TOP n
		return 'SELECT * FROM (' . $inner . ') AS [__pg] WHERE [__sqlmnger_rn] <= ' . $limit;
	}
	$end = $offset + $limit;
	return 'SELECT * FROM (' . $inner . ') AS [__pg]'
		. ' WHERE [__sqlmnger_rn] > ' . $offset
		. ' AND [__sqlmnger_rn] <= ' . $end;
}

/**
 * Oracle ROWNUM 双层分页（OFFSET/FETCH 不可用时）
 * $orderSql 须含前导 " ORDER BY ..."
 */
function sqlmnger_oracle_rownum_paged_sql($qTable, $whereSql, $orderSql, $limit, $offset, $unlimited) {
	$limit = intval($limit);
	$offset = intval($offset);
	if ($limit <= 0) {
		$limit = 2000000;
	}
	if ($offset < 0) {
		$offset = 0;
	}
	if ($orderSql === null || trim(strval($orderSql)) === '') {
		$orderSql = ' ORDER BY 1';
	}
	$end = ($unlimited || $offset === 0) ? $limit : ($offset + $limit);
	$inner = 'SELECT * FROM ' . $qTable . $whereSql . $orderSql;
	$mid = 'SELECT a.*, ROWNUM AS "__sqlmnger_rn" FROM (' . $inner . ') a WHERE ROWNUM <= ' . intval($end);
	return 'SELECT * FROM (' . $mid . ') WHERE "__sqlmnger_rn" > ' . intval($offset);
}

/**
 * 将用户输入的 WHERE 片段规范为 " WHERE (...)" 或空串。
 * 禁止分号多语句、注释、UNION 等常见注入拼装。
 */
function sqlmnger_sanitize_where_clause($where) {
	$where = trim(strval($where));
	if ($where === '') {
		return '';
	}
	// 允许用户写了 WHERE 前缀
	if (preg_match('/^\s*where\s+/i', $where)) {
		$where = trim(preg_replace('/^\s*where\s+/i', '', $where));
	}
	if ($where === '') {
		return '';
	}
	if (strlen($where) > 8000) {
		sqlmnger_json_err('BAD_WHERE', 'WHERE 条件过长', 400, null);
	}
	// 禁止多语句 / 注释 / 明显越权关键字
	if (strpos($where, ';') !== false) {
		sqlmnger_json_err('BAD_WHERE', 'WHERE 中不允许分号', 400, null);
	}
	if (preg_match('/--|\\/\\*|\\*\\/|#/', $where)) {
		sqlmnger_json_err('BAD_WHERE', 'WHERE 中不允许 SQL 注释', 400, null);
	}
	if (preg_match('/\\b(union|into\\s+outfile|into\\s+dumpfile|load_file|benchmark|sleep\\s*\\(|pg_sleep|waitfor\\s+delay|xp_cmdshell)\\b/i', $where)) {
		sqlmnger_json_err('BAD_WHERE', 'WHERE 含有不允许的关键字', 400, null);
	}
	return ' WHERE (' . $where . ')';
}

/**
 * 按主键更新一行部分字段
 * $keys: name=>value, $set: name=>value
 */
function sqlmnger_update_row($h, $database, $table, $keys, $set) {
	$driver = $h['driver'];
	if (!is_array($keys) || count($keys) < 1) {
		sqlmnger_json_err('NO_KEY', '缺少主键，无法更新', 400, null);
	}
	if (!is_array($set) || count($set) < 1) {
		sqlmnger_json_err('NO_SET', '没有要更新的字段', 400, null);
	}

	$qTable = sqlmnger_ident_quote($driver, $table);
	if (sqlmnger_is_mssql_family($driver)) {
		$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$qTable = sqlmnger_oracle_qtable($driver, $schema, $table);
	}

	$setParts = array();
	$params = array();
	foreach ($set as $k => $v) {
		$setParts[] = sqlmnger_ident_quote($driver, $k) . ' = ?';
		$params[] = $v;
	}
	$whereParts = array();
	foreach ($keys as $k => $v) {
		if ($v === null) {
			$whereParts[] = sqlmnger_ident_quote($driver, $k) . ' IS NULL';
		} else {
			$whereParts[] = sqlmnger_ident_quote($driver, $k) . ' = ?';
			$params[] = $v;
		}
	}
	$sql = 'UPDATE ' . $qTable . ' SET ' . implode(', ', $setParts) . ' WHERE ' . implode(' AND ', $whereParts);
	// 限制只更新 1 行：MySQL 可加 LIMIT 1
	if ($driver === 'mysql') {
		$sql .= ' LIMIT 1';
	}

	$n = sqlmnger_exec($h, $sql, $params);
	return array('affected' => $n, 'sql' => $sql);
}

/**
 * 删除索引
 */
function sqlmnger_drop_index($h, $database, $table, $indexName) {
	$driver = $h['driver'];
	$indexName = strval($indexName);
	if ($indexName === '' || strtoupper($indexName) === 'PRIMARY') {
		sqlmnger_json_err('BAD_INDEX', '不能删除 PRIMARY 或空索引名（请用改主键流程）', 400, null);
	}
	$qTable = sqlmnger_ident_quote($driver, $table);
	$qIdx = sqlmnger_ident_quote($driver, $indexName);
	if ($driver === 'mysql') {
		$sql = 'DROP INDEX ' . $qIdx . ' ON ' . $qTable;
	} elseif ($driver === 'sqlite') {
		$sql = 'DROP INDEX ' . $qIdx;
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$sql = 'DROP INDEX ' . sqlmnger_oracle_qtable($driver, $schema, $indexName);
	} else {
		$sql = 'DROP INDEX ' . $qIdx . ' ON ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	}
	sqlmnger_exec($h, $sql, array());
	return true;
}

/**
 * 创建索引
 * $cols: array of column names, $unique bool
 */
function sqlmnger_create_index($h, $database, $table, $indexName, $cols, $unique) {
	$driver = $h['driver'];
	$indexName = trim(strval($indexName));
	if ($indexName === '' || !is_array($cols) || count($cols) < 1) {
		sqlmnger_json_err('BAD_INDEX', '索引名与列不能为空', 400, null);
	}
	$qTable = sqlmnger_ident_quote($driver, $table);
	$qIdx = sqlmnger_ident_quote($driver, $indexName);
	$qCols = array();
	foreach ($cols as $c) {
		$qCols[] = sqlmnger_ident_quote($driver, $c);
	}
	$u = $unique ? 'UNIQUE ' : '';
	if ($driver === 'mysql') {
		$sql = 'CREATE ' . $u . 'INDEX ' . $qIdx . ' ON ' . $qTable . ' (' . implode(', ', $qCols) . ')';
	} elseif ($driver === 'sqlite') {
		$sql = 'CREATE ' . $u . 'INDEX ' . $qIdx . ' ON ' . $qTable . ' (' . implode(', ', $qCols) . ')';
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$qFull = sqlmnger_oracle_qtable($driver, $schema, $table);
		$qIxFull = sqlmnger_oracle_qtable($driver, $schema, $indexName);
		$sql = 'CREATE ' . $u . 'INDEX ' . $qIxFull . ' ON ' . $qFull . ' (' . implode(', ', $qCols) . ')';
	} else {
		$sql = 'CREATE ' . $u . 'INDEX ' . $qIdx . ' ON ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable . ' (' . implode(', ', $qCols) . ')';
	}
	sqlmnger_exec($h, $sql, array());
	return true;
}

/**
 * 解析当前请求中的 database（body 或 session）
 */
function sqlmnger_req_database($body) {
	if (isset($body['database']) && strval($body['database']) !== '') {
		return strval($body['database']);
	}
	if (isset($body['db']) && strval($body['db']) !== '') {
		return strval($body['db']);
	}
	$c = sqlmnger_session_conn_full();
	return isset($c['database']) ? $c['database'] : '';
}


/**
 * 修改列（MySQL 完整；SQLite/sqlsrv 尽力）
 * $spec: name, type, nullable, default, comment, new_name?
 */
function sqlmnger_column_modify($h, $database, $table, $spec) {
	$driver = $h['driver'];
	$name = isset($spec['name']) ? strval($spec['name']) : '';
	$type = isset($spec['type']) ? trim(strval($spec['type'])) : '';
	if ($name === '' || $type === '') {
		sqlmnger_json_err('BAD_COL', '列名与类型不能为空', 400, null);
	}
	$nullable = !empty($spec['nullable']);
	$default = array_key_exists('default', $spec) ? $spec['default'] : null;
	$comment = isset($spec['comment']) ? strval($spec['comment']) : '';
	$newName = isset($spec['new_name']) ? trim(strval($spec['new_name'])) : '';
	if ($newName === '') {
		$newName = $name;
	}

	$qTable = sqlmnger_ident_quote($driver, $table);
	$qOld = sqlmnger_ident_quote($driver, $name);
	$qNew = sqlmnger_ident_quote($driver, $newName);
	$nullSql = $nullable ? 'NULL' : 'NOT NULL';
	$defSql = sqlmnger_default_sql($driver, $default, $nullable);

	if ($driver === 'mysql') {
		$cmt = " COMMENT " . sqlmnger_sql_string($comment);
		if ($newName !== $name) {
			$sql = 'ALTER TABLE ' . $qTable . ' CHANGE COLUMN ' . $qOld . ' ' . $qNew . ' ' . $type . ' ' . $nullSql . $defSql . $cmt;
		} else {
			$sql = 'ALTER TABLE ' . $qTable . ' MODIFY COLUMN ' . $qOld . ' ' . $type . ' ' . $nullSql . $defSql . $cmt;
		}
		sqlmnger_exec($h, $sql, array());
		return true;
	}

	if ($driver === 'sqlite') {
		// SQLite 仅支持 rename column（3.25+）与有限能力
		if ($newName !== $name) {
			$sql = 'ALTER TABLE ' . $qTable . ' RENAME COLUMN ' . $qOld . ' TO ' . $qNew;
			sqlmnger_exec($h, $sql, array());
			return true;
		}
		sqlmnger_json_err('LIMITED', 'SQLite 不支持完整 MODIFY COLUMN，请重建表或仅重命名', 400, null);
	}

	// sqlsrv：改名 sp_rename，再按需 ALTER COLUMN
	$colForAlter = $name;
	if ($newName !== $name) {
		sqlmnger_exec($h, sqlmnger_sqlsrv_rename_column_sql($table, $name, $newName), array());
		$colForAlter = $newName;
	}
	$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable
		. ' ALTER COLUMN ' . sqlmnger_ident_quote($driver, $colForAlter) . ' ' . $type . ' ' . $nullSql;
	sqlmnger_exec($h, $sql, array());
	return true;
}

function sqlmnger_column_add($h, $database, $table, $spec) {
	$driver = $h['driver'];
	$name = isset($spec['name']) ? strval($spec['name']) : '';
	$type = isset($spec['type']) ? trim(strval($spec['type'])) : '';
	if ($name === '' || $type === '') {
		sqlmnger_json_err('BAD_COL', '列名与类型不能为空', 400, null);
	}
	$nullable = !isset($spec['nullable']) ? true : !empty($spec['nullable']);
	$default = array_key_exists('default', $spec) ? $spec['default'] : null;
	$comment = isset($spec['comment']) ? strval($spec['comment']) : '';
	$qTable = sqlmnger_ident_quote($driver, $table);
	$qName = sqlmnger_ident_quote($driver, $name);
	$nullSql = $nullable ? 'NULL' : 'NOT NULL';
	$defSql = sqlmnger_default_sql($driver, $default, $nullable);

	if ($driver === 'mysql') {
		$cmt = " COMMENT " . sqlmnger_sql_string($comment);
		$sql = 'ALTER TABLE ' . $qTable . ' ADD COLUMN ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql . $cmt;
	} elseif ($driver === 'sqlite') {
		$sql = 'ALTER TABLE ' . $qTable . ' ADD COLUMN ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql;
	} else {
		$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable
			. ' ADD ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql;
	}
	sqlmnger_exec($h, $sql, array());
	return true;
}

function sqlmnger_column_drop($h, $database, $table, $name) {
	$driver = $h['driver'];
	$name = strval($name);
	if ($name === '') {
		sqlmnger_json_err('BAD_COL', '列名不能为空', 400, null);
	}
	$qTable = sqlmnger_ident_quote($driver, $table);
	$qName = sqlmnger_ident_quote($driver, $name);
	if ($driver === 'mysql') {
		$sql = 'ALTER TABLE ' . $qTable . ' DROP COLUMN ' . $qName;
	} elseif ($driver === 'sqlite') {
		// 3.35+
		$sql = 'ALTER TABLE ' . $qTable . ' DROP COLUMN ' . $qName;
	} else {
		$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable . ' DROP COLUMN ' . $qName;
	}
	sqlmnger_exec($h, $sql, array());
	return true;
}

/** 默认值等价（null / 空串视为无默认） */
function sqlmnger_defaults_equal($a, $b) {
	$na = ($a === null || $a === '');
	$nb = ($b === null || $b === '');
	if ($na && $nb) {
		return true;
	}
	if ($na || $nb) {
		return false;
	}
	return strval($a) === strval($b);
}

/** 列表中 item 的前一项；无则 null */
function sqlmnger_list_prev($list, $item) {
	$i = array_search($item, $list, true);
	if ($i === false || $i === 0) {
		return null;
	}
	return $list[$i - 1];
}

/**
 * SQL Server：表主键（dbo.表）
 * @return array|null {name, clustered, columns:string[]}
 */
function sqlmnger_sqlsrv_primary_key($h, $table) {
	$sql = "SELECT kc.name AS pk_name, i.type_desc, c.name AS col_name, ic.key_ordinal
		FROM sys.key_constraints kc
		INNER JOIN sys.indexes i ON kc.parent_object_id = i.object_id AND kc.unique_index_id = i.index_id
		INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
		INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
		INNER JOIN sys.tables t ON kc.parent_object_id = t.object_id
		INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
		WHERE kc.[type] = 'PK' AND s.name = N'dbo' AND t.name = ?
		ORDER BY ic.key_ordinal";
	$r = sqlmnger_query_all($h, $sql, array($table));
	if (!count($r['rows'])) {
		return null;
	}
	$pkName = strval($r['rows'][0][0]);
	$clustered = (isset($r['rows'][0][1]) && strtoupper(strval($r['rows'][0][1])) === 'CLUSTERED');
	$cols = array();
	foreach ($r['rows'] as $row) {
		$cols[] = strval($row[2]);
	}
	return array(
		'name' => $pkName,
		'clustered' => $clustered,
		'columns' => $cols,
	);
}

/**
 * SQL Server 外键动作码 → 关键字
 */
function sqlmnger_sqlsrv_fk_action_sql($code) {
	switch (intval($code)) {
		case 1:
			return 'CASCADE';
		case 2:
			return 'SET NULL';
		case 3:
			return 'SET DEFAULT';
		default:
			return 'NO ACTION';
	}
}

/**
 * SQL Server：引用本表的外键（入站），以及本表上依赖指定列的外键（出站）
 * @param string[] $colFilter 仅关心这些列（空=本表全部入站 FK）
 * @return array{inbound:array, outbound:array}
 */
function sqlmnger_sqlsrv_fks_for_table_cols($h, $table, $colFilter) {
	$colSet = array();
	foreach ($colFilter as $c) {
		$c = strval($c);
		if ($c !== '') {
			$colSet[strtolower($c)] = $c;
		}
	}
	$inbound = array();
	$outbound = array();

	// 入站：其它表 → 本表
	$sqlIn = "SELECT fk.name, sch_p.name, tp.name, sch_r.name, tr.name,
			fk.delete_referential_action, fk.update_referential_action,
			cp.name AS parent_col, cr.name AS ref_col, fkc.constraint_column_id
		FROM sys.foreign_keys fk
		INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
		INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
		INNER JOIN sys.schemas sch_p ON tp.schema_id = sch_p.schema_id
		INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
		INNER JOIN sys.schemas sch_r ON tr.schema_id = sch_r.schema_id
		INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
		INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
		WHERE sch_r.name = N'dbo' AND tr.name = ?
		ORDER BY fk.name, fkc.constraint_column_id";
	$ri = sqlmnger_query_all($h, $sqlIn, array($table));
	$mapIn = array();
	foreach ($ri['rows'] as $row) {
		$fn = strval($row[0]);
		if (!isset($mapIn[$fn])) {
			$mapIn[$fn] = array(
				'name' => $fn,
				'parent_schema' => strval($row[1]),
				'parent_table' => strval($row[2]),
				'ref_schema' => strval($row[3]),
				'ref_table' => strval($row[4]),
				'on_delete' => sqlmnger_sqlsrv_fk_action_sql($row[5]),
				'on_update' => sqlmnger_sqlsrv_fk_action_sql($row[6]),
				'parent_columns' => array(),
				'ref_columns' => array(),
			);
		}
		$mapIn[$fn]['parent_columns'][] = strval($row[7]);
		$mapIn[$fn]['ref_columns'][] = strval($row[8]);
	}
	foreach ($mapIn as $fk) {
		// 删整表 PK 时所有入站 FK 都要卸；若 colFilter 非空则只保留引用到这些列的 FK
		if (count($colSet) > 0) {
			$hit = false;
			foreach ($fk['ref_columns'] as $rc) {
				if (isset($colSet[strtolower($rc)])) {
					$hit = true;
					break;
				}
			}
			if (!$hit) {
				continue;
			}
		}
		$inbound[] = $fk;
	}

	// 出站：本表 → 其它表（列在修改列表中）
	if (count($colSet) > 0) {
		$sqlOut = "SELECT fk.name, sch_p.name, tp.name, sch_r.name, tr.name,
				fk.delete_referential_action, fk.update_referential_action,
				cp.name AS parent_col, cr.name AS ref_col, fkc.constraint_column_id
			FROM sys.foreign_keys fk
			INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
			INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
			INNER JOIN sys.schemas sch_p ON tp.schema_id = sch_p.schema_id
			INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
			INNER JOIN sys.schemas sch_r ON tr.schema_id = sch_r.schema_id
			INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
			INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
			WHERE sch_p.name = N'dbo' AND tp.name = ?
			ORDER BY fk.name, fkc.constraint_column_id";
		$ro = sqlmnger_query_all($h, $sqlOut, array($table));
		$mapOut = array();
		foreach ($ro['rows'] as $row) {
			$fn = strval($row[0]);
			if (!isset($mapOut[$fn])) {
				$mapOut[$fn] = array(
					'name' => $fn,
					'parent_schema' => strval($row[1]),
					'parent_table' => strval($row[2]),
					'ref_schema' => strval($row[3]),
					'ref_table' => strval($row[4]),
					'on_delete' => sqlmnger_sqlsrv_fk_action_sql($row[5]),
					'on_update' => sqlmnger_sqlsrv_fk_action_sql($row[6]),
					'parent_columns' => array(),
					'ref_columns' => array(),
				);
			}
			$mapOut[$fn]['parent_columns'][] = strval($row[7]);
			$mapOut[$fn]['ref_columns'][] = strval($row[8]);
		}
		foreach ($mapOut as $fk) {
			$hit = false;
			foreach ($fk['parent_columns'] as $pc) {
				if (isset($colSet[strtolower($pc)])) {
					$hit = true;
					break;
				}
			}
			if ($hit) {
				$outbound[] = $fk;
			}
		}
	}

	return array('inbound' => $inbound, 'outbound' => $outbound);
}

/**
 * SQL Server 对象名片段（用于 sp_rename 第一参数：schema.table.column）
 */
function sqlmnger_sqlsrv_rename_obj_part($name) {
	$name = strval($name);
	if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
		return $name;
	}
	return '[' . str_replace(']', ']]', $name) . ']';
}

/**
 * EXEC sp_rename 'dbo.table.old', 'new', 'COLUMN'
 */
function sqlmnger_sqlsrv_rename_column_sql($table, $oldName, $newName) {
	$obj = 'dbo.'
		. sqlmnger_sqlsrv_rename_obj_part($table) . '.'
		. sqlmnger_sqlsrv_rename_obj_part($oldName);
	return 'EXEC sp_rename '
		. sqlmnger_sql_string($obj) . ', '
		. sqlmnger_sql_string($newName) . ", 'COLUMN'";
}

/** 列名按改名映射替换（仅本表列） */
function sqlmnger_sqlsrv_map_col_name($name, $renameMap) {
	$name = strval($name);
	if (is_array($renameMap) && isset($renameMap[$name])) {
		return strval($renameMap[$name]);
	}
	return $name;
}

/**
 * 生成「删 FK/PK → 中间语句 → 建回 PK/FK」完整 SQL 列表
 * $renameMap: 原列名 => 新列名（重建约束时用新名）
 */
function sqlmnger_sqlsrv_wrap_pk_fk_stmts($table, $coreStmts, $pkInfo, $inboundFks, $outboundFks, $renameMap = null) {
	$driver = 'sqlsrv';
	if (!is_array($renameMap)) {
		$renameMap = array();
	}
	$qt = sqlmnger_ident_quote($driver, 'dbo') . '.' . sqlmnger_ident_quote($driver, $table);
	$out = array();

	// 先卸入站再卸出站（或任意顺序均可，只要在 DROP PK 前卸完入站）
	foreach ($inboundFks as $fk) {
		$qChild = sqlmnger_ident_quote($driver, $fk['parent_schema']) . '.' . sqlmnger_ident_quote($driver, $fk['parent_table']);
		$out[] = 'ALTER TABLE ' . $qChild . ' DROP CONSTRAINT ' . sqlmnger_ident_quote($driver, $fk['name']);
	}
	foreach ($outboundFks as $fk) {
		$out[] = 'ALTER TABLE ' . $qt . ' DROP CONSTRAINT ' . sqlmnger_ident_quote($driver, $fk['name']);
	}
	if ($pkInfo) {
		$out[] = 'ALTER TABLE ' . $qt . ' DROP CONSTRAINT ' . sqlmnger_ident_quote($driver, $pkInfo['name']);
	}
	foreach ($coreStmts as $s) {
		$out[] = $s;
	}
	if ($pkInfo) {
		$qCols = array();
		foreach ($pkInfo['columns'] as $c) {
			$qCols[] = sqlmnger_ident_quote($driver, sqlmnger_sqlsrv_map_col_name($c, $renameMap));
		}
		$clu = !empty($pkInfo['clustered']) ? 'CLUSTERED' : 'NONCLUSTERED';
		$out[] = 'ALTER TABLE ' . $qt . ' ADD CONSTRAINT ' . sqlmnger_ident_quote($driver, $pkInfo['name'])
			. ' PRIMARY KEY ' . $clu . ' (' . implode(', ', $qCols) . ')';
	}
	// 先本表出站，再入站（重建时映射本表侧列名）
	foreach ($outboundFks as $fk) {
		$qPcols = array();
		foreach ($fk['parent_columns'] as $c) {
			$qPcols[] = sqlmnger_ident_quote($driver, sqlmnger_sqlsrv_map_col_name($c, $renameMap));
		}
		$qRcols = array();
		foreach ($fk['ref_columns'] as $c) {
			$qRcols[] = sqlmnger_ident_quote($driver, $c);
		}
		$qRef = sqlmnger_ident_quote($driver, $fk['ref_schema']) . '.' . sqlmnger_ident_quote($driver, $fk['ref_table']);
		$out[] = 'ALTER TABLE ' . $qt . ' ADD CONSTRAINT ' . sqlmnger_ident_quote($driver, $fk['name'])
			. ' FOREIGN KEY (' . implode(', ', $qPcols) . ') REFERENCES ' . $qRef
			. ' (' . implode(', ', $qRcols) . ')'
			. ' ON DELETE ' . $fk['on_delete'] . ' ON UPDATE ' . $fk['on_update'];
	}
	foreach ($inboundFks as $fk) {
		$qChild = sqlmnger_ident_quote($driver, $fk['parent_schema']) . '.' . sqlmnger_ident_quote($driver, $fk['parent_table']);
		$qPcols = array();
		foreach ($fk['parent_columns'] as $c) {
			$qPcols[] = sqlmnger_ident_quote($driver, $c);
		}
		$qRcols = array();
		foreach ($fk['ref_columns'] as $c) {
			$qRcols[] = sqlmnger_ident_quote($driver, sqlmnger_sqlsrv_map_col_name($c, $renameMap));
		}
		$qRef = sqlmnger_ident_quote($driver, $fk['ref_schema']) . '.' . sqlmnger_ident_quote($driver, $fk['ref_table']);
		$out[] = 'ALTER TABLE ' . $qChild . ' ADD CONSTRAINT ' . sqlmnger_ident_quote($driver, $fk['name'])
			. ' FOREIGN KEY (' . implode(', ', $qPcols) . ') REFERENCES ' . $qRef
			. ' (' . implode(', ', $qRcols) . ')'
			. ' ON DELETE ' . $fk['on_delete'] . ' ON UPDATE ' . $fk['on_update'];
	}
	return $out;
}

/**
 * 生成批量列变更 SQL（不执行）。
 * 仅对新增、删除、定义变更或相对顺序变更的列生成语句；未改动的列不写 ALTER。
 * $spec = {
 *   drops: string[],
 *   columns: [{ orig_name?, name, type, nullable?, default?, comment?, is_new?, extra? }, ...]
 *   auto_handle_deps?: bool  // SQL Server：自动卸/建 PK 与相关 FK
 * }
 *
 * 若 SQL Server 改列命中主键且未开 auto_handle_deps，返回 blocked=true（不抛错）。
 *
 * @return array
 */
function sqlmnger_column_build_batch_sqls($h, $database, $table, $spec) {
	$driver = $h['driver'];
	$drops = isset($spec['drops']) && is_array($spec['drops']) ? $spec['drops'] : array();
	$columns = isset($spec['columns']) && is_array($spec['columns']) ? $spec['columns'] : array();
	$autoHandleDeps = !empty($spec['auto_handle_deps']);
	if (!count($columns) && !count($drops)) {
		throw new Exception('无变更');
	}

	// 当前表结构：用于跳过未改动的列
	$st = sqlmnger_table_structure($h, $database, $table);
	$curMap = array();
	$curOrder = array();
	foreach ($st['columns'] as $c) {
		$nm = strval($c['name']);
		$curMap[$nm] = $c;
		$curOrder[] = $nm;
	}
	$dropSet = array();
	foreach ($drops as $dn) {
		$dn = trim(strval($dn));
		if ($dn !== '') {
			$dropSet[$dn] = true;
		}
	}
	// 删除后仍保留的原列顺序（用于判断相对顺序是否变化）
	$survivingOrder = array();
	foreach ($curOrder as $nm) {
		if (empty($dropSet[$nm])) {
			$survivingOrder[] = $nm;
		}
	}
	// 目标中「原有列」的顺序（按 orig_name）
	$targetOrigOnly = array();
	foreach ($columns as $col) {
		if (!is_array($col)) {
			continue;
		}
		$orig = isset($col['orig_name']) ? trim(strval($col['orig_name'])) : '';
		$isNew = !empty($col['is_new']) || $orig === '';
		if (!$isNew) {
			$targetOrigOnly[] = $orig;
		}
	}

	$qTable = sqlmnger_ident_quote($driver, $table);
	$stmts = array();
	$nDrop = 0;
	$nAdd = 0;
	$nMod = 0;
	$nSkip = 0;
	// SQL Server：将做 ALTER COLUMN 且落在主键上的原列名
	$pkTouchCols = array();
	// SQL Server：原列名 => 新列名（重建 PK/FK 用）
	$sqlsrvRenameMap = array();

	// 1) DROP
	foreach ($drops as $dn) {
		$dn = trim(strval($dn));
		if ($dn === '') {
			continue;
		}
		$qName = sqlmnger_ident_quote($driver, $dn);
		if ($driver === 'mysql') {
			$sql = 'ALTER TABLE ' . $qTable . ' DROP COLUMN ' . $qName;
		} elseif ($driver === 'sqlite') {
			$sql = 'ALTER TABLE ' . $qTable . ' DROP COLUMN ' . $qName;
		} else {
			$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable . ' DROP COLUMN ' . $qName;
		}
		$stmts[] = $sql;
		$nDrop++;
	}

	// 2) 按目标顺序：仅 ADD / 有变更的 CHANGE·MODIFY
	$prevName = null; // 目标顺序中前一列的最终列名（含新增）
	foreach ($columns as $col) {
		if (!is_array($col)) {
			continue;
		}
		$name = isset($col['name']) ? trim(strval($col['name'])) : '';
		$type = isset($col['type']) ? trim(strval($col['type'])) : '';
		if ($name === '' || $type === '') {
			throw new Exception('列名与类型不能为空');
		}
		$orig = isset($col['orig_name']) ? trim(strval($col['orig_name'])) : '';
		$isNew = !empty($col['is_new']) || $orig === '';
		$nullable = array_key_exists('nullable', $col) ? !empty($col['nullable']) : true;
		$default = array_key_exists('default', $col) ? $col['default'] : null;
		$comment = isset($col['comment']) ? strval($col['comment']) : '';
		$extra = isset($col['extra']) ? strval($col['extra']) : '';
		$nullSql = $nullable ? 'NULL' : 'NOT NULL';
		$autoInc = (stripos($extra, 'auto_increment') !== false);
		$defSql = $autoInc ? '' : sqlmnger_default_sql($driver, $default, $nullable);
		$autoSql = $autoInc ? ' AUTO_INCREMENT' : '';
		$qName = sqlmnger_ident_quote($driver, $name);

		// MySQL 位置：新增列始终带 FIRST/AFTER；修改列仅在顺序变化时带
		$posSqlNew = '';
		if ($driver === 'mysql') {
			$posSqlNew = ($prevName === null)
				? ' FIRST'
				: (' AFTER ' . sqlmnger_ident_quote($driver, $prevName));
		}

		if ($isNew) {
			if ($driver === 'mysql') {
				$cmt = ' COMMENT ' . sqlmnger_sql_string($comment);
				$sql = 'ALTER TABLE ' . $qTable . ' ADD COLUMN ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql . $autoSql . $cmt . $posSqlNew;
			} elseif ($driver === 'sqlite') {
				$sql = 'ALTER TABLE ' . $qTable . ' ADD COLUMN ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql;
			} else {
				$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable
					. ' ADD ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql;
			}
			$stmts[] = $sql;
			$nAdd++;
			$prevName = $name;
			continue;
		}

		if (!isset($curMap[$orig])) {
			throw new Exception('原列不存在: ' . $orig);
		}
		$live = $curMap[$orig];
		$liveNullable = !empty($live['nullable']);
		$liveAuto = (isset($live['extra']) && stripos(strval($live['extra']), 'auto_increment') !== false);
		$liveType = isset($live['type']) ? trim(strval($live['type'])) : '';
		$liveComment = isset($live['comment']) ? strval($live['comment']) : '';
		$liveDefault = array_key_exists('default', $live) ? $live['default'] : null;

		$defChanged = ($name !== $orig)
			|| (strtolower($type) !== strtolower($liveType))
			|| ($nullable !== $liveNullable)
			|| !sqlmnger_defaults_equal($default, $liveDefault)
			|| ($comment !== $liveComment)
			|| ($autoInc !== $liveAuto);

		// 仅看「原有列」之间的相对顺序（插入新列不强制 MODIFY 邻居）
		$posChanged = (sqlmnger_list_prev($survivingOrder, $orig) !== sqlmnger_list_prev($targetOrigOnly, $orig));

		if (!$defChanged && !$posChanged) {
			$nSkip++;
			$prevName = $name;
			continue;
		}

		$posSql = '';
		if ($driver === 'mysql' && $posChanged) {
			$posSql = $posSqlNew;
		}

		$qOld = sqlmnger_ident_quote($driver, $orig);
		if ($driver === 'mysql') {
			$cmt = ' COMMENT ' . sqlmnger_sql_string($comment);
			if ($name !== $orig) {
				$sql = 'ALTER TABLE ' . $qTable . ' CHANGE COLUMN ' . $qOld . ' ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql . $autoSql . $cmt . $posSql;
			} else {
				$sql = 'ALTER TABLE ' . $qTable . ' MODIFY COLUMN ' . $qName . ' ' . $type . ' ' . $nullSql . $defSql . $autoSql . $cmt . $posSql;
			}
			$stmts[] = $sql;
			$nMod++;
		} elseif ($driver === 'sqlite') {
			if ($name !== $orig) {
				$sql = 'ALTER TABLE ' . $qTable . ' RENAME COLUMN ' . $qOld . ' TO ' . $qName;
				$stmts[] = $sql;
				$nMod++;
			} elseif ($defChanged) {
				// SQLite 无法完整 MODIFY
				throw new Exception('SQLite 不支持修改列定义：' . $orig);
			}
		} else {
			// SQL Server：改名用 sp_rename；类型/可空用 ALTER COLUMN（改名后对「新列名」操作）
			$colForAlter = $orig;
			$colTouched = false;
			if ($name !== $orig) {
				$stmts[] = sqlmnger_sqlsrv_rename_column_sql($table, $orig, $name);
				$sqlsrvRenameMap[$orig] = $name;
				$colForAlter = $name;
				$colTouched = true;
			}
			$needAlterCol = (strtolower($type) !== strtolower($liveType))
				|| ($nullable !== $liveNullable);
			if ($needAlterCol) {
				$qAlter = sqlmnger_ident_quote($driver, $colForAlter);
				$sql = 'ALTER TABLE ' . sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable
					. ' ALTER COLUMN ' . $qAlter . ' ' . $type . ' ' . $nullSql;
				$stmts[] = $sql;
				$colTouched = true;
				// 类型/可空变更且列为 PK → 需卸主键（纯改名一般不需要）
				if (!empty($live['is_primary'])) {
					$pkTouchCols[] = $orig;
				}
			}
			if ($colTouched) {
				$nMod++;
			}
		}
		$prevName = $name;
	}

	// SQL Server：改主键列的类型/可空 → 需先卸 PK（及相关 FK）
	if (sqlmnger_is_mssql_family($driver) && count($pkTouchCols) > 0) {
		$pkInfo = sqlmnger_sqlsrv_primary_key($h, $table);
		if ($pkInfo) {
			// 入站 FK 引用本表 PK 的任意列时，DROP PK 前必须卸掉
			$fks = sqlmnger_sqlsrv_fks_for_table_cols($h, $table, $pkInfo['columns']);
			$inbound = $fks['inbound'];
			// 出站：仅本表修改列上的 FK
			$fksOut = sqlmnger_sqlsrv_fks_for_table_cols($h, $table, $pkTouchCols);
			$outbound = $fksOut['outbound'];

			$pkColsDisplay = array();
			foreach ($pkInfo['columns'] as $pc) {
				$pkColsDisplay[] = sqlmnger_sqlsrv_map_col_name($pc, $sqlsrvRenameMap);
			}

			$plan = array();
			foreach ($inbound as $fk) {
				$plan[] = array(
					'op' => 'drop_fk',
					'name' => $fk['name'],
					'table' => $fk['parent_schema'] . '.' . $fk['parent_table'],
					'role' => 'inbound',
				);
			}
			foreach ($outbound as $fk) {
				$plan[] = array(
					'op' => 'drop_fk',
					'name' => $fk['name'],
					'table' => $fk['parent_schema'] . '.' . $fk['parent_table'],
					'role' => 'outbound',
				);
			}
			$plan[] = array(
				'op' => 'drop_pk',
				'name' => $pkInfo['name'],
				'columns' => $pkInfo['columns'],
				'clustered' => !empty($pkInfo['clustered']),
			);
			$plan[] = array(
				'op' => 'alter_columns',
				'columns' => array_values(array_unique($pkTouchCols)),
			);
			$plan[] = array(
				'op' => 'add_pk',
				'name' => $pkInfo['name'],
				'columns' => $pkColsDisplay,
				'clustered' => !empty($pkInfo['clustered']),
			);
			foreach ($outbound as $fk) {
				$plan[] = array(
					'op' => 'add_fk',
					'name' => $fk['name'],
					'table' => $fk['parent_schema'] . '.' . $fk['parent_table'],
					'role' => 'outbound',
				);
			}
			foreach ($inbound as $fk) {
				$plan[] = array(
					'op' => 'add_fk',
					'name' => $fk['name'],
					'table' => $fk['parent_schema'] . '.' . $fk['parent_table'],
					'role' => 'inbound',
				);
			}

			$autoStmts = sqlmnger_sqlsrv_wrap_pk_fk_stmts(
				$table,
				$stmts,
				$pkInfo,
				$inbound,
				$outbound,
				$sqlsrvRenameMap
			);
			$autoSqlText = '';
			foreach ($autoStmts as $s) {
				$autoSqlText .= rtrim($s, "; \t\r\n") . ";\n";
			}

			if (!$autoHandleDeps) {
				$msg = '修改列涉及主键'
					. '「' . $pkInfo['name'] . '」(' . implode(', ', $pkInfo['columns']) . ')'
					. '。SQL Server 不能直接 ALTER COLUMN 主键列，需先删除主键'
					. (count($inbound) || count($outbound) ? '及相关外键' : '')
					. '，改完后再重建。';
				return array(
					'blocked' => true,
					'block_code' => 'PK_DEPENDENCY',
					'message' => $msg,
					'affected_columns' => array_values(array_unique($pkTouchCols)),
					'deps' => array(
						'primary_key' => $pkInfo,
						'inbound_fks' => $inbound,
						'outbound_fks' => $outbound,
					),
					'plan' => $plan,
					'drops' => $nDrop,
					'adds' => $nAdd,
					'modifies' => $nMod,
					'skipped' => $nSkip,
					'statements' => $stmts,
					'auto_statements' => $autoStmts,
					'auto_sql' => $autoSqlText,
					'can_auto_handle' => true,
				);
			}
			// 自动处理：用完整卸/建脚本替换
			$stmts = $autoStmts;
		}
	}

	if (!count($stmts)) {
		throw new Exception('无实际变更（列定义与顺序均未改）');
	}

	return array(
		'drops' => $nDrop,
		'adds' => $nAdd,
		'modifies' => $nMod,
		'skipped' => $nSkip,
		'statements' => $stmts,
		'auto_handle_deps' => $autoHandleDeps && count($pkTouchCols) > 0,
	);
}

/**
 * 批量应用列变更（增/删/改/排序）。
 * MySQL：DROP 后按序 MODIFY/CHANGE/ADD ... AFTER
 * 若 blocked（PK 依赖未自动处理），不执行，原样返回。
 *
 * @return array
 */
function sqlmnger_column_apply_batch($h, $database, $table, $spec) {
	$result = sqlmnger_column_build_batch_sqls($h, $database, $table, $spec);
	if (!empty($result['blocked'])) {
		return $result;
	}
	foreach ($result['statements'] as $sql) {
		sqlmnger_exec($h, $sql, array());
	}
	return $result;
}

function sqlmnger_sql_string($s) {
	return "'" . str_replace(array("\\", "'"), array("\\\\", "''"), strval($s)) . "'";
}

function sqlmnger_default_sql($driver, $default, $nullable) {
	if ($default === null || $default === '') {
		// 不写 DEFAULT；NOT NULL 无默认时由引擎决定
		return '';
	}
	// 字面量 NULL
	if (is_string($default) && strtoupper($default) === 'NULL') {
		return ' DEFAULT NULL';
	}
	// 前端可能传来已带单引号的字符串字面量（如 '1970-01-01'），去掉外层再规范转义
	if (is_string($default) && preg_match("/^'(.*)'$/s", $default, $m)) {
		$inner = str_replace("''", "'", $m[1]);
		return ' DEFAULT ' . sqlmnger_sql_string($inner);
	}
	// 数字
	if (is_int($default) || is_float($default) || (is_string($default) && preg_match('/^-?[0-9]+(\\.[0-9]+)?$/', $default))) {
		return ' DEFAULT ' . $default;
	}
	// 函数类默认：CURRENT_TIMESTAMP 等不带引号
	if (is_string($default) && preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\\(\\))?$/', $default)) {
		return ' DEFAULT ' . $default;
	}
	return ' DEFAULT ' . sqlmnger_sql_string($default);
}

/**
 * 插入一行
 * $set: name=>value（非空字段）
 */
function sqlmnger_insert_row($h, $database, $table, $set) {
	$driver = $h['driver'];
	if (!is_array($set) || count($set) < 1) {
		sqlmnger_json_err('NO_SET', '插入至少需要一个字段', 400, null);
	}
	$qTable = sqlmnger_ident_quote($driver, $table);
	if (sqlmnger_is_mssql_family($driver)) {
		$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$qTable = sqlmnger_oracle_qtable($driver, $schema, $table);
	}
	$cols = array();
	$ph = array();
	$params = array();
	foreach ($set as $k => $v) {
		$cols[] = sqlmnger_ident_quote($driver, $k);
		$ph[] = '?';
		$params[] = $v;
	}
	$sql = 'INSERT INTO ' . $qTable . ' (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $ph) . ')';
	sqlmnger_exec($h, $sql, $params);
	$lastId = null;
	if ($h['type'] === 'pdo') {
		try {
			$lastId = $h['handle']->lastInsertId();
		} catch (Exception $e) {
			$lastId = null;
		}
	}
	return array('ok' => true, 'last_insert_id' => $lastId);
}

/**
 * 按主键列表删除多行
 * $keysList: array of assoc arrays
 */
function sqlmnger_delete_rows($h, $database, $table, $keysList) {
	$driver = $h['driver'];
	if (!is_array($keysList) || count($keysList) < 1) {
		sqlmnger_json_err('NO_KEY', '请选择要删除的行', 400, null);
	}
	$qTable = sqlmnger_ident_quote($driver, $table);
	if (sqlmnger_is_mssql_family($driver)) {
		$qTable = sqlmnger_ident_quote($driver, 'dbo') . '.' . $qTable;
	} elseif (sqlmnger_is_oracle_family($driver)) {
		$schema = sqlmnger_oracle_resolve_schema($h, $database);
		$qTable = sqlmnger_oracle_qtable($driver, $schema, $table);
	}
	$affected = 0;
	foreach ($keysList as $keys) {
		if (!is_array($keys) || count($keys) < 1) {
			continue;
		}
		$where = array();
		$params = array();
		foreach ($keys as $k => $v) {
			if ($v === null) {
				$where[] = sqlmnger_ident_quote($driver, $k) . ' IS NULL';
			} else {
				$where[] = sqlmnger_ident_quote($driver, $k) . ' = ?';
				$params[] = $v;
			}
		}
		$sql = 'DELETE FROM ' . $qTable . ' WHERE ' . implode(' AND ', $where);
		if ($driver === 'mysql') {
			$sql .= ' LIMIT 1';
		}
		$n = sqlmnger_exec($h, $sql, $params);
		$affected += intval($n);
	}
	return array('affected' => $affected);
}

/**
 * 粗粒度 SQL 脚本拆分：分号结束；尊重单/双引号、反引号、行注释与块注释；
 * DELIMITER 自定义分隔符（mysqldump 风格）作为整体语句边界
 */
function sqlmnger_split_sql_script($sql) {
	$sql = strval($sql);
	// 去掉 UTF-8 BOM
	if (substr($sql, 0, 3) === "\xEF\xBB\xBF") {
		$sql = substr($sql, 3);
	}
	$len = strlen($sql);
	$stmts = array();
	$buf = '';
	$i = 0;
	$inS = false; // '
	$inD = false; // "
	$inB = false; // `
	$inLine = false; // --
	$inBlock = false; // /* */
	$delimiter = ';';

	while ($i < $len) {
		$ch = $sql[$i];
		$n2 = ($i + 1 < $len) ? $sql[$i + 1] : '';

		// 行注释
		if ($inLine) {
			$buf .= $ch;
			if ($ch === "\n") $inLine = false;
			$i++;
			continue;
		}
		// 块注释
		if ($inBlock) {
			$buf .= $ch;
			if ($ch === '*' && $n2 === '/') {
				$buf .= '/';
				$i += 2;
				$inBlock = false;
				continue;
			}
			$i++;
			continue;
		}

		// 字符串
		if ($inS) {
			$buf .= $ch;
			if ($ch === '\\' && $i + 1 < $len) {
				$buf .= $sql[$i + 1];
				$i += 2;
				continue;
			}
			if ($ch === "'") {
				// '' escape
				if ($n2 === "'") {
					$buf .= "'";
					$i += 2;
					continue;
				}
				$inS = false;
			}
			$i++;
			continue;
		}
		if ($inD) {
			$buf .= $ch;
			if ($ch === '\\' && $i + 1 < $len) {
				$buf .= $sql[$i + 1];
				$i += 2;
				continue;
			}
			if ($ch === '"') $inD = false;
			$i++;
			continue;
		}
		if ($inB) {
			$buf .= $ch;
			if ($ch === '`') $inB = false;
			$i++;
			continue;
		}

		// DELIMITER 命令（行首）
		if (preg_match('/^DELIMITER\s+(\S+)/i', substr($sql, $i), $m)
			&& ($i === 0 || $sql[$i - 1] === "\n" || trim($buf) === '')) {
			// flush current
			$t = trim($buf);
			if ($t !== '') $stmts[] = $t;
			$buf = '';
			$delimiter = $m[1];
			$i += strlen($m[0]);
			// skip rest of line
			while ($i < $len && $sql[$i] !== "\n") $i++;
			continue;
		}

		// 注释开始
		if ($ch === '-' && $n2 === '-') {
			// 要求 -- 后空白或行尾
			$n3 = ($i + 2 < $len) ? $sql[$i + 2] : ' ';
			if ($n3 === ' ' || $n3 === "\t" || $n3 === "\n" || $n3 === "\r") {
				$inLine = true;
				$buf .= $ch;
				$i++;
				continue;
			}
		}
		if ($ch === '#') {
			$inLine = true;
			$buf .= $ch;
			$i++;
			continue;
		}
		if ($ch === '/' && $n2 === '*') {
			$inBlock = true;
			$buf .= $ch;
			$i++;
			continue;
		}

		if ($ch === "'") {
			$inS = true;
			$buf .= $ch;
			$i++;
			continue;
		}
		if ($ch === '"') {
			$inD = true;
			$buf .= $ch;
			$i++;
			continue;
		}
		if ($ch === '`') {
			$inB = true;
			$buf .= $ch;
			$i++;
			continue;
		}

		// 分隔符
		$dlen = strlen($delimiter);
		if ($dlen > 0 && substr($sql, $i, $dlen) === $delimiter) {
			$t = trim($buf);
			if ($t !== '') $stmts[] = $t;
			$buf = '';
			$i += $dlen;
			continue;
		}

		$buf .= $ch;
		$i++;
	}
	$t = trim($buf);
	if ($t !== '') $stmts[] = $t;
	return $stmts;
}

/**
 * 执行单条语句（不调用 json_err 退出，便于导入继续）
 * @return array{ok:bool,message:string}
 */

