<?php
/**
 * 服务器管理信息（仿 Adminer）
 * POST { action: privileges|processes|variables|status|kill_process, id? }
 * 按驱动尽力提供；无权限时返回可读错误
 */
require_once __DIR__ . '/_db.php';

sqlmnger_require_login();
$body = sqlmnger_read_json_body();
$action = isset($body['action']) ? trim(strval($body['action'])) : '';
if ($action === '') {
	sqlmnger_json_err('BAD_REQ', '需要 action', 400, null);
}

$h = sqlmnger_open_handle(null);
$driver = $h['driver'];

try {
	if ($action === 'privileges') {
		sqlmnger_json_ok(sqlmnger_server_privileges($h));
	} elseif ($action === 'processes') {
		sqlmnger_json_ok(sqlmnger_server_processes($h));
	} elseif ($action === 'variables') {
		sqlmnger_json_ok(sqlmnger_server_variables($h));
	} elseif ($action === 'status') {
		sqlmnger_json_ok(sqlmnger_server_status($h));
	} elseif ($action === 'kill_process') {
		sqlmnger_require_not_readonly();
		$id = isset($body['id']) ? strval($body['id']) : '';
		if ($id === '' || !preg_match('/^\d+$/', $id)) {
			sqlmnger_json_err('BAD_REQ', '需要数字进程 id', 400, null);
		}
		sqlmnger_json_ok(sqlmnger_server_kill_process($h, $id));
	} else {
		sqlmnger_json_err('BAD_REQ', '未知 action: ' . $action, 400, null);
	}
} catch (Exception $e) {
	sqlmnger_json_err('ERR', $e->getMessage(), 400, null);
}
sqlmnger_close_handle($h);

/**
 * @return array{title:string,columns:string[],rows:array,note?:string}
 */
function sqlmnger_server_privileges($h) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		$cols = array('用户', '权限摘要 (GRANTS)');
		$rows = array();
		// 当前用户 GRANTS
		try {
			$r = sqlmnger_query_all($h, 'SHOW GRANTS', array());
			$grants = array();
			foreach ($r['rows'] as $row) {
				$grants[] = isset($row[0]) ? strval($row[0]) : '';
			}
			$pub = sqlmnger_session_public();
			$who = $pub && !empty($pub['user']) ? $pub['user'] : 'CURRENT_USER';
			try {
				$ru = sqlmnger_query_all($h, 'SELECT CURRENT_USER()', array());
				if (!empty($ru['rows'][0][0])) {
					$who = strval($ru['rows'][0][0]);
				}
			} catch (Exception $e0) { /* */ }
			$rows[] = array($who, implode("\n", $grants));
		} catch (Exception $e) {
			// ignore
		}
		// 尝试列出用户（需权限）
		try {
			$ru = sqlmnger_query_all($h,
				"SELECT User, Host, IFNULL(authentication_string,'') FROM mysql.user ORDER BY User, Host",
				array()
			);
			// 若成功，改成用户列表 + 各自 GRANTS 概要
			if (!empty($ru['rows'])) {
				$cols = array('用户', '主机', '备注');
				$rows = array();
				foreach ($ru['rows'] as $row) {
					$user = isset($row[0]) ? strval($row[0]) : '';
					$host = isset($row[1]) ? strval($row[1]) : '';
					$rows[] = array($user, $host, '见 SHOW GRANTS');
				}
				return array(
					'title' => '权限 / 用户',
					'columns' => $cols,
					'rows' => $rows,
					'note' => '列出 mysql.user（需相应权限）。当前登录用户完整 GRANTS 见首行或变量/状态页旁查询。',
					'driver' => $driver,
				);
			}
		} catch (Exception $e2) {
			// 无权限列用户表时保留 GRANTS
		}
		return array(
			'title' => '权限 (SHOW GRANTS)',
			'columns' => $cols,
			'rows' => $rows,
			'note' => '当前会话用户的 GRANT 语句。',
			'driver' => $driver,
		);
	}
	if ($driver === 'sqlite') {
		return array(
			'title' => '权限',
			'columns' => array('说明'),
			'rows' => array(array('SQLite 为文件级权限，无服务器用户权限列表。')),
			'driver' => $driver,
		);
	}
	if (sqlmnger_is_oracle_family($driver)) {
		return array(
			'title' => '权限',
			'columns' => array('说明'),
			'rows' => array(array('Oracle 暂不支持服务器权限列表查询（可用 SQL 控制台查 DBA_USERS / SESSION_PRIVS）。')),
			'driver' => $driver,
		);
	}
	// SQL Server
	$cols = array('主体', '类型', '权限', '状态');
	$rows = array();
	try {
		$sql = "SELECT TOP 200
			pr.name AS principal_name,
			pe.class_desc,
			pe.permission_name,
			pe.state_desc
			FROM sys.server_permissions pe
			JOIN sys.server_principals pr ON pe.grantee_principal_id = pr.principal_id
			ORDER BY pr.name, pe.permission_name";
		$r = sqlmnger_query_all($h, $sql, array());
		foreach ($r['rows'] as $row) {
			$rows[] = array(
				isset($row[0]) ? strval($row[0]) : '',
				isset($row[1]) ? strval($row[1]) : '',
				isset($row[2]) ? strval($row[2]) : '',
				isset($row[3]) ? strval($row[3]) : '',
			);
		}
	} catch (Exception $e) {
		$rows[] = array('(查询失败)', '', $e->getMessage(), '');
	}
	return array(
		'title' => '服务器权限',
		'columns' => $cols,
		'rows' => $rows,
		'driver' => $driver,
	);
}

