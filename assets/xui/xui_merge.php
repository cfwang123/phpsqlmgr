<?php
/**
 * XUI 源文件合并加载器（参考 HB 项目 GetAllJsPage 的 mtime 策略）
 *
 * - 源码：assets/xui/src/*.js（按 manifest.json 顺序，缺省则按文件名排序）
 * - 产物：assets/xui/core.js（页面仍引用此文件）
 * - 规则：任一源文件 mtime 大于 core.js mtime，或 core 不存在 → 重新合并
 *
 * 用法：
 *   require_once __DIR__ . '/xui_merge.php';
 *   xui_ensure_bundle();           // 页面入口
 *   xui_ensure_bundle(true);       // 强制重建
 *
 * 兼容 PHP 5.5.12+
 */

if (!function_exists('xui_src_dir')) {
	function xui_src_dir() {
		return __DIR__ . DIRECTORY_SEPARATOR . 'src';
	}

	function xui_bundle_path() {
		return __DIR__ . DIRECTORY_SEPARATOR . 'core.js';
	}

	/**
	 * 合并顺序列表（相对 src 的文件名）
	 * @return string[]
	 */
	function xui_list_source_files() {
		$src = xui_src_dir();
		$man = $src . DIRECTORY_SEPARATOR . 'manifest.json';
		$files = array();
		if (is_file($man)) {
			$raw = @file_get_contents($man);
			$j = $raw !== false ? @json_decode($raw, true) : null;
			if (is_array($j) && !empty($j['files']) && is_array($j['files'])) {
				foreach ($j['files'] as $fn) {
					$fn = str_replace(array('..', '\\'), array('', '/'), strval($fn));
					$fn = basename($fn);
					if ($fn !== '' && is_file($src . DIRECTORY_SEPARATOR . $fn)) {
						$files[] = $fn;
					}
				}
			}
		}
		if (!count($files)) {
			// 回退：按文件名排序所有 .js
			$all = @scandir($src);
			if (is_array($all)) {
				foreach ($all as $fn) {
					if ($fn === '.' || $fn === '..') continue;
					if (substr($fn, -3) === '.js' && is_file($src . DIRECTORY_SEPARATOR . $fn)) {
						$files[] = $fn;
					}
				}
				sort($files, SORT_STRING);
			}
		}
		return $files;
	}

	/**
	 * 源目录最大修改时间；无源文件返回 0
	 */
	function xui_sources_max_mtime() {
		$src = xui_src_dir();
		$files = xui_list_source_files();
		$max = 0;
		foreach ($files as $fn) {
			$p = $src . DIRECTORY_SEPARATOR . $fn;
			$t = @filemtime($p);
			if ($t !== false && $t > $max) $max = $t;
		}
		$man = $src . DIRECTORY_SEPARATOR . 'manifest.json';
		if (is_file($man)) {
			$t = @filemtime($man);
			if ($t !== false && $t > $max) $max = $t;
		}
		return $max;
	}

	/**
	 * 合并 src → core.js
	 * @return array{ok:bool, rebuilt:bool, path:string, message:string, files:int}
	 */
	function xui_rebuild_bundle() {
		$src = xui_src_dir();
		$out = xui_bundle_path();
		$files = xui_list_source_files();
		if (!count($files)) {
			return array(
				'ok' => false,
				'rebuilt' => false,
				'path' => $out,
				'message' => 'no source js in xui/src',
				'files' => 0,
			);
		}

		$parts = array();
		$parts[] = "/* XUI bundle — auto-merged from src/; DO NOT EDIT.\n"
			. " * Edit files under assets/xui/src/ then refresh page (mtime rebuild).\n"
			. " * Generated: " . date('Y-m-d H:i:s') . "\n"
			. " */\n";

		foreach ($files as $fn) {
			$p = $src . DIRECTORY_SEPARATOR . $fn;
			$body = @file_get_contents($p);
			if ($body === false) {
				return array(
					'ok' => false,
					'rebuilt' => false,
					'path' => $out,
					'message' => 'read fail: ' . $fn,
					'files' => count($files),
				);
			}
			$body = str_replace("\r\n", "\n", $body);
			$body = str_replace("\r", "\n", $body);
			if ($body !== '' && substr($body, -1) !== "\n") {
				$body .= "\n";
			}
			$parts[] = "\n/* ==== " . $fn . " ==== */\n";
			$parts[] = $body;
		}

		$content = implode('', $parts);
		$dir = dirname($out);
		if (!is_dir($dir)) {
			@mkdir($dir, 0755, true);
		}
		// 写临时文件再 rename，减少半截写入
		$tmp = $out . '.tmp.' . getmypid();
		$n = @file_put_contents($tmp, $content);
		if ($n === false) {
			return array(
				'ok' => false,
				'rebuilt' => false,
				'path' => $out,
				'message' => 'write temp fail',
				'files' => count($files),
			);
		}
		// Windows 上目标存在时 rename 可能失败，先删
		if (is_file($out)) {
			@unlink($out);
		}
		if (!@rename($tmp, $out)) {
			@unlink($tmp);
			// 回退直接写
			if (@file_put_contents($out, $content) === false) {
				return array(
					'ok' => false,
					'rebuilt' => false,
					'path' => $out,
					'message' => 'write bundle fail',
					'files' => count($files),
				);
			}
		}

		// 将产物 mtime 对齐为「不早于」源最大 mtime，避免时钟抖动
		$max = xui_sources_max_mtime();
		if ($max > 0) {
			@touch($out, $max + 1);
		}

		return array(
			'ok' => true,
			'rebuilt' => true,
			'path' => $out,
			'message' => 'rebuilt',
			'files' => count($files),
		);
	}

	/**
	 * 确保 bundle 最新（仿 HB：源 mtime > 合并文件 mtime 则重编）
	 * @param bool $force 强制重建
	 * @return array
	 */
	function xui_ensure_bundle($force = false) {
		$force = (bool) $force;
		$src = xui_src_dir();
		$out = xui_bundle_path();
		if (!is_dir($src)) {
			return array(
				'ok' => is_file($out),
				'rebuilt' => false,
				'path' => $out,
				'message' => 'src missing, use existing core.js',
				'files' => 0,
			);
		}

		$files = xui_list_source_files();
		if (!count($files)) {
			return array(
				'ok' => is_file($out),
				'rebuilt' => false,
				'path' => $out,
				'message' => 'no sources',
				'files' => 0,
			);
		}

		$need = $force || !is_file($out);
		if (!$need) {
			$outM = @filemtime($out);
			$srcM = xui_sources_max_mtime();
			if ($outM === false || $srcM > $outM) {
				$need = true;
			}
		}

		if ($need) {
			return xui_rebuild_bundle();
		}

		return array(
			'ok' => true,
			'rebuilt' => false,
			'path' => $out,
			'message' => 'up-to-date',
			'files' => count($files),
		);
	}
}

// CLI / 直接访问：可强制合并调试
if (php_sapi_name() === 'cli' && isset($argv) && realpath($argv[0]) === realpath(__FILE__)) {
	$force = in_array('--force', $argv, true) || in_array('-f', $argv, true);
	$r = xui_ensure_bundle($force);
	echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), PHP_EOL;
	exit(!empty($r['ok']) ? 0 : 1);
}
if (php_sapi_name() !== 'cli' && isset($_SERVER['SCRIPT_FILENAME'])
	&& realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
	header('Content-Type: application/json; charset=utf-8');
	$force = isset($_GET['force']) && $_GET['force'] !== '0' && $_GET['force'] !== '';
	echo json_encode(xui_ensure_bundle($force), JSON_UNESCAPED_UNICODE);
	exit;
}
