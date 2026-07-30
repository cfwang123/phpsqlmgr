/**
 * SQL 命令页：编辑执行 SQL，结果用 VirtualGrid 展示
 * 支持分号分隔的多条语句；多查询结果集纵向堆叠展示
 * - 危险语句二次确认
 * - 查询结果导出 CSV / JSON
 */
window.SqlmngerSqlPage = (function () {
	var t = { create: create };
	return t;

	function create(spec) {
		var database = spec.database || '';
		var readonly = !!spec.readonly;
		var initialSql = spec.sql || '';

		var el = document.createElement('div');
		el.className = 'xpg sqlmnger-sql-page';
		el.style.cssText = 'overflow:hidden;display:flex;flex-direction:column;height:100%;flex:1;min-height:0;';

		var toolbar = document.createElement('div');
		toolbar.className = 'sqlmnger-tp-toolbar';
		toolbar.innerHTML =
			'<button type="button" data-act="run" class="sqlmnger-tp-btn primary" title="Ctrl+Enter"><i class="fa-solid fa-play"></i> 执行</button>' +
			'<button type="button" data-act="clear" class="sqlmnger-tp-btn"><i class="fa-solid fa-eraser"></i> 清空</button>' +
			'<span class="sqlmnger-sql-export-wrap is-disabled" data-export-wrap>' +
				'<label class="sqlmnger-export-label">导出</label>' +
				'<select class="sqlmnger-sql-export-fmt" data-role="export-fmt" title="格式">' +
					'<option value="csv" selected>CSV</option>' +
					'<option value="json">JSON</option>' +
					'<option value="tsv">TSV</option>' +
					'<option value="sql">SQL</option>' +
				'</select>' +
				'<span class="sqlmnger-export-dd" data-export-dd>' +
					'<button type="button" class="sqlmnger-tp-btn sqlmnger-export-toggle" data-act="export-toggle" title="打开">' +
						'<i class="fa-solid fa-file-export"></i> <span data-export-label>打开</span>' +
						' <i class="fa-solid fa-caret-down"></i>' +
					'</button>' +
					'<div class="sqlmnger-export-dd-menu" data-export-menu hidden>' +
						'<button type="button" data-export-mode="open" title="打开预览">' +
							'<i class="fa-solid fa-up-right-from-square"></i> 打开</button>' +
						'<button type="button" data-export-mode="save" title="下载文件">' +
							'<i class="fa-solid fa-download"></i> 导出</button>' +
						'<button type="button" data-export-mode="zip" title="打包 zip">' +
							'<i class="fa-solid fa-file-zipper"></i> 导出zip</button>' +
					'</div>' +
				'</span>' +
			'</span>' +
			'<span class="sqlmnger-tp-title"></span>' +
			'<span class="sqlmnger-tp-msg"></span>';
		el.appendChild(toolbar);

		var titleEl = toolbar.querySelector('.sqlmnger-tp-title');
		var msgEl = toolbar.querySelector('.sqlmnger-tp-msg');
		var exportWrap = toolbar.querySelector('[data-export-wrap]');
		var exportFmt = toolbar.querySelector('[data-role=export-fmt]');
		var exportDd = toolbar.querySelector('[data-export-dd]');
		var exportMenu = toolbar.querySelector('[data-export-menu]');
		var exportLabel = toolbar.querySelector('[data-export-label]');
		var btnExportToggle = toolbar.querySelector('[data-act=export-toggle]');
		var exportMode = 'open'; // open | save | zip
		titleEl.textContent = (database || '') + (readonly ? ' · 只读' : '');

		var editorWrap = document.createElement('div');
		editorWrap.className = 'sqlmnger-sql-editor-wrap';
		var ta = document.createElement('textarea');
		ta.className = 'sqlmnger-sql-editor';
		ta.spellcheck = false;
		ta.placeholder = '输入 SQL（支持多条，分号分隔）…  Ctrl+Enter 执行';
		ta.value = initialSql;
		editorWrap.appendChild(ta);
		el.appendChild(editorWrap);

		var resultWrap = document.createElement('div');
		resultWrap.className = 'sqlmnger-sql-result';
		resultWrap.innerHTML = '<div class="sqlmnger-sql-result-empty">执行结果将显示在这里</div>';
		el.appendChild(resultWrap);

		/** @type {{grids:Array, destroyed:boolean, exportSets:Array<{columns:Array,rows:Array,label:string}>}} */
		var state = { grids: [], destroyed: false, exportSets: [] };

		function setMsg(text, kind) {
			msgEl.textContent = text || '';
			msgEl.className = 'sqlmnger-tp-msg' + (kind ? ' is-' + kind : '');
		}

		function setExportEnabled(on) {
			if (exportWrap) {
				if (on) exportWrap.classList.remove('is-disabled');
				else exportWrap.classList.add('is-disabled');
			}
			if (btnExportToggle) btnExportToggle.disabled = !on;
		}

		function setExportMode(mode) {
			if (mode === 'save') exportMode = 'save';
			else if (mode === 'zip') exportMode = 'zip';
			else exportMode = 'open';
			if (exportLabel) {
				exportLabel.textContent = exportMode === 'save'
					? '导出'
					: (exportMode === 'zip' ? '导出zip' : '打开');
			}
		}

		function closeExportMenu() {
			if (exportMenu) exportMenu.hidden = true;
			if (exportDd) exportDd.classList.remove('is-open');
		}

		function toggleExportMenu() {
			if (!exportMenu || !state.exportSets.length) return;
			var open = !!exportMenu.hidden;
			exportMenu.hidden = !open;
			if (exportDd) {
				if (open) exportDd.classList.add('is-open');
				else exportDd.classList.remove('is-open');
			}
		}

		function destroyGrids() {
			var i, g;
			for (i = 0; i < state.grids.length; i++) {
				g = state.grids[i];
				if (g && g.destroy) {
					try { g.destroy(); } catch (e) { /* */ }
				}
			}
			state.grids = [];
			state.exportSets = [];
			setExportEnabled(false);
		}

		// ─── 危险语句检测（与后端启发式对齐） ───
		function stripSqlNoise(sql) {
			var s = String(sql || '');
			s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
			s = s.replace(/--[^\n]*/g, ' ');
			s = s.replace(/#[^\n]*/g, ' ');
			return s.trim();
		}

		function dangerFlagsOne(sql) {
			var flags = [];
			var s = stripSqlNoise(sql);
			if (!s) return flags;
			// 去掉引号内容
			var scan = s.replace(/'([^']|'')*'/g, "''").replace(/"([^"]|"")*"/g, '""');
			var u = scan.toUpperCase();
			if (/\bDROP\s+(DATABASE|SCHEMA|TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER|INDEX|USER)\b/.test(u)) {
				flags.push('DROP');
			}
			if (/\bTRUNCATE\b/.test(u)) flags.push('TRUNCATE');
			if (/\bALTER\s+TABLE\b[\s\S]*\bDROP\b/.test(u)) flags.push('ALTER_DROP');
			if (/^\s*DELETE\b/.test(u) && !/\bWHERE\b/.test(u)) flags.push('DELETE_NO_WHERE');
			if (/^\s*UPDATE\b/.test(u) && !/\bWHERE\b/.test(u)) flags.push('UPDATE_NO_WHERE');
			if (/\b(GRANT|REVOKE)\b/.test(u)) flags.push('GRANT_REVOKE');
			return flags;
		}

		function flagLabel(f) {
			var map = {
				DROP: 'DROP 对象',
				TRUNCATE: 'TRUNCATE',
				ALTER_DROP: 'ALTER … DROP',
				DELETE_NO_WHERE: 'DELETE 无 WHERE',
				UPDATE_NO_WHERE: 'UPDATE 无 WHERE',
				GRANT_REVOKE: 'GRANT/REVOKE'
			};
			return map[f] || f;
		}

		function collectClientDangers(sqlText) {
			// 粗分：按分号（不完美，仅作提示）
			var parts = String(sqlText || '').split(';');
			var out = [], i, one, fl, prev;
			for (i = 0; i < parts.length; i++) {
				one = parts[i].trim();
				if (!one) continue;
				fl = dangerFlagsOne(one);
				if (!fl.length) continue;
				prev = one.replace(/\s+/g, ' ');
				if (prev.length > 100) prev = prev.slice(0, 100) + '…';
				out.push({ index: out.length + 1, flags: fl, preview: prev });
			}
			return out;
		}

		function confirmDanger(dangers) {
			var lines = ['检测到危险语句，确认继续执行？', ''];
			var i, d, j;
			for (i = 0; i < dangers.length; i++) {
				d = dangers[i];
				var labs = [];
				for (j = 0; j < (d.flags || []).length; j++) labs.push(flagLabel(d.flags[j]));
				lines.push('#' + (d.index || (i + 1)) + ' [' + labs.join(', ') + ']');
				if (d.preview) lines.push('  ' + d.preview);
			}
			var msg = lines.join('\n');
			if (window.SqlmngerUi && SqlmngerUi.confirm) {
				return SqlmngerUi.confirm(msg, '危险语句确认');
			}
			return Promise.resolve(!!window.confirm(msg));
		}

		function runSql(opts) {
			opts = opts || {};
			var sql = (ta.value || '').trim();
			if (!sql) {
				setMsg('请输入 SQL', 'err');
				return;
			}

			var confirmed = !!opts.confirmDangerous;
			var localDanger = collectClientDangers(sql);

			function doPost(forceConfirm) {
				setMsg('执行中…', 'info');
				destroyGrids();
				resultWrap.innerHTML = '<div class="sqlmnger-sql-result-empty">执行中…</div>';

				var body = {
					database: database,
					sql: sql
				};
				if (forceConfirm) body.confirm_dangerous = true;

				SqlmngerApi.post('api/sql_exec.php', body).then(function (env) {
					if (state.destroyed) return;
					var data = env.data || {};
					if (data.kind === 'batch') {
						renderBatchResult(data);
					} else if (data.kind === 'query') {
						renderSingleQuery(data);
					} else {
						renderSingleExec(data);
					}
				}).catch(function (err) {
					if (state.destroyed) return;
					// 服务端要求确认
					if (err && err.error && err.error.code === 'DANGEROUS_SQL') {
						var detail = err.error.detail;
						var dangers = (detail && detail.dangers) ? detail.dangers : localDanger;
						confirmDanger(dangers).then(function (ok) {
							if (ok) doPost(true);
							else {
								resultWrap.innerHTML =
									'<div class="sqlmnger-sql-result-empty">已取消危险语句执行</div>';
								setMsg('已取消', 'info');
							}
						});
						return;
					}
					var m = errMsg(err);
					resultWrap.innerHTML = '<div class="sqlmnger-sql-exec-err"><i class="fa-solid fa-circle-exclamation"></i> ' + esc(m) + '</div>';
					setMsg(m, 'err');
				});
			}

			// 客户端先确认（少一次往返）；服务端仍会校验
			if (!confirmed && localDanger.length) {
				confirmDanger(localDanger).then(function (ok) {
					if (ok) doPost(true);
					else setMsg('已取消', 'info');
				});
				return;
			}
			doPost(confirmed);
		}

		function pushExportSet(data, label) {
			var cols = data.columns || [];
			var rows = data.rows || [];
			state.exportSets.push({
				columns: cols.slice(),
				rows: rows,
				label: label || ('result_' + (state.exportSets.length + 1))
			});
			setExportEnabled(state.exportSets.length > 0);
		}

		function renderSingleQuery(data) {
			resultWrap.innerHTML = '';
			resultWrap.className = 'sqlmnger-sql-result';
			var host = document.createElement('div');
			host.className = 'sqlmnger-tp-gridwrap';
			host.style.height = '100%';
			resultWrap.appendChild(host);
			var grid = bindQueryGrid(host, data, '结果 ' + (data.rows ? data.rows.length : 0) + ' 行'
				+ (data.elapsed_ms != null ? (' · ' + data.elapsed_ms + ' ms') : '')
				+ ' · 只读');
			if (grid) state.grids.push(grid);
			pushExportSet(data, 'query');
			setMsg('查询成功 · ' + (data.rows ? data.rows.length : 0) + ' 行', 'ok');
		}

		function renderSingleExec(data) {
			resultWrap.className = 'sqlmnger-sql-result';
			resultWrap.innerHTML =
				'<div class="sqlmnger-sql-exec-ok">' +
				'<i class="fa-solid fa-circle-check"></i> 执行成功 · 影响行数 <b>' +
				(data.affected != null ? data.affected : 0) +
				'</b> · ' + (data.elapsed_ms != null ? data.elapsed_ms + ' ms' : '') +
				'</div>';
			setMsg('执行成功 · affected=' + (data.affected != null ? data.affected : 0), 'ok');
			if (typeof spec.onExec === 'function') {
				try { spec.onExec(data); } catch (ex) { /* */ }
			}
		}

		function renderBatchResult(data) {
			var results = data.results || [];
			var fail = data.fail || 0;
			var ok = data.ok || 0;
			var hasExecOk = false;
			var i, r;

			resultWrap.innerHTML = '';
			resultWrap.className = 'sqlmnger-sql-result is-batch';

			var sum = document.createElement('div');
			sum.className = 'sqlmnger-sql-batch-sum' + (fail ? ' is-fail' : ' is-ok');
			if (fail) {
				sum.innerHTML =
					'<i class="fa-solid fa-circle-exclamation"></i> 执行中止 · 成功 ' + ok +
					' / 共 ' + (data.count != null ? data.count : results.length) +
					' 条 · ' + (data.elapsed_ms != null ? data.elapsed_ms + ' ms' : '') +
					(data.message ? (' · ' + esc(data.message)) : '');
			} else {
				sum.innerHTML =
					'<i class="fa-solid fa-circle-check"></i> 全部成功 · ' + ok +
					' 条语句 · ' + (data.elapsed_ms != null ? data.elapsed_ms + ' ms' : '');
			}
			resultWrap.appendChild(sum);

			var list = document.createElement('div');
			list.className = 'sqlmnger-sql-batch-list';
			resultWrap.appendChild(list);

			for (i = 0; i < results.length; i++) {
				r = results[i];
				list.appendChild(renderBatchItem(r));
				if (r.kind === 'exec' && r.ok) hasExecOk = true;
			}

			if (fail) {
				setMsg(data.message || ('执行中止 · 成功 ' + ok + ' 条'), 'err');
			} else {
				setMsg('执行成功 · ' + ok + ' 条语句', 'ok');
			}

			if (hasExecOk && typeof spec.onExec === 'function') {
				try { spec.onExec(data); } catch (ex) { /* */ }
			}
		}

		function renderBatchItem(r) {
			var box = document.createElement('div');
			box.className = 'sqlmnger-sql-batch-item' + (r.ok ? '' : ' is-err');

			var hd = document.createElement('div');
			hd.className = 'sqlmnger-sql-batch-hd';
			var badge = r.ok
				? '<span class="sqlmnger-sql-batch-badge ok">#' + r.index + ' OK</span>'
				: '<span class="sqlmnger-sql-batch-badge err">#' + r.index + ' 失败</span>';
			var kindLab = r.kind === 'query' ? '查询' : '执行';
			var meta = kindLab;
			if (r.ok && r.kind === 'query') {
				meta += ' · ' + (r.total != null ? r.total : (r.rows ? r.rows.length : 0)) + ' 行';
			}
			if (r.ok && r.kind === 'exec') {
				meta += ' · affected=' + (r.affected != null ? r.affected : 0);
			}
			if (r.elapsed_ms != null) meta += ' · ' + r.elapsed_ms + ' ms';
			hd.innerHTML = badge +
				'<span class="sqlmnger-sql-batch-meta">' + esc(meta) + '</span>' +
				'<span class="sqlmnger-sql-batch-preview" title="' + escAttr(r.sql || r.preview || '') + '">' +
				esc(r.preview || r.sql || '') + '</span>';
			box.appendChild(hd);

			if (!r.ok) {
				var err = document.createElement('div');
				err.className = 'sqlmnger-sql-exec-err';
				err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + esc(r.message || '失败');
				box.appendChild(err);
				return box;
			}

			if (r.kind === 'query') {
				var host = document.createElement('div');
				host.className = 'sqlmnger-sql-batch-grid';
				box.appendChild(host);
				var grid = bindQueryGrid(host, r, '结果 ' + (r.rows ? r.rows.length : 0) + ' 行 · 只读');
				if (grid) state.grids.push(grid);
				pushExportSet(r, 'q' + (r.index || state.exportSets.length + 1));
			} else {
				var okEl = document.createElement('div');
				okEl.className = 'sqlmnger-sql-exec-ok sqlmnger-sql-batch-exec';
				okEl.innerHTML =
					'<i class="fa-solid fa-circle-check"></i> 影响行数 <b>' +
					(r.affected != null ? r.affected : 0) + '</b>';
				box.appendChild(okEl);
			}
			return box;
		}

		function bindQueryGrid(host, data, toolbarText) {
			var colsMeta = data.columns || [];
			var rows = data.rows || [];
			var columns = [];
			var i;
			for (i = 0; i < colsMeta.length; i++) {
				columns.push({
					field: i,
					t: colsMeta[i],
					name: colsMeta[i],
					w: 120,
					editable: false
				});
			}
			try {
				var grid = SqlmngerTable.bindGrid(host, {
					columns: columns,
					rows: rows,
					total: rows.length
				}, {
					editable: false,
					sortable: true,
					filterRow: true,
					autoFit: true,
					minColWidth: 48,
					maxColWidth: 320,
					toolbarText: toolbarText || '',
					toolbar: false,
					statusBar: true
				});
				if (grid && grid.el) {
					grid.el.style.flex = '1';
					grid.el.style.height = '100%';
					grid.el.style.minHeight = '0';
				}
				return grid;
			} catch (err) {
				host.innerHTML = '<div class="sqlmnger-sql-exec-err">' + esc(String(err)) + '</div>';
				return null;
			}
		}

		// ─── 导出：打开 / 导出 / 导出zip ───
		function cellStr(v) {
			if (v == null) return '';
			return String(v);
		}

		function cellAt(row, cols, j) {
			if (Object.prototype.toString.call(row) === '[object Array]') {
				return row[j];
			}
			return row[cols[j]];
		}

		function csvEscape(v, sep) {
			var s = cellStr(v);
			if (s.indexOf('"') >= 0 || s.indexOf(sep) >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
				return '"' + s.replace(/"/g, '""') + '"';
			}
			return s;
		}

		function buildDelimited(set, sep) {
			var lines = [];
			var cols = set.columns || [];
			var rows = set.rows || [];
			var i, j, line;
			line = [];
			for (i = 0; i < cols.length; i++) line.push(csvEscape(cols[i], sep));
			lines.push(line.join(sep));
			for (i = 0; i < rows.length; i++) {
				line = [];
				for (j = 0; j < cols.length; j++) {
					line.push(csvEscape(cellAt(rows[i] || [], cols, j), sep));
				}
				lines.push(line.join(sep));
			}
			return '\ufeff' + lines.join('\r\n');
		}

		function buildJson(set) {
			var cols = set.columns || [];
			var rows = set.rows || [];
			var arr = [], i, j, row, o;
			for (i = 0; i < rows.length; i++) {
				row = rows[i] || [];
				o = {};
				if (Object.prototype.toString.call(row) === '[object Array]') {
					for (j = 0; j < cols.length; j++) o[cols[j]] = row[j];
				} else {
					o = row;
				}
				arr.push(o);
			}
			return JSON.stringify(arr, null, 2);
		}

		function sqlQuote(v) {
			if (v == null) return 'NULL';
			if (typeof v === 'number' && isFinite(v)) return String(v);
			if (typeof v === 'boolean') return v ? '1' : '0';
			return "'" + String(v).replace(/'/g, "''") + "'";
		}

		function buildInsertSql(set) {
			var cols = set.columns || [];
			var rows = set.rows || [];
			if (!cols.length) return '-- empty\n';
			var i, j, parts, line, colList;
			colList = [];
			for (i = 0; i < cols.length; i++) {
				colList.push('`' + String(cols[i]).replace(/`/g, '``') + '`');
			}
			var head = 'INSERT INTO `result` (' + colList.join(', ') + ') VALUES\n';
			var lines = [];
			for (i = 0; i < rows.length; i++) {
				parts = [];
				for (j = 0; j < cols.length; j++) {
					parts.push(sqlQuote(cellAt(rows[i] || [], cols, j)));
				}
				line = '(' + parts.join(', ') + ')' + (i < rows.length - 1 ? ',' : ';');
				lines.push(line);
			}
			if (!lines.length) return head + '/* no rows */;\n';
			return head + lines.join('\n') + '\n';
		}

		function buildExportText(set, fmt) {
			if (fmt === 'json') return buildJson(set);
			if (fmt === 'sql') return buildInsertSql(set);
			if (fmt === 'tsv') return buildDelimited(set, '\t');
			return buildDelimited(set, ',');
		}

		function extOf(fmt) {
			if (fmt === 'json') return 'json';
			if (fmt === 'sql') return 'sql';
			if (fmt === 'tsv') return 'tsv';
			return 'csv';
		}

		function mimeOf(fmt) {
			if (fmt === 'json') return 'application/json;charset=utf-8';
			if (fmt === 'sql') return 'text/plain;charset=utf-8';
			return 'text/csv;charset=utf-8';
		}

		function timeStamp() {
			var stamp = new Date();
			return stamp.getFullYear()
				+ ('0' + (stamp.getMonth() + 1)).slice(-2)
				+ ('0' + stamp.getDate()).slice(-2)
				+ '_'
				+ ('0' + stamp.getHours()).slice(-2)
				+ ('0' + stamp.getMinutes()).slice(-2)
				+ ('0' + stamp.getSeconds()).slice(-2);
		}

		function downloadBlob(blob, filename) {
			var url = (window.URL || window.webkitURL).createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = filename || 'export.bin';
			a.style.display = 'none';
			document.body.appendChild(a);
			a.click();
			setTimeout(function () {
				try { document.body.removeChild(a); } catch (e) { /* */ }
				try { (window.URL || window.webkitURL).revokeObjectURL(url); } catch (e2) { /* */ }
			}, 1500);
		}

		function downloadText(text, filename, mime) {
			downloadBlob(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }), filename);
		}

		// ── store-only ZIP（无压缩，纯前端） ──
		function crc32Table() {
			if (crc32Table._t) return crc32Table._t;
			var t = new Array(256), n, c, k;
			for (n = 0; n < 256; n++) {
				c = n;
				for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
				t[n] = c >>> 0;
			}
			crc32Table._t = t;
			return t;
		}

		function crc32Bytes(u8) {
			var tbl = crc32Table();
			var c = 0xFFFFFFFF, i;
			for (i = 0; i < u8.length; i++) c = tbl[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
			return (c ^ 0xFFFFFFFF) >>> 0;
		}

		function strToU8(str) {
			// UTF-8
			if (typeof TextEncoder !== 'undefined') {
				return new TextEncoder().encode(str);
			}
			var s = unescape(encodeURIComponent(str));
			var u8 = new Uint8Array(s.length), i;
			for (i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
			return u8;
		}

		function u32le(n) {
			return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
		}
		function u16le(n) {
			return [n & 0xFF, (n >>> 8) & 0xFF];
		}

		/**
		 * @param {Array<{name:string,text:string}>} files
		 * @returns {Blob}
		 */
		function buildZipStore(files) {
			var parts = [];
			var central = [];
			var offset = 0;
			var i, f, nameU8, dataU8, crc, local, cen;

			function pushBytes(arr, bytes) {
				var j;
				for (j = 0; j < bytes.length; j++) arr.push(bytes[j]);
			}

			for (i = 0; i < files.length; i++) {
				f = files[i];
				nameU8 = strToU8(f.name || ('file' + i + '.txt'));
				dataU8 = strToU8(f.text == null ? '' : String(f.text));
				crc = crc32Bytes(dataU8);

				local = [];
				pushBytes(local, [0x50, 0x4B, 0x03, 0x04]); // local header
				pushBytes(local, u16le(20)); // version
				pushBytes(local, u16le(0)); // flags
				pushBytes(local, u16le(0)); // method store
				pushBytes(local, u16le(0)); // time
				pushBytes(local, u16le(0)); // date
				pushBytes(local, u32le(crc));
				pushBytes(local, u32le(dataU8.length));
				pushBytes(local, u32le(dataU8.length));
				pushBytes(local, u16le(nameU8.length));
				pushBytes(local, u16le(0)); // extra
				// name + data
				var localU8 = new Uint8Array(local.length + nameU8.length + dataU8.length);
				localU8.set(local, 0);
				localU8.set(nameU8, local.length);
				localU8.set(dataU8, local.length + nameU8.length);
				parts.push(localU8);

				cen = [];
				pushBytes(cen, [0x50, 0x4B, 0x01, 0x02]); // central
				pushBytes(cen, u16le(20));
				pushBytes(cen, u16le(20));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u16le(0)); // store
				pushBytes(cen, u16le(0));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u32le(crc));
				pushBytes(cen, u32le(dataU8.length));
				pushBytes(cen, u32le(dataU8.length));
				pushBytes(cen, u16le(nameU8.length));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u16le(0));
				pushBytes(cen, u32le(0));
				pushBytes(cen, u32le(offset));
				var cenU8 = new Uint8Array(cen.length + nameU8.length);
				cenU8.set(cen, 0);
				cenU8.set(nameU8, cen.length);
				central.push(cenU8);

				offset += localU8.length;
			}

			var centralSize = 0;
			for (i = 0; i < central.length; i++) centralSize += central[i].length;
			var end = [];
			pushBytes(end, [0x50, 0x4B, 0x05, 0x06]);
			pushBytes(end, u16le(0));
			pushBytes(end, u16le(0));
			pushBytes(end, u16le(files.length));
			pushBytes(end, u16le(files.length));
			pushBytes(end, u32le(centralSize));
			pushBytes(end, u32le(offset));
			pushBytes(end, u16le(0));
			var endU8 = new Uint8Array(end);

			var blobs = parts.concat(central);
			blobs.push(endU8);
			return new Blob(blobs, { type: 'application/zip' });
		}

		function openExportPreview(text, filename, fmt, meta) {
			if (typeof X === 'undefined' || !X.WinMgr) {
				// 回退：下载
				downloadText(text, filename, mimeOf(fmt));
				setMsg('已下载 ' + filename + '（无预览组件）', 'ok');
				return;
			}
			var wrap = document.createElement('div');
			wrap.className = 'sqlmnger-export-preview';
			var metaEl = document.createElement('div');
			metaEl.className = 'sqlmnger-export-preview-meta';
			metaEl.textContent = meta || '';
			wrap.appendChild(metaEl);
			var pre = document.createElement('pre');
			pre.className = 'sqlmnger-export-preview-pre';
			// 超大内容截断预览
			var preview = text == null ? '' : String(text);
			var truncated = false;
			if (preview.length > 500000) {
				preview = preview.slice(0, 500000) + '\n\n/* … 预览已截断，完整内容请下载 … */\n';
				truncated = true;
			}
			pre.textContent = preview;
			wrap.appendChild(pre);

			var blob = new Blob([text], { type: mimeOf(fmt) });
			var win = X.WinMgr.create({
				xtype: 'window',
				title: '导出预览 · ' + filename + (truncated ? '（预览截断）' : ''),
				width: Math.min(920, Math.max(480, (window.innerWidth || 900) - 80)),
				height: Math.min(640, Math.max(360, (window.innerHeight || 700) - 80)),
				modal: true,
				resizable: true,
				bbar: [
					{
						xtype: 'button',
						text: '复制全部',
						handler: function () {
							var full = text == null ? '' : String(text);
							var p;
							if (navigator.clipboard && navigator.clipboard.writeText) {
								p = navigator.clipboard.writeText(full).then(function () { return true; })
									.catch(function () { return false; });
							} else {
								p = Promise.resolve(false);
							}
							p.then(function (ok) {
								if (ok && window.SqlmngerUi && SqlmngerUi.toast) SqlmngerUi.toast('已复制', 'ok');
								else if (!ok) {
									// fallback
									var ta = document.createElement('textarea');
									ta.value = full;
									document.body.appendChild(ta);
									ta.select();
									try { document.execCommand('copy'); } catch (e) { /* */ }
									try { document.body.removeChild(ta); } catch (e2) { /* */ }
									if (window.SqlmngerUi && SqlmngerUi.toast) SqlmngerUi.toast('已复制', 'ok');
								}
							});
						}
					},
					{
						xtype: 'button',
						text: '下载',
						cls: 'primary',
						handler: function () {
							downloadBlob(blob, filename);
							if (window.SqlmngerUi && SqlmngerUi.toast) {
								SqlmngerUi.toast('已开始下载 ' + filename, 'ok');
							}
						}
					},
					{
						xtype: 'button',
						text: '关闭',
						handler: function () {
							try { win.close(); } catch (e) { /* */ }
						}
					}
				]
			});
			if (win.el) win.el.classList.add('sqlmnger-export-win');
			var bd = win._bd || (win.el && win.el.querySelector('.xwin-bd'));
			if (bd) {
				bd.innerHTML = '';
				bd.appendChild(wrap);
				bd.style.overflow = 'hidden';
				bd.style.padding = '0';
				bd.style.display = 'flex';
				bd.style.flexDirection = 'column';
				bd.style.minHeight = '0';
			}
			if (win._bbr) win._bbr.classList.add('sqlmnger-export-win-bbr');
		}

		/**
		 * @param {string} [mode] open|save|zip
		 */
		function doExport(mode) {
			if (!state.exportSets.length) {
				setMsg('无可导出的查询结果', 'err');
				return;
			}
			if (mode !== 'save' && mode !== 'open' && mode !== 'zip') mode = exportMode;
			var fmt = exportFmt ? String(exportFmt.value || 'csv') : 'csv';
			if (fmt !== 'csv' && fmt !== 'json' && fmt !== 'tsv' && fmt !== 'sql') fmt = 'csv';

			var base = 'sql_result_' + (database || 'db') + '_' + timeStamp();
			var multi = state.exportSets.length > 1;
			var files = [];
			var i, set, text, name, previewText = '', previewName = '';

			for (i = 0; i < state.exportSets.length; i++) {
				set = state.exportSets[i];
				name = multi
					? (base + '_' + (set.label || (i + 1)) + '.' + extOf(fmt))
					: (base + '.' + extOf(fmt));
				text = buildExportText(set, fmt);
				files.push({ name: name, text: text });
				if (i === 0) {
					previewText = text;
					previewName = name;
				}
			}

			if (mode === 'open') {
				// 多结果集：合并预览说明
				if (multi) {
					var joined = [];
					for (i = 0; i < files.length; i++) {
						joined.push('/* ===== ' + files[i].name + ' ===== */\n' + files[i].text);
					}
					previewText = joined.join('\n\n');
					previewName = base + '_all.' + extOf(fmt);
				}
				openExportPreview(
					previewText,
					previewName,
					fmt,
					(database || '') + ' · SQL 结果 · ' + String(fmt).toUpperCase()
						+ ' · ' + state.exportSets.length + ' 个结果集 · '
						+ (previewText ? previewText.length : 0) + ' 字符'
				);
				setMsg('已打开预览', 'ok');
				return;
			}

			if (mode === 'zip') {
				var zipName = base + '.zip';
				// 单文件也打 zip，与表导出一致
				var zipBlob = buildZipStore(files);
				downloadBlob(zipBlob, zipName);
				setMsg('已导出 ZIP · ' + files.length + ' 个文件', 'ok');
				if (window.SqlmngerUi && SqlmngerUi.toast) {
					SqlmngerUi.toast('ZIP 导出成功: ' + zipName, 'ok');
				}
				return;
			}

			// save：逐个下载
			for (i = 0; i < files.length; i++) {
				downloadText(files[i].text, files[i].name, mimeOf(fmt));
			}
			setMsg('已导出 ' + files.length + ' 个文件', 'ok');
			if (window.SqlmngerUi && SqlmngerUi.toast) {
				SqlmngerUi.toast('导出成功: ' + files.length + ' 个文件', 'ok');
			}
		}

		// 导出菜单交互
		if (exportWrap) {
			exportWrap.onclick = function (e) {
				var tbtn = e.target;
				while (tbtn && tbtn !== exportWrap && !tbtn.getAttribute('data-act') && !tbtn.getAttribute('data-export-mode')) {
					tbtn = tbtn.parentNode;
				}
				if (!tbtn || tbtn === exportWrap) return;
				if (tbtn.getAttribute('data-act') === 'export-toggle') {
					e.preventDefault();
					e.stopPropagation();
					toggleExportMenu();
					return;
				}
				var mode = tbtn.getAttribute('data-export-mode');
				if (mode) {
					e.preventDefault();
					e.stopPropagation();
					setExportMode(mode);
					closeExportMenu();
					doExport(mode);
				}
			};
		}
		document.addEventListener('mousedown', function (e) {
			if (!exportDd || !exportMenu || exportMenu.hidden) return;
			var n = e.target;
			while (n) {
				if (n === exportDd) return;
				n = n.parentNode;
			}
			closeExportMenu();
		});

		toolbar.onclick = function (e) {
			var tbtn = e.target;
			while (tbtn && tbtn !== toolbar && !tbtn.getAttribute('data-act')) tbtn = tbtn.parentNode;
			if (!tbtn || !tbtn.getAttribute) return;
			var act = tbtn.getAttribute('data-act');
			if (act === 'run') runSql();
			if (act === 'clear') {
				ta.value = '';
				destroyGrids();
				resultWrap.className = 'sqlmnger-sql-result';
				resultWrap.innerHTML = '<div class="sqlmnger-sql-result-empty">执行结果将显示在这里</div>';
				setMsg('', '');
			}
			// export-toggle 由 exportWrap 处理
		};

		function onKey(e) {
			if (state.destroyed) return;
			if (e.ctrlKey && (e.key === 'Enter' || e.keyCode === 13)) {
				if (document.activeElement === ta) {
					e.preventDefault();
					runSql();
				}
			}
		}
		document.addEventListener('keydown', onKey);

		function esc(s) {
			return String(s == null ? '' : s)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		}
		function escAttr(s) {
			return esc(s).replace(/"/g, '&quot;');
		}
		function errMsg(err) {
			if (err && err.error && err.error.message) {
				var m = err.error.message;
				if (err.error.detail) {
					if (typeof err.error.detail === 'string') m += ' — ' + err.error.detail;
				}
				return m;
			}
			return String(err);
		}

		setTimeout(function () {
			try { ta.focus(); } catch (e) { /* */ }
		}, 50);

		return Promise.resolve({
			el: el,
			destroy: function () {
				state.destroyed = true;
				document.removeEventListener('keydown', onKey);
				destroyGrids();
			},
			/** 供外部预填 SQL */
			setSql: function (s) {
				ta.value = s == null ? '' : String(s);
			}
		});
	}
})();
