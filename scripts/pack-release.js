/**
 * 打包 Web 部署包为 release/phpsqlmgr_{version}.7z（本地产物，不上传 GitHub）
 *
 * 用法:
 *   node scripts/pack-release.js
 *   node scripts/pack-release.js --version 1.0.4
 *   node scripts/pack-release.js --out release/phpsqlmgr_1.0.1.7z
 *
 * 依赖本机 7-Zip（PATH 中的 7z，或 "C:\\Program Files\\7-Zip\\7z.exe"）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STAGE_ROOT = path.join(ROOT, 'tmp', 'pack_stage');

function parseArgs(argv) {
	const out = { version: null, out: null };
	for (let i = 2; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--version' && argv[i + 1]) {
			out.version = String(argv[++i]).replace(/^v/i, '');
		} else if (a === '--out' && argv[i + 1]) {
			out.out = argv[++i];
		} else if (a === '-h' || a === '--help') {
			out.help = true;
		}
	}
	return out;
}

function readAppVersion() {
	const p = path.join(ROOT, 'api', '_bootstrap.php');
	const text = fs.readFileSync(p, 'utf8');
	const m = text.match(/'app_version'\s*=>\s*'([^']+)'/);
	if (!m) throw new Error('无法从 api/_bootstrap.php 读取 app_version');
	return m[1];
}

function find7z() {
	const candidates = [
		process.env.SEVEN_ZIP,
		'7z',
		'7za',
		path.join(process.env['ProgramFiles'] || 'C:\\Program Files', '7-Zip', '7z.exe'),
		path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
		'C:\\bin\\7z.exe'
	].filter(Boolean);

	for (const c of candidates) {
		const r = spawnSync(c, ['--help'], { encoding: 'utf8', shell: false });
		// 7z 无 --help 时常返回非 0，但 stdout/stderr 有 "7-Zip"
		const blob = String(r.stdout || '') + String(r.stderr || '');
		if (/7-Zip|7z\.exe/i.test(blob) || r.status === 0) return c;
		if (c.endsWith('.exe') && fs.existsSync(c)) return c;
	}
	// 再试 shell（可能是 7z.cmd）
	const viaShell = spawnSync('7z', ['i'], { encoding: 'utf8', shell: true });
	const blob2 = String(viaShell.stdout || '') + String(viaShell.stderr || '');
	if (/7-Zip/i.test(blob2) || viaShell.status === 0) return '7z';
	throw new Error('未找到 7z，请安装 7-Zip 或设置环境变量 SEVEN_ZIP');
}

function rmrf(p) {
	if (!fs.existsSync(p)) return;
	fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
	fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
	mkdirp(path.dirname(dest));
	fs.copyFileSync(src, dest);
}

function shouldSkipRel(rel) {
	const n = rel.replace(/\\/g, '/');
	if (n === '.' || n === '') return true;
	const parts = n.split('/');
	const top = parts[0];
	const skipTop = new Set([
		'.git', '.cursor', '.grok', '.claude', '.idea', '.vscode',
		'node_modules', 'vendor', 'tmp', 'release', 'tools', 'design',
		'scripts'
	]);
	if (skipTop.has(top)) return true;
	if (parts.includes('obj')) return true;

	// 密钥 / 本地配置
	if (n === 'config/config.php' || n === 'config/config.local.php') return true;
	if (/\.local\.php$/i.test(n)) return true;
	if (n === '.env' || /(^|\/)\.env\./.test(n)) return true;

	// 文档与仓库元数据（部署不需要）
	if (/^(AGENTS|TODO)\.md$/i.test(n)) return true;
	if (n === '.gitignore' || n === '.gitattributes' || n === '.editorconfig') return true;
	if (/\.(sln|csproj|cs|pdb|user|suo)$/i.test(n)) return true;

	// storage 运行时内容：只留目录占位
	if (/^storage\/(logs|cache|sessions|uploads|run|sqlite)\//i.test(n)) {
		if (/(^|\/)\.gitkeep$/i.test(n)) return false;
		return true;
	}

	// XUI 源码/参考不打包（运行用 core.js）
	if (/^assets\/xui\/(src|reference)\//i.test(n)) return true;

	return false;
}

function walkCollect(dir, base, list) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch (e) {
		return;
	}
	for (const ent of entries) {
		const abs = path.join(dir, ent.name);
		const rel = path.relative(base, abs).replace(/\\/g, '/');
		if (shouldSkipRel(rel)) {
			if (ent.isDirectory()) continue;
			continue;
		}
		if (ent.isDirectory()) {
			walkCollect(abs, base, list);
		} else if (ent.isFile()) {
			list.push(rel);
		}
	}
}

function ensureStoragePlaceholders(stageApp) {
	const dirs = ['logs', 'cache', 'sessions', 'uploads', 'run', 'sqlite'];
	for (const d of dirs) {
		const dir = path.join(stageApp, 'storage', d);
		mkdirp(dir);
		const keep = path.join(dir, '.gitkeep');
		if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
	}
}

function main() {
	const args = parseArgs(process.argv);
	if (args.help) {
		console.log('Usage: node scripts/pack-release.js [--version X.Y.Z] [--out path.7z]');
		process.exit(0);
	}

	const version = args.version || readAppVersion();
	const outRel = args.out || path.join('release', 'phpsqlmgr_' + version + '.7z');
	const outAbs = path.isAbsolute(outRel) ? outRel : path.join(ROOT, outRel);
	const seven = find7z();

	const stageApp = path.join(STAGE_ROOT, 'phpsqlmgr');
	rmrf(STAGE_ROOT);
	mkdirp(stageApp);

	const files = [];
	walkCollect(ROOT, ROOT, files);

	// 根级必选
	const must = ['.htaccess', 'index.php'];
	for (const m of must) {
		if (!files.includes(m) && fs.existsSync(path.join(ROOT, m))) files.push(m);
	}

	files.sort();
	let n = 0;
	for (const rel of files) {
		const src = path.join(ROOT, rel);
		if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
		copyFile(src, path.join(stageApp, rel));
		n++;
	}
	ensureStoragePlaceholders(stageApp);

	mkdirp(path.dirname(outAbs));
	if (fs.existsSync(outAbs)) fs.unlinkSync(outAbs);

	// 7z: 在 stage 父目录打包，归档内顶层为 phpsqlmgr/
	const r = spawnSync(
		seven,
		['a', '-t7z', '-mx=9', '-m0=lzma2', outAbs, 'phpsqlmgr'],
		{ cwd: STAGE_ROOT, encoding: 'utf8', shell: typeof seven === 'string' && !seven.endsWith('.exe') }
	);
	if (r.stdout) process.stdout.write(r.stdout);
	if (r.stderr) process.stderr.write(r.stderr);
	if (r.status !== 0) {
		throw new Error('7z 打包失败, exit=' + r.status);
	}

	const st = fs.statSync(outAbs);
	console.log('OK ' + path.relative(ROOT, outAbs).replace(/\\/g, '/') +
		'  files=' + n + '  size=' + st.size + '  version=' + version);
	console.log('(release/ 本地产物，默认不上传 GitHub)');

	// 清理 staging
	rmrf(STAGE_ROOT);
}

try {
	main();
} catch (e) {
	console.error('FAIL', e && e.message ? e.message : e);
	process.exit(1);
}
