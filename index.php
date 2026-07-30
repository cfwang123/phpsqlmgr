<?php
/**
 * 入口页：JS/CSS 链接附带文件 mtime，避免浏览器缓存旧脚本。
 * XUI：源码在 assets/xui/src/，访问时按 mtime 合并为 core.js（参考 HB GetAllJsPage）。
 */
require_once __DIR__ . '/assets/xui/xui_merge.php';

// 源更新则重合并；?xui_force=1 强制重建
xui_ensure_bundle(isset($_GET['xui_force']) && $_GET['xui_force'] !== '' && $_GET['xui_force'] !== '0');

function asset_url($rel) {
	$rel = str_replace('\\', '/', $rel);
	$full = __DIR__ . '/' . $rel;
	$q = is_file($full) ? (string) filemtime($full) : (string) time();
	return htmlspecialchars($rel, ENT_QUOTES, 'UTF-8') . '?' . $q;
}
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>sqlmnger</title>
	<link rel="icon" href="<?php echo asset_url('assets/favicon.ico'); ?>" sizes="any">
	<link rel="icon" type="image/svg+xml" href="<?php echo asset_url('assets/favicon.svg'); ?>">
	<link rel="icon" type="image/png" href="<?php echo asset_url('assets/favicon-32.png'); ?>" sizes="32x32">
	<link rel="apple-touch-icon" href="<?php echo asset_url('assets/favicon-48.png'); ?>">
	<link rel="stylesheet" href="<?php echo asset_url('assets/xui/classic.css'); ?>">
	<link rel="stylesheet" href="<?php echo asset_url('assets/xui/fonts/fontawesome/css/all.min.css'); ?>">
	<link rel="stylesheet" href="<?php echo asset_url('assets/css/sqlmnger.css'); ?>">
</head>
<body>
	<!-- XUI：src/ 组件合并为 core.js 后加载 -->
	<script src="<?php echo asset_url('assets/xui/core.js'); ?>"></script>
	<!-- 业务：IIFE，无 Modules；全 AJAX JSON -->
	<script src="<?php echo asset_url('assets/js/sqlmnger.i18n.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.api.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.ui.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.combo.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.table.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.tablepage.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.sqlpage.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.createtable.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.serverpage.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.dbpage.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.dbio.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.login.js'); ?>"></script>
	<script src="<?php echo asset_url('assets/js/sqlmnger.app.js'); ?>"></script>
</body>
</html>
