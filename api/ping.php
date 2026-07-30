<?php
/**
 * 健康探测 — JSON
 * 兼容 PHP 5.5.12+
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$out = array(
	'ok' => true,
	'data' => array(
		'app' => 'sqlmnger',
		'php' => PHP_VERSION,
		'time' => date('c'),
	),
	'error' => null,
	'meta' => array(
		'request_id' => sqlmnger_request_id(),
	),
);

echo json_encode($out);

function sqlmnger_request_id() {
	if (function_exists('openssl_random_pseudo_bytes')) {
		$b = openssl_random_pseudo_bytes(8);
		if ($b !== false) {
			return bin2hex($b);
		}
	}
	return uniqid('r', true);
}