/**
 * @return array
 */
function sqlmnger_server_processes($h) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		$cols = array('Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info');
		$rows = array();
		$r = sqlmnger_query_all($h, 'SHOW FULL PROCESSLIST', array());
		foreach ($r['rows'] as $row) {
			// SHOW PROCESSLIST 列顺序固定
			$line = array();
			for ($i = 0; $i < 8; $i++) {
				$line[] = isset($row[$i]) ? sqlmnger_cell_export($row[$i]) : '';
			}
			$rows[] = $line;
		}
		return array(
			'title' => '进程列表',
			'columns' => $cols,
			'rows' => $rows,
			'killable' => true,
			'id_col' => 0,
			'driver' => $driver,
		);
	}
	if ($driver === 'sqlite') {
		return array(
			'title' => '进程列表',
			'columns' => array('说明'),
			'rows' => array(array('SQLite 嵌入式引擎无服务器进程列表。')),
			'driver' => $driver,
		);
	}
	if (sqlmnger_is_oracle_family($driver)) {
		return array(
			'title' => '进程列表',
			'columns' => array('说明'),
			'rows' => array(array('Oracle 暂不支持进程列表（可用 SQL 控制台查 V$SESSION）。')),
			'driver' => $driver,
			'killable' => false,
		);
	}
	// SQL Server
	$cols = array('session_id', 'login_name', 'host_name', 'status', 'cpu_time', 'memory_kb', 'program_name');
	$rows = array();
	try {
		$sql = "SELECT TOP 200
			s.session_id,
			s.login_name,
			s.host_name,
			s.status,
			s.cpu_time,
			s.memory_usage * 8,
			s.program_name
			FROM sys.dm_exec_sessions s
			WHERE s.is_user_process = 1
			ORDER BY s.session_id";
		$r = sqlmnger_query_all($h, $sql, array());
		foreach ($r['rows'] as $row) {
			$line = array();
			for ($i = 0; $i < 7; $i++) {
				$line[] = isset($row[$i]) ? sqlmnger_cell_export($row[$i]) : '';
			}
			$rows[] = $line;
		}
	} catch (Exception $e) {
		// 回退 sys.sysprocesses
		try {
			$r2 = sqlmnger_query_all($h,
				'SELECT TOP 200 spid, loginame, hostname, status, cpu, memusage, program_name FROM sys.sysprocesses ORDER BY spid',
				array()
			);
			$cols = array('spid', 'loginame', 'hostname', 'status', 'cpu', 'memusage', 'program_name');
			foreach ($r2['rows'] as $row) {
				$line = array();
				for ($i = 0; $i < 7; $i++) {
					$line[] = isset($row[$i]) ? sqlmnger_cell_export($row[$i]) : '';
				}
				$rows[] = $line;
			}
		} catch (Exception $e2) {
			$rows[] = array('', '', '', $e->getMessage(), '', '', '');
		}
	}
	return array(
		'title' => '进程列表',
		'columns' => $cols,
		'rows' => $rows,
		'killable' => true,
		'id_col' => 0,
		'driver' => $driver,
	);
}

/**
 * @return array
 */
function sqlmnger_server_variables($h) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		$cols = array('变量名', '值');
		$rows = array();
		$r = sqlmnger_query_all($h, 'SHOW VARIABLES', array());
		foreach ($r['rows'] as $row) {
			$rows[] = array(
				isset($row[0]) ? strval($row[0]) : '',
				isset($row[1]) ? sqlmnger_cell_export($row[1]) : '',
			);
		}
		return array(
			'title' => '变量 (SHOW VARIABLES)',
			'columns' => $cols,
			'rows' => $rows,
			'driver' => $driver,
			'filterable' => true,
		);
	}
	if ($driver === 'sqlite') {
		$cols = array('编译选项 / pragma', '值');
		$rows = array();
		try {
			$r = sqlmnger_query_all($h, 'PRAGMA compile_options', array());
			foreach ($r['rows'] as $row) {
				$rows[] = array(isset($row[0]) ? strval($row[0]) : '', '');
			}
		} catch (Exception $e) {
			$rows[] = array('sqlite', '见连接路径');
		}
		return array(
			'title' => '变量 / 编译选项',
			'columns' => $cols,
			'rows' => $rows,
			'driver' => $driver,
		);
	}
	if (sqlmnger_is_oracle_family($driver)) {
		return array(
			'title' => '变量',
			'columns' => array('说明'),
			'rows' => array(array('Oracle 暂不支持变量列表（可用 SQL 控制台查 V$PARAMETER）。')),
			'driver' => $driver,
		);
	}
	// SQL Server configuration
	$cols = array('name', 'value', 'value_in_use', 'description');
	$rows = array();
	try {
		$sql = "SELECT name, CAST(value AS NVARCHAR(200)), CAST(value_in_use AS NVARCHAR(200)),
			CAST(description AS NVARCHAR(400))
			FROM sys.configurations ORDER BY name";
		$r = sqlmnger_query_all($h, $sql, array());
		foreach ($r['rows'] as $row) {
			$rows[] = array(
				isset($row[0]) ? strval($row[0]) : '',
				isset($row[1]) ? strval($row[1]) : '',
				isset($row[2]) ? strval($row[2]) : '',
				isset($row[3]) ? strval($row[3]) : '',
			);
		}
	} catch (Exception $e) {
		$rows[] = array('(失败)', $e->getMessage(), '', '');
	}
	return array(
		'title' => '服务器配置 (sys.configurations)',
		'columns' => $cols,
		'rows' => $rows,
		'driver' => $driver,
		'filterable' => true,
	);
}

