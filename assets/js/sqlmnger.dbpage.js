/**
 * 数据库概览页：表和视图列表（仿 Adminer）
 * 表头可排序；默认按表名倒序
 */
window.SqlmngerDbPage = (function () {
	var t = { create: create };
	return t;

	function create(spec) {
		spec = spec || {};
		var database = spec.database || '';
		var readonly = !!spec.readonly;
		var onOpenTable = typeof spec.onOpenTable === 'function' ? spec.onOpenTable : null;
		var onReloadTables = typeof spec.onReloadTables === 'function' ? spec.onReloadTables : null;

		var el = document.createElement('div');
		el.className = 'xpg sqlmnger-db-page';
		el.style.cssText = 'overflow:auto;display:flex;flex-direction:column;height:100%;flex:1;min-height:0;padding:12px 16px;box-sizing:border-box;';

		var hd = document.createElement('div');
		hd.className = 'sqlmnger-page-hd';
		hd.innerHTML =
			'<h2 class="sqlmnger-page-title">数据库: <span data-role="dbname"></span></h2>' +
			'<div class="sqlmnger-page-tools">' +
			'<button type="button" class="sqlmnger-link-btn" data-act="export"><i class="fa-solid fa-file-export"></i> 导出</button>' +
			(readonly ? '' : '<button type="button" class="sqlmnger-link-btn" data-act="import"><i class="fa-solid fa-file-import"></i> 导入</button>') +
			'<button type="button" class="sqlmnger-link-btn" data-act="reload"><i class="fa-solid fa-rotate"></i> 刷新</button>' +
			'</div>';
		el.appendChild(hd);
		hd.querySelector('[data-role=dbname]').textContent = database;

		var searchBar = document.createElement('div');
		searchBar.className = 'sqlmnger-db-search';
		searchBar.innerHTML =
			'<label>在表中搜索</label> ' +
			'<input type="text" class="sqlmnger-input sqlmnger-db-search-inp" placeholder="表名过滤…" />';
		el.appendChild(searchBar);
		var searchInp = searchBar.querySelector('input');

		var sub = document.createElement('div');
		sub.className = 'sqlmnger-db-sub';
		sub.innerHTML = '<b>表和视图</b> <span class="muted" data-role="cnt"></span> <span class="muted" style="font-weight:400">· 点击表头可排序</span>';
		el.appendChild(sub);
		var cntEl = sub.querySelector('[data-role=cnt]');

		var tableHost = document.createElement('div');
		tableHost.className = 'sqlmnger-overview-table-wrap';
		el.appendChild(tableHost);

		// 0=name 1=engine 2=collation 3=data_length 4=index_length 5=rows_est 6=comment
		var state = {
			destroyed: false,
			tables: [],
			filter: '',
			sortCol: 0,
			sortDir: -1 // 默认倒序
		};

		function load() {
			tableHost.innerHTML = '<div class="muted" style="padding:12px">加载中…</div>';
			SqlmngerApi.post('api/db_overview.php', { database: database }).then(function (env) {
				if (state.destroyed) return;
				state.tables = (env.data && env.data.tables) || [];
				render();
			}).catch(function (err) {
				if (state.destroyed) return;
				tableHost.innerHTML = '<div class="sqlmnger-sql-exec-err">加载失败: ' + esc(errMsg(err)) + '</div>';
			});
		}

		function filtered() {
			var q = (state.filter || '').toLowerCase();
			if (!q) return state.tables.slice();
			var out = [], i, n;
			for (i = 0; i < state.tables.length; i++) {
				n = state.tables[i].name || '';
				if (String(n).toLowerCase().indexOf(q) >= 0) out.push(state.tables[i]);
			}
			return out;
		}

		function sortedList() {
			var arr = filtered();
			var col = state.sortCol;
			var dir = state.sortDir;
			arr.sort(function (a, b) {
				var va, vb;
				if (col === 0) {
					va = String(a.name || '').toLowerCase();
					vb = String(b.name || '').toLowerCase();
					if (va < vb) return -1 * dir;
					if (va > vb) return 1 * dir;
					return 0;
				}
				if (col === 1) {
					va = String(a.engine || '').toLowerCase();
					vb = String(b.engine || '').toLowerCase();
					if (va < vb) return -1 * dir;
					if (va > vb) return 1 * dir;
					return 0;
				}
				if (col === 2) {
					va = String(a.collation || '').toLowerCase();
					vb = String(b.collation || '').toLowerCase();
					if (va < vb) return -1 * dir;
					if (va > vb) return 1 * dir;
					return 0;
				}
				if (col === 6) {
					va = String(a.comment || '').toLowerCase();
					vb = String(b.comment || '').toLowerCase();
					if (va < vb) return -1 * dir;
					if (va > vb) return 1 * dir;
					return 0;
				}
				// 数值：3 data_length 4 index_length 5 rows_est
				var key = col === 3 ? 'data_length' : (col === 4 ? 'index_length' : 'rows_est');
				va = a[key] != null ? Number(a[key]) : -1;
				vb = b[key] != null ? Number(b[key]) : -1;
				if (isNaN(va)) va = -1;
				if (isNaN(vb)) vb = -1;
				return (va - vb) * dir;
			});
			return arr;
		}

		function sortMark(colIdx) {
			if (colIdx !== state.sortCol) return ' <span class="sqlmnger-th-sort">↕</span>';
			return state.sortDir === 1
				? ' <span class="sqlmnger-th-sort is-on">▲</span>'
				: ' <span class="sqlmnger-th-sort is-on">▼</span>';
		}

		function render() {
			var list = sortedList();
			if (cntEl) cntEl.textContent = '(' + list.length + (state.filter ? '/' + state.tables.length : '') + ')';

			var tbl = document.createElement('table');
			tbl.className = 'sqlmnger-overview-table';
			tbl.innerHTML =
				'<thead><tr>' +
				'<th class="c-check"></th>' +
				'<th class="sqlmnger-th-click" data-sort="0">表' + sortMark(0) + '</th>' +
				'<th class="sqlmnger-th-click" data-sort="1">引擎' + sortMark(1) + '</th>' +
				'<th class="sqlmnger-th-click" data-sort="2">校对' + sortMark(2) + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="3">数据长度' + sortMark(3) + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="4">索引长度' + sortMark(4) + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="5">行数' + sortMark(5) + '</th>' +
				'<th class="sqlmnger-th-click" data-sort="6">注释' + sortMark(6) + '</th>' +
				'</tr></thead><tbody></tbody>';
			var tb = tbl.querySelector('tbody');
			var i, row, tr, name, isView;
			for (i = 0; i < list.length; i++) {
				row = list[i];
				name = row.name || '';
				isView = row.type === 'view';
				tr = document.createElement('tr');
				tr.innerHTML =
					'<td class="c-check"><input type="checkbox" disabled /></td>' +
					'<td><a href="javascript:;" class="sqlmnger-tbl-link" data-table="' + escAttr(name) + '">' +
					esc(name) + '</a>' +
					(isView ? ' <span class="sqlmnger-badge">视图</span>' : '') +
					'</td>' +
					'<td class="muted">' + esc(row.engine || (isView ? '—' : '?')) + '</td>' +
					'<td class="muted">' + esc(row.collation || '—') + '</td>' +
					'<td class="num">' + formatSize(row.data_length) + '</td>' +
					'<td class="num">' + formatSize(row.index_length) + '</td>' +
					'<td class="num">' + (row.rows_est != null ? esc(String(row.rows_est)) : '?') + '</td>' +
					'<td class="muted">' + esc(row.comment || '') + '</td>';
				tb.appendChild(tr);
			}
			if (!list.length) {
				tr = document.createElement('tr');
				tr.innerHTML = '<td colspan="8" class="muted">' + (state.filter ? '无匹配表' : '无表') + '</td>';
				tb.appendChild(tr);
			}
			tableHost.innerHTML = '';
			tableHost.appendChild(tbl);

			tbl.querySelector('thead').onclick = function (e) {
				var th = e.target;
				while (th && th !== tbl && th.tagName !== 'TH') th = th.parentNode;
				if (!th || !th.getAttribute) return;
				var sc = th.getAttribute('data-sort');
				if (sc == null) return;
				sc = parseInt(sc, 10);
				if (isNaN(sc)) return;
				if (state.sortCol === sc) state.sortDir = -state.sortDir;
				else {
					state.sortCol = sc;
					state.sortDir = -1; // 新列默认倒序
				}
				render();
			};

			tableHost.onclick = function (e) {
				var a = e.target;
				while (a && a !== tableHost && !a.getAttribute('data-table')) a = a.parentNode;
				if (!a || !a.getAttribute) return;
				var tn = a.getAttribute('data-table');
				if (tn && onOpenTable) onOpenTable(database, tn);
			};
		}

		searchInp.oninput = function () {
			state.filter = searchInp.value || '';
			render();
		};

		hd.onclick = function (e) {
			var t = e.target;
			while (t && t !== hd && !t.getAttribute('data-act')) t = t.parentNode;
			if (!t || !t.getAttribute) return;
			var act = t.getAttribute('data-act');
			if (act === 'reload') load();
			if (act === 'export') {
				if (typeof SqlmngerDbIO !== 'undefined' && SqlmngerDbIO.openExport) {
					SqlmngerDbIO.openExport({ database: database, readonly: readonly });
				} else {
					alert('导出模块未加载');
				}
			}
			if (act === 'import') {
				if (readonly) {
					alert('只读连接无法导入');
					return;
				}
				if (typeof SqlmngerDbIO !== 'undefined' && SqlmngerDbIO.openImport) {
					SqlmngerDbIO.openImport({
						database: database,
						readonly: readonly,
						onDone: function () {
							load();
							if (onReloadTables) onReloadTables();
						}
					});
				} else {
					alert('导入模块未加载');
				}
			}
		};

		function formatSize(n) {
			if (n == null || n === '') return '?';
			n = Number(n);
			if (isNaN(n)) return '?';
			if (n === 0) return '0';
			if (n < 1024) return String(n);
			if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
			if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
			return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
		}
		function esc(s) {
			return String(s == null ? '' : s)
				.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}
		function escAttr(s) {
			return String(s == null ? '' : s)
				.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
		}
		function errMsg(err) {
			if (err && err.error && err.error.message) {
				var m = err.error.message;
				if (err.error.detail) m += ' — ' + err.error.detail;
				return m;
			}
			return String(err);
		}

		load();

		return Promise.resolve({
			el: el,
			reload: load,
			getState: function () {
				return { kind: 'database', database: database };
			},
			destroy: function () { state.destroyed = true; }
		});
	}
})();
