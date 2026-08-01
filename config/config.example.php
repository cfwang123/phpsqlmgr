<?php
/**
 * sqlmnger 配置示例（可复制为 config.php）
 *
 *   copy config.example.php config.php
 *
 * 完整说明见 config.php 注释；本文件仅作部署模板。
 */
return array(
	'app_name' => 'sqlmnger',
	'app_version' => '1.0.3',
	'app_key' => 'PLEASE-CHANGE-TO-A-LONG-RANDOM-SECRET-32+',
	'debug' => false,

	'enabled_drivers' => array('mysql', 'sqlite', 'sqlsrv', 'mssql_tcp', 'mssql_net'),

	'session_name' => 'SQLMNGERSESSID',
	'session_ttl' => 604800,

	'login_max_attempts' => 10,
	'login_window_sec' => 300,
	/** 允许空密码登录（本地开发常用；生产建议 false） */
	'allow_empty_password' => true,

	'sqlite_root' => dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'sqlite',
	'sqlite_allowed_extensions' => array('db', 'sqlite', 'sqlite3'),

	'default_table_limit' => 2000,
	'default_sql_limit' => 0,
	'max_fetch_rows' => 1000000,
	'unlimited_soft_max' => 2000000,

	'connect_timeout_sec' => 8,

	'app_login_enabled' => false,
	'app_login_password_hash' => null,
	'csrf_enabled' => false,
	'log_operations' => true,
	'log_path' => dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs' . DIRECTORY_SEPARATOR . 'app.log',
	'sql_require_danger_confirm' => true,

	// mssql_tcp TLS：auto=优先纯 PHP TLS，失败可回退明文；require=必须 TLS；disable=明文
	'mssql_tcp_encrypt' => 'auto', // auto | require | disable
	'mssql_tcp_trust_server_certificate' => true,
	// PureTLS 失败后再试 OpenSSL 流（默认关，避免远程「连接中」白等数秒）
	'mssql_tcp_openssl_fallback' => false,
	// mssql_net 常驻 CLI 空闲退出秒数
	'mssql_net_idle_sec' => 10,
);
