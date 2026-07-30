/**
 * 数据库级 导出 / 导入（Adminer 能力，本项目自有样式）
 * SqlmngerDbIO.openExport / openImport
 */
window.SqlmngerDbIO = (function () {
	var t = {
		openExport: openExport,
		openImport: openImport
	};
	return t;

	function uiToast(msg, kind) {
		if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) SqlmngerUi.toast(msg, kind || 'ok');
	}
	function uiError(msg) {
		if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) return SqlmngerUi.error(msg);
		alert(msg);
		return Promise.resolve();
	}
	function errMsg(err) {
		if (err && err.error && err.error.message) {
			var m = err.error.message;
			if (err.error.detail) m += ' — ' + err.error.detail;
			return m;
		}
		return String(err);
	}
	function esc(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function escAttr(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
	}

	/**
	 * @param {{database:string, tables?:Array, readonly?:boolean}} opts
	 */
	function openExport(opts) {
		opts = opts || {};
		var database = opts.database || '';
		if (!database) {
			uiError('未指定数据库');
			return;
		}
		if (typeof X === 'undefined' || !X.WinMgr) {
			uiError('界面组件未就绪');
			return;
		}

		var body = document.createElement('div');
		body.className = 'sqlmnger-dbio-body';
		body.innerHTML =
			'<div class="sqlmnger-dbio-msg" data-role="msg"></div>' +
			'<div class="sqlmnger-dbio-form">' +
			'<div class="sqlmnger-dbio-row"><span class="lab">输出</span>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="out" value="open" checked /> 打开</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="out" value="save" /> 保存</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="out" value="zip" /> zip</label>' +
			'</div>' +
			'<div class="sqlmnger-dbio-row"><span class="lab">格式</span>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="fmt" value="sql" checked /> SQL</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="fmt" value="csv" /> CSV</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="radio" name="fmt" value="tsv" /> TSV</label>' +
			'</div>' +
			'<div class="sqlmnger-dbio-row"><span class="lab">数据库</span>' +
			'<b class="sqlmnger-dbio-db">' + esc(database) + '</b> ' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="routines" /> 存储过程/函数</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="events" /> 事件</label>' +
			'</div>' +
			'<div class="sqlmnger-dbio-row"><span class="lab">表结构</span>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="drop" checked /> DROP+CREATE</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="create" checked /> CREATE</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="auto_increment" checked /> 自动增量</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-opt="triggers" /> 触发器</label>' +
			'</div>' +
			'<div class="sqlmnger-dbio-row"><span class="lab">数据</span>' +
			'<select data-opt="data_mode" class="sqlmnger-input sqlmnger-dbio-sel">' +
			'<option value="insert" selected>INSERT</option>' +
			'<option value="insert_ignore">INSERT IGNORE</option>' +
			'<option value="replace">REPLACE</option>' +
			'<option value="none">不导出数据</option>' +
			'</select>' +
			'</div>' +
			'</div>' +
			'<div class="sqlmnger-dbio-tbl-wrap">' +
			'<table class="sqlmnger-overview-table sqlmnger-dbio-tbl">' +
			'<thead><tr>' +
			'<th class="c-check"><input type="checkbox" data-role="chk-all-struct" title="全选结构" checked /></th>' +
			'<th>表</th>' +
			'<th class="num">约行数</th>' +
			'<th class="c-check"><input type="checkbox" data-role="chk-all-data" title="全选数据" checked /> 数据</th>' +
			'</tr></thead><tbody data-role="tbody"><tr><td colspan="4" class="muted">加载表列表…</td></tr></tbody>' +
			'</table></div>';

		var msgEl = body.querySelector('[data-role=msg]');
		var tbody = body.querySelector('[data-role=tbody]');
		var tableRows = [];

		function setMsg(text, kind) {
			msgEl.textContent = text || '';
			msgEl.className = 'sqlmnger-dbio-msg' + (kind ? ' is-' + kind : '');
		}

		function loadTables() {
			SqlmngerApi.post('api/db_overview.php', { database: database }).then(function (env) {
				var tables = (env.data && env.data.tables) || [];
				tableRows = tables;
				renderTableList(tables);
			}).catch(function (err) {
				tbody.innerHTML = '<tr><td colspan="4" class="sqlmnger-sql-exec-err">' + esc(errMsg(err)) + '</td></tr>';
			});
		}

		function renderTableList(tables) {
			tbody.innerHTML = '';
			var i, row, tr, name, rowsEst;
			for (i = 0; i < tables.length; i++) {
				row = tables[i];
				name = row.name || '';
				if (row.type === 'view') continue; // 视图可选：暂只导出基表
				rowsEst = row.rows_est != null ? ('~ ' + row.rows_est) : '?';
				tr = document.createElement('tr');
				tr.innerHTML =
					'<td class="c-check"><input type="checkbox" data-struct="1" data-name="' + escAttr(name) + '" checked /></td>' +
					'<td>' + esc(name) + (row.type === 'view' ? ' <span class="sqlmnger-badge">视图</span>' : '') + '</td>' +
					'<td class="num muted">' + esc(String(rowsEst)) + '</td>' +
					'<td class="c-check"><input type="checkbox" data-data="1" data-name="' + escAttr(name) + '" checked /></td>';
				tbody.appendChild(tr);
			}
			if (!tbody.children.length) {
				tbody.innerHTML = '<tr><td colspan="4" class="muted">无表可导出</td></tr>';
			}
		}

		body.querySelector('[data-role=chk-all-struct]').onchange = function () {
			var on = !!this.checked;
			var list = tbody.querySelectorAll('input[data-struct]');
			var j;
			for (j = 0; j < list.length; j++) list[j].checked = on;
		};
		body.querySelector('[data-role=chk-all-data]').onchange = function () {
			var on = !!this.checked;
			var list = tbody.querySelectorAll('input[data-data]');
			var j;
			for (j = 0; j < list.length; j++) list[j].checked = on;
		};

		function collectPayload() {
			var out = 'save';
			var radios = body.querySelectorAll('input[name=out]');
			var r;
			for (r = 0; r < radios.length; r++) {
				if (radios[r].checked) out = radios[r].value;
			}
			var fmt = 'sql';
			var fr = body.querySelectorAll('input[name=fmt]');
			for (r = 0; r < fr.length; r++) {
				if (fr[r].checked) fmt = fr[r].value;
			}
			var tables = [];
			var names = {};
			var structs = tbody.querySelectorAll('input[data-struct]');
			var j, n, st, dt;
			for (j = 0; j < structs.length; j++) {
				n = structs[j].getAttribute('data-name');
				if (!n) continue;
				if (!names[n]) names[n] = { name: n, structure: false, data: false };
				names[n].structure = !!structs[j].checked;
			}
			var datas = tbody.querySelectorAll('input[data-data]');
			for (j = 0; j < datas.length; j++) {
				n = datas[j].getAttribute('data-name');
				if (!n) continue;
				if (!names[n]) names[n] = { name: n, structure: false, data: false };
				names[n].data = !!datas[j].checked;
			}
			for (n in names) {
				if (!Object.prototype.hasOwnProperty.call(names, n)) continue;
				st = names[n];
				if (st.structure || st.data) tables.push(st);
			}
			var dataMode = body.querySelector('[data-opt=data_mode]');
			return {
				outMode: out,
				body: {
					database: database,
					format: fmt,
					zip: out === 'zip',
					options: {
						drop: !!body.querySelector('[data-opt=drop]').checked,
						create: !!body.querySelector('[data-opt=create]').checked,
						auto_increment: !!body.querySelector('[data-opt=auto_increment]').checked,
						triggers: !!body.querySelector('[data-opt=triggers]').checked,
						routines: !!body.querySelector('[data-opt=routines]').checked,
						events: !!body.querySelector('[data-opt=events]').checked,
						data_mode: dataMode ? dataMode.value : 'insert'
					},
					tables: tables
				}
			};
		}

		function doExport() {
			var pack = collectPayload();
			if (!pack.body.tables.length) {
				setMsg('请至少勾选一张表的结构或数据', 'err');
				return;
			}
			setMsg('导出中，大库可能较久…', 'info');
			var mode = pack.outMode;
			var p = (mode === 'open')
				? SqlmngerApi.fetchBlob('api/db_export.php', pack.body)
				: SqlmngerApi.download('api/db_export.php', pack.body);
			p.then(function (res) {
				var name = (res && res.filename) || 'export';
				if (mode === 'open') {
					return openPreview(res, pack.body.format).then(function () {
						setMsg('已打开: ' + name, 'ok');
						uiToast('导出预览已打开', 'ok');
					});
				}
				setMsg('已导出: ' + name, 'ok');
				uiToast('导出成功: ' + name, 'ok');
			}).catch(function (err) {
				setMsg('导出失败: ' + errMsg(err), 'err');
				uiError('导出失败: ' + errMsg(err));
			});
		}

		function openPreview(res, fmt) {
			var blob = res && res.blob;
			if (!blob) return Promise.resolve();
			// zip/binary：提示下载
			var ct = (res.contentType || '') + '';
			var fn = (res.filename || '') + '';
			if (fmt !== 'sql' && fmt !== 'csv' && fmt !== 'tsv' || /\.zip$/i.test(fn) || ct.indexOf('zip') >= 0) {
				return uiError('该格式为压缩/多文件，请用「保存」或「zip」下载').then(function () {
					return false;
				});
			}
			return readBlobText(blob).then(function (text) {
				var wrap = document.createElement('div');
				wrap.className = 'sqlmnger-export-preview';
				wrap.innerHTML =
					'<div class="sqlmnger-export-preview-meta"></div>' +
					'<pre class="sqlmnger-export-preview-pre"></pre>';
				wrap.querySelector('.sqlmnger-export-preview-meta').textContent =
					(res.filename || '') + ' · ' + (text ? text.length : 0) + ' 字符';
				wrap.querySelector('pre').textContent = text || '';
				var w = X.WinMgr.create({
					xtype: 'window',
					title: '导出预览 · ' + (res.filename || database),
					width: Math.min(900, (window.innerWidth || 900) - 60),
					height: Math.min(600, (window.innerHeight || 700) - 60),
					modal: true,
					bbar: [{
						xtype: 'button',
						text: '关闭',
						handler: function () { try { w.close(); } catch (e) { /* */ } }
					}]
				});
				if (w.el) w.el.classList.add('sqlmnger-export-win');
				var bd = w._bd || (w.el && w.el.querySelector('.xwin-bd'));
				if (bd) {
					bd.innerHTML = '';
					bd.appendChild(wrap);
					bd.style.padding = '0';
					bd.style.overflow = 'hidden';
					bd.style.display = 'flex';
					bd.style.flexDirection = 'column';
				}
				return true;
			});
		}

		function readBlobText(blob) {
			return new Promise(function (resolve) {
				if (!blob) { resolve(''); return; }
				if (typeof blob.text === 'function') {
					blob.text().then(function (t) { resolve(String(t || '')); }).catch(function () { resolve(''); });
					return;
				}
				var fr = new FileReader();
				fr.onload = function () { resolve(String(fr.result || '')); };
				fr.onerror = function () { resolve(''); };
				fr.readAsText(blob);
			});
		}

		var win = X.WinMgr.create({
			xtype: 'window',
			title: '导出: ' + database,
			width: 640,
			height: 520,
			modal: true,
			bbar: [
				{
					xtype: 'button',
					text: '导出',
					cls: 'primary',
					handler: function () { doExport(); }
				},
				{
					xtype: 'button',
					text: '关闭',
					handler: function () { try { win.close(); } catch (e) { /* */ } }
				}
			]
		});
		if (win.el) win.el.classList.add('sqlmnger-dbio-win');
		var bd = win._bd || (win.el && win.el.querySelector('.xwin-bd'));
		if (bd) {
			bd.innerHTML = '';
			bd.appendChild(body);
			bd.style.overflow = 'auto';
			bd.style.padding = '12px 14px';
		}
		loadTables();
		return win;
	}

	/**
	 * @param {{database:string, readonly?:boolean, onDone?:function}} opts
	 */
	function openImport(opts) {
		opts = opts || {};
		var database = opts.database || '';
		var readonly = !!opts.readonly;
		if (!database) {
			uiError('未指定数据库');
			return;
		}
		if (readonly) {
			uiError('只读连接无法导入');
			return;
		}
		if (typeof X === 'undefined' || !X.WinMgr) {
			uiError('界面组件未就绪');
			return;
		}

		var body = document.createElement('div');
		body.className = 'sqlmnger-dbio-body';
		body.innerHTML =
			'<div class="sqlmnger-dbio-msg" data-role="msg"></div>' +
			'<p class="sqlmnger-dbio-hint">导入 SQL 到数据库 <b></b>。支持 .sql / .sql.gz。大文件请耐心等待。</p>' +
			'<div class="sqlmnger-dbio-import-box">' +
			'<div class="sqlmnger-dbio-import-card">' +
			'<div class="sqlmnger-dbio-import-title">文件上传</div>' +
			'<label class="sqlmnger-dbio-file-lab">SQL[.gz] ' +
			'<input type="file" data-role="file" accept=".sql,.gz,.sql.gz,text/plain,application/sql,application/gzip" />' +
			'</label>' +
			'<span class="sqlmnger-dbio-file-name muted" data-role="fname">未选择文件</span>' +
			'</div>' +
			'</div>' +
			'<div class="sqlmnger-dbio-row" style="margin-top:10px">' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-role="stop" checked /> 出错时停止</label>' +
			'<label class="sqlmnger-dbio-opt"><input type="checkbox" data-role="erronly" /> 仅显示错误</label>' +
			'</div>' +
			'<div class="sqlmnger-dbio-log" data-role="log"></div>';

		body.querySelector('.sqlmnger-dbio-hint b').textContent = database;
		var msgEl = body.querySelector('[data-role=msg]');
		var fileInp = body.querySelector('[data-role=file]');
		var fnameEl = body.querySelector('[data-role=fname]');
		var logEl = body.querySelector('[data-role=log]');
		var stopEl = body.querySelector('[data-role=stop]');
		var errOnlyEl = body.querySelector('[data-role=erronly]');

		fileInp.onchange = function () {
			var f = fileInp.files && fileInp.files[0];
			fnameEl.textContent = f ? f.name : '未选择文件';
		};

		function setMsg(text, kind) {
			msgEl.textContent = text || '';
			msgEl.className = 'sqlmnger-dbio-msg' + (kind ? ' is-' + kind : '');
		}

		function doImport() {
			var f = fileInp.files && fileInp.files[0];
			if (!f) {
				setMsg('请选择 SQL 文件', 'err');
				return;
			}
			setMsg('导入中…', 'info');
			logEl.innerHTML = '';
			var fd = new FormData();
			fd.append('file', f);
			fd.append('database', database);
			fd.append('stop_on_error', stopEl.checked ? '1' : '0');
			fd.append('errors_only', errOnlyEl.checked ? '1' : '0');
			if (SqlmngerApi.getConnId()) {
				fd.append('c', SqlmngerApi.getConnId());
			}
			uploadForm('api/db_import.php', fd).then(function (env) {
				var d = (env && env.data) || {};
				setMsg(
					'完成：成功 ' + (d.ok || 0) + ' · 失败 ' + (d.fail || 0)
					+ (d.stopped ? ' · 已中止' : '')
					+ ' · ' + (d.elapsed_ms || 0) + ' ms',
					d.fail ? 'err' : 'ok'
				);
				renderLog(d);
				uiToast(d.fail ? '导入完成（有错误）' : '导入成功', d.fail ? 'err' : 'ok');
				if (typeof opts.onDone === 'function') {
					try { opts.onDone(d); } catch (ex) { /* */ }
				}
			}).catch(function (err) {
				setMsg('导入失败: ' + errMsg(err), 'err');
				uiError('导入失败: ' + errMsg(err));
			});
		}

		function renderLog(d) {
			var rows = d.log || d.errors || [];
			if (!rows.length) {
				logEl.innerHTML = '<div class="muted">无详细日志</div>';
				return;
			}
			var html = '<table class="sqlmnger-overview-table"><thead><tr><th>#</th><th>结果</th><th>语句</th></tr></thead><tbody>';
			var i, r;
			for (i = 0; i < rows.length; i++) {
				r = rows[i];
				html += '<tr class="' + (r.ok ? '' : 'sqlmnger-dbio-err-row') + '">' +
					'<td class="num">' + esc(String(r.n || '')) + '</td>' +
					'<td>' + (r.ok ? '<span class="ok">OK</span>' : '<span class="err">' + esc(r.message || 'ERR') + '</span>') + '</td>' +
					'<td class="muted sqlmnger-dbio-prev">' + esc(r.preview || '') + '</td></tr>';
			}
			html += '</tbody></table>';
			logEl.innerHTML = html;
		}

		function uploadForm(path, formData) {
			return new Promise(function (resolve, reject) {
				var xhr = new XMLHttpRequest();
				var url = path;
				var c = SqlmngerApi.getConnId();
				if (c) url += (path.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(c);
				// baseUrl
				if (SqlmngerApi.baseUrl) {
					var b = String(SqlmngerApi.baseUrl).replace(/\/+$/, '');
					url = b + '/' + url.replace(/^\/+/, '');
				}
				xhr.open('POST', url, true);
				xhr.timeout = SqlmngerApi.downloadTimeoutMs || 600000;
				xhr.withCredentials = true;
				xhr.setRequestHeader('Accept', 'application/json');
				xhr.onreadystatechange = function () {
					if (xhr.readyState !== 4) return;
					var text = xhr.responseText || '';
					var env = null;
					try { env = text ? JSON.parse(text) : null; } catch (e) {
						reject({ ok: false, error: { code: 'BAD_JSON', message: '响应不是 JSON', detail: text.slice(0, 200) } });
						return;
					}
					if (xhr.status >= 200 && xhr.status < 300 && env && env.ok) resolve(env);
					else reject(env || { ok: false, error: { message: 'HTTP ' + xhr.status } });
				};
				xhr.ontimeout = function () {
					reject({ ok: false, error: { code: 'TIMEOUT', message: '导入超时' } });
				};
				xhr.onerror = function () {
					reject({ ok: false, error: { code: 'NETWORK', message: '网络错误' } });
				};
				xhr.send(formData);
			});
		}

		var win = X.WinMgr.create({
			xtype: 'window',
			title: '导入: ' + database,
			width: 640,
			height: 480,
			modal: true,
			bbar: [
				{
					xtype: 'button',
					text: '执行',
					cls: 'primary',
					handler: function () { doImport(); }
				},
				{
					xtype: 'button',
					text: '关闭',
					handler: function () { try { win.close(); } catch (e) { /* */ } }
				}
			]
		});
		if (win.el) win.el.classList.add('sqlmnger-dbio-win');
		var bd = win._bd || (win.el && win.el.querySelector('.xwin-bd'));
		if (bd) {
			bd.innerHTML = '';
			bd.appendChild(body);
			bd.style.overflow = 'auto';
			bd.style.padding = '12px 14px';
		}
		return win;
	}
})();