/**
 * @return array
 */
function sqlmnger_server_status($h) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		$cols = array('状态名', '值');
		$rows = array();
		$r = sqlmnger_query_all($h, 'SHOW GLOBAL STATUS', array());
		foreach ($r['rows'] as $row) {
			$rows[] = array(
				isset($row[0]) ? strval($row[0]) : '',
				isset($row[1]) ? sqlmnger_cell_export($row[1]) : '',
			);
		}
		return array(
			'title' => '状态 (SHOW GLOBAL STATUS)',
			'columns' => $cols,
			'rows' => $rows,
			'driver' => $driver,
			'filterable' => true,
		);
	}
	if ($driver === 'sqlite') {
		return array(
			'title' => '状态',
			'columns' => array('项', '值'),
			'rows' => array(
				array('engine', 'SQLite'),
				array('note', '无全局 STATUS 统计'),
			),
			'driver' => $driver,
		);
	}
	if (sqlmnger_is_oracle_family($driver)) {
		return array(
			'title' => '状态',
			'columns' => array('说明'),
			'rows' => array(array('Oracle 暂不支持状态/性能计数器页（可用 SQL 控制台查 V$SYSSTAT）。')),
			'driver' => $driver,
		);
	}
	// SQL Server
	$cols = array('counter_name', 'cntr_value', 'object_name');
	$rows = array();
	try {
		$sql = "SELECT TOP 300
			RTRIM(counter_name),
			cntr_value,
			RTRIM(object_name)
			FROM sys.dm_os_performance_counters
			WHERE object_name LIKE '%Buffer Manager%'
			   OR object_name LIKE '%SQL Statistics%'
			   OR counter_name IN ('User Connections', 'Batch Requests/sec', 'Page life expectancy')
			ORDER BY object_name, counter_name";
		$r = sqlmnger_query_all($h, $sql, array());
		foreach ($r['rows'] as $row) {
			$rows[] = array(
				isset($row[0]) ? strval($row[0]) : '',
				isset($row[1]) ? sqlmnger_cell_export($row[1]) : '',
				isset($row[2]) ? strval($row[2]) : '',
			);
		}
	} catch (Exception $e) {
		try {
			$r2 = sqlmnger_query_all($h, 'SELECT @@VERSION, @@SERVERNAME, @@SERVICENAME', array());
			$cols = array('项', '值');
			$rows = array();
			if (!empty($r2['rows'][0])) {
				$rows[] = array('VERSION', isset($r2['rows'][0][0]) ? strval($r2['rows'][0][0]) : '');
				$rows[] = array('SERVERNAME', isset($r2['rows'][0][1]) ? strval($r2['rows'][0][1]) : '');
				$rows[] = array('SERVICENAME', isset($r2['rows'][0][2]) ? strval($r2['rows'][0][2]) : '');
			}
		} catch (Exception $e2) {
			$rows[] = array('error', $e->getMessage(), '');
		}
	}
	return array(
		'title' => '状态 / 性能计数器',
		'columns' => $cols,
		'rows' => $rows,
		'driver' => $driver,
		'filterable' => true,
	);
}

/**
 * @param string $id
 * @return array
 */
function sqlmnger_server_kill_process($h, $id) {
	$driver = $h['driver'];
	if ($driver === 'mysql') {
		sqlmnger_exec($h, 'KILL ' . intval($id), array());
		return array('ok' => true, 'id' => intval($id));
	}
	if ($driver === 'sqlsrv' || $driver === 'mssql_tcp' || $driver === 'mssql_net') {
		sqlmnger_exec($h, 'KILL ' . intval($id), array());
		return array('ok' => true, 'id' => intval($id));
	}
	if (sqlmnger_is_oracle_family($driver)) {
		throw new Exception('Oracle 暂不支持 KILL（请用 ALTER SYSTEM KILL SESSION）');
	}
	throw new Exception('当前驱动不支持 KILL');
}
