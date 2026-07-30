/**
 * 服务器页：选择数据库 + 权限/进程/变量/状态（仿 Adminer）
 * 库表支持点击表头单列排序
 */
window.SqlmngerServerPage = (function () {
	var t = { create: create };
	return t;

	function create(spec) {
		spec = spec || {};
		var onSelectDb = typeof spec.onSelectDb === 'function' ? spec.onSelectDb : null;
		var onCreateDb = typeof spec.onCreateDb === 'function' ? spec.onCreateDb : null;
		var readonly = !!spec.readonly;

		var el = document.createElement('div');
		el.className = 'xpg sqlmnger-server-page';
		el.style.cssText = 'overflow:auto;display:flex;flex-direction:column;height:100%;flex:1;min-height:0;padding:12px 16px;box-sizing:border-box;';

		var hd = document.createElement('div');
		hd.className = 'sqlmnger-page-hd';
		hd.innerHTML =
			'<h2 class="sqlmnger-page-title">选择数据库</h2>' +
			'<div class="sqlmnger-page-tools sqlmnger-server-tools">' +
			(readonly ? '' : '<button type="button" class="sqlmnger-link-btn" data-act="createdb"><i class="fa-solid fa-plus"></i> 创建数据库</button>') +
			'<button type="button" class="sqlmnger-link-btn" data-act="privileges"><i class="fa-solid fa-user-shield"></i> 权限</button>' +
			'<button type="button" class="sqlmnger-link-btn" data-act="processes"><i class="fa-solid fa-list"></i> 进程列表</button>' +
			'<button type="button" class="sqlmnger-link-btn" data-act="variables"><i class="fa-solid fa-sliders"></i> 变量</button>' +
			'<button type="button" class="sqlmnger-link-btn" data-act="status"><i class="fa-solid fa-heart-pulse"></i> 状态</button>' +
			'<button type="button" class="sqlmnger-link-btn" data-act="dbs"><i class="fa-solid fa-database"></i> 数据库</button>' +
			'<button type="button" class="sqlmnger-link-btn" data-act="reload"><i class="fa-solid fa-rotate"></i> 刷新</button>' +
			'</div>';
		el.appendChild(hd);

		var meta = document.createElement('div');
		meta.className = 'sqlmnger-server-meta';
		meta.textContent = '加载中…';
		el.appendChild(meta);

		var filterBar = document.createElement('div');
		filterBar.className = 'sqlmnger-db-search';
		filterBar.style.display = 'none';
		filterBar.innerHTML =
			'<label>过滤</label> ' +
			'<input type="text" class="sqlmnger-input sqlmnger-db-search-inp" placeholder="关键字…" />';
		el.appendChild(filterBar);
		var filterInp = filterBar.querySelector('input');

		var tableHost = document.createElement('div');
		tableHost.className = 'sqlmnger-overview-table-wrap';
		el.appendChild(tableHost);

		var state = {
			destroyed: false,
			view: 'dbs', // dbs | privileges | processes | variables | status
			serverData: null,
			panelData: null,
			// 库表排序：0=name 1=collation 2=table_count 3=data_size 4=index_size 5=size
			sortCol: 0,
			sortDir: -1, // 默认倒序
			// 面板表排序
			panelSortCol: 0,
			panelSortDir: -1,
			filter: ''
		};

		function setTitle(text) {
			var tEl = hd.querySelector('.sqlmnger-page-title');
			if (tEl) tEl.textContent = text;
		}

		function markToolActive() {
			var btns = hd.querySelectorAll('[data-act]');
			var i, act;
			for (i = 0; i < btns.length; i++) {
				act = btns[i].getAttribute('data-act');
				if (act === 'reload' || act === 'createdb') {
					btns[i].classList.remove('is-on');
					continue;
				}
				if (act === state.view || (act === 'dbs' && state.view === 'dbs')) {
					btns[i].classList.add('is-on');
				} else {
					btns[i].classList.remove('is-on');
				}
			}
		}

		function loadDbs() {
			state.view = 'dbs';
			setTitle('选择数据库');
			markToolActive();
			filterBar.style.display = 'none';
			meta.textContent = '加载中…';
			tableHost.innerHTML = '';
			SqlmngerApi.post('api/server_info.php', {}).then(function (env) {
				if (state.destroyed) return;
				state.serverData = env.data || {};
				renderDbs();
			}).catch(function (err) {
				if (state.destroyed) return;
				meta.textContent = '加载失败: ' + errMsg(err);
			});
		}

		function loadPanel(action) {
			state.view = action;
			markToolActive();
			filterBar.style.display = '';
			filterInp.value = state.filter || '';
			meta.textContent = '加载中…';
			tableHost.innerHTML = '<div class="muted" style="padding:12px">加载中…</div>';
			var titles = {
				privileges: '权限',
				processes: '进程列表',
				variables: '变量',
				status: '状态'
			};
			setTitle(titles[action] || action);
			SqlmngerApi.post('api/server_admin.php', { action: action }).then(function (env) {
				if (state.destroyed) return;
				state.panelData = env.data || {};
				state.panelSortCol = 0;
				state.panelSortDir = -1;
				renderPanel();
			}).catch(function (err) {
				if (state.destroyed) return;
				meta.textContent = '加载失败: ' + errMsg(err);
				tableHost.innerHTML = '<div class="sqlmnger-sql-exec-err" style="padding:12px">' + esc(errMsg(err)) + '</div>';
			});
		}

		function sortedDbs(list) {
			var arr = (list || []).slice();
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
					va = String(a.collation || a.state || '').toLowerCase();
					vb = String(b.collation || b.state || '').toLowerCase();
					if (va < vb) return -1 * dir;
					if (va > vb) return 1 * dir;
					return 0;
				}
				// 数值列：2=表 3=数据 4=索引 5=合计
				var key = col === 2 ? 'table_count'
					: (col === 3 ? 'data_size'
						: (col === 4 ? 'index_size' : 'size'));
				va = a[key] != null ? Number(a[key]) : -1;
				vb = b[key] != null ? Number(b[key]) : -1;
				if (isNaN(va)) va = -1;
				if (isNaN(vb)) vb = -1;
				return (va - vb) * dir;
			});
			return arr;
		}

		function sortMark(colIdx, activeCol, dir) {
			if (colIdx !== activeCol) return ' <span class="sqlmnger-th-sort">↕</span>';
			return dir === 1
				? ' <span class="sqlmnger-th-sort is-on">▲</span>'
				: ' <span class="sqlmnger-th-sort is-on">▼</span>';
		}

		function renderDbs() {
			var data = state.serverData || {};
			var driver = data.driver || '';
			var ver = data.version || '';
			var user = data.user || '';
			var host = data.host || '';
			var dbs = sortedDbs(data.databases || []);
			meta.innerHTML =
				'<div><b>' + esc(driverLabel(driver)) + '</b> 版本：<b>' + esc(shortVer(ver)) + '</b></div>' +
				'<div>主机：<b>' + esc(host || '—') + '</b> · 登录用户：<b>' + esc(user || '—') + '</b></div>' +
				'<div>数据库数：<b>' + dbs.length + '</b> · 点击表头可排序</div>';

			var tbl = document.createElement('table');
			tbl.className = 'sqlmnger-overview-table';
			var thName = '数据库' + sortMark(0, state.sortCol, state.sortDir);
			var thCol = '校对 / 排序规则' + sortMark(1, state.sortCol, state.sortDir);
			var thCnt = '表' + sortMark(2, state.sortCol, state.sortDir);
			var thData = '数据大小' + sortMark(3, state.sortCol, state.sortDir);
			var thIdx = '索引大小' + sortMark(4, state.sortCol, state.sortDir);
			var thSize = '大小' + sortMark(5, state.sortCol, state.sortDir);
			tbl.innerHTML =
				'<thead><tr>' +
				'<th class="c-check"></th>' +
				'<th class="sqlmnger-th-click" data-sort="0">' + thName + '</th>' +
				'<th class="sqlmnger-th-click" data-sort="1">' + thCol + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="2">' + thCnt + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="3">' + thData + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="4">' + thIdx + '</th>' +
				'<th class="sqlmnger-th-click num" data-sort="5">' + thSize + '</th>' +
				'</tr></thead><tbody></tbody>';
			var tb = tbl.querySelector('tbody');
			var i, row, tr, name;
			for (i = 0; i < dbs.length; i++) {
				row = dbs[i];
				name = row.name || '';
				tr = document.createElement('tr');
				tr.innerHTML =
					'<td class="c-check"><input type="checkbox" disabled /></td>' +
					'<td><a href="javascript:;" class="sqlmnger-db-link" data-db="' + escAttr(name) + '">' + esc(name) + '</a></td>' +
					'<td class="muted">' + esc(row.collation || row.state || '—') + '</td>' +
					'<td class="num">' + (row.table_count != null ? esc(String(row.table_count)) : '?') + '</td>' +
					'<td class="num">' + formatSize(row.data_size) + '</td>' +
					'<td class="num">' + formatSize(row.index_size) + '</td>' +
					'<td class="num">' + formatSize(row.size) + '</td>';
				tb.appendChild(tr);
			}
			if (!dbs.length) {
				tr = document.createElement('tr');
				tr.innerHTML = '<td colspan="7" class="muted">无数据库</td>';
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
				renderDbs();
			};

			tableHost.onclick = function (e) {
				var a = e.target;
				while (a && a !== tableHost && !a.getAttribute('data-db')) a = a.parentNode;
				if (!a || !a.getAttribute) return;
				var db = a.getAttribute('data-db');
				if (db && onSelectDb) onSelectDb(db);
			};
		}

		function filteredPanelRows(data) {
			var rows = (data.rows || []).slice();
			var q = (state.filter || '').toLowerCase().trim();
			if (q) {
				rows = rows.filter(function (r) {
					var j, s;
					for (j = 0; j < r.length; j++) {
						s = r[j] == null ? '' : String(r[j]);
						if (s.toLowerCase().indexOf(q) >= 0) return true;
					}
					return false;
				});
			}
			var col = state.panelSortCol;
			var dir = state.panelSortDir;
			rows.sort(function (a, b) {
				var va = a[col] == null ? '' : a[col];
				var vb = b[col] == null ? '' : b[col];
				var na = parseFloat(va), nb = parseFloat(vb);
				if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== ''
					&& /^-?\d+(\.\d+)?$/.test(String(va).trim()) && /^-?\d+(\.\d+)?$/.test(String(vb).trim())) {
					return (na - nb) * dir;
				}
				va = String(va).toLowerCase();
				vb = String(vb).toLowerCase();
				if (va < vb) return -1 * dir;
				if (va > vb) return 1 * dir;
				return 0;
			});
			return rows;
		}

		function renderPanel() {
			var data = state.panelData || {};
			var cols = data.columns || [];
			var rows = filteredPanelRows(data);
			var note = data.note || '';
			meta.innerHTML =
				'<div><b>' + esc(data.title || state.view) + '</b> · ' + rows.length + ' 行'
				+ (state.filter ? '（已过滤）' : '') + '</div>'
				+ (note ? '<div class="muted">' + esc(note) + '</div>' : '')
				+ '<div class="muted">点击表头排序</div>';

			if (!cols.length) {
				tableHost.innerHTML = '<div class="muted" style="padding:12px">无数据</div>';
				return;
			}

			var tbl = document.createElement('table');
			tbl.className = 'sqlmnger-overview-table sqlmnger-admin-table';
			var thead = document.createElement('thead');
			var thr = document.createElement('tr');
			var hi, th, killable = !!data.killable && !readonly;
			if (killable) {
				th = document.createElement('th');
				th.textContent = '';
				th.style.width = '56px';
				thr.appendChild(th);
			}
			for (hi = 0; hi < cols.length; hi++) {
				th = document.createElement('th');
				th.className = 'sqlmnger-th-click';
				th.setAttribute('data-sort', String(hi));
				th.innerHTML = esc(cols[hi]) + sortMark(hi, state.panelSortCol, state.panelSortDir);
				thr.appendChild(th);
			}
			thead.appendChild(thr);
			tbl.appendChild(thead);

			var tbody = document.createElement('tbody');
			var ri, ci, tr, td, idCol = data.id_col != null ? data.id_col : 0;
			for (ri = 0; ri < rows.length; ri++) {
				tr = document.createElement('tr');
				if (killable) {
					td = document.createElement('td');
					var kid = rows[ri][idCol];
					if (kid != null && String(kid) !== '' && /^\d+$/.test(String(kid))) {
						var btn = document.createElement('button');
						btn.type = 'button';
						btn.className = 'sqlmnger-tp-btn danger sqlmnger-kill-btn';
						btn.setAttribute('data-kill', String(kid));
						btn.innerHTML = 'KILL';
						btn.title = '终止进程 ' + kid;
						td.appendChild(btn);
					}
					tr.appendChild(td);
				}
				for (ci = 0; ci < cols.length; ci++) {
					td = document.createElement('td');
					var cell = rows[ri][ci];
					var text = cell == null ? '' : String(cell);
					if (text.length > 200 || text.indexOf('\n') >= 0) {
						td.className = 'sqlmnger-cell-pre';
						td.textContent = text;
					} else {
						td.textContent = text;
					}
					tr.appendChild(td);
				}
				tbody.appendChild(tr);
			}
			if (!rows.length) {
				tr = document.createElement('tr');
				td = document.createElement('td');
				td.colSpan = cols.length + (killable ? 1 : 0);
				td.className = 'muted';
				td.textContent = state.filter ? '无匹配行' : '无数据';
				tr.appendChild(td);
				tbody.appendChild(tr);
			}
			tbl.appendChild(tbody);
			tableHost.innerHTML = '';
			tableHost.appendChild(tbl);

			thead.onclick = function (e) {
				var th2 = e.target;
				while (th2 && th2 !== thead && th2.tagName !== 'TH') th2 = th2.parentNode;
				if (!th2 || !th2.getAttribute) return;
				var sc = th2.getAttribute('data-sort');
				if (sc == null) return;
				sc = parseInt(sc, 10);
				if (isNaN(sc)) return;
				if (state.panelSortCol === sc) state.panelSortDir = -state.panelSortDir;
				else {
					state.panelSortCol = sc;
					state.panelSortDir = -1; // 新列默认倒序
				}
				renderPanel();
			};

			if (killable) {
				tableHost.onclick = function (e) {
					var b = e.target;
					while (b && b !== tableHost && !b.getAttribute('data-kill')) b = b.parentNode;
					if (!b || !b.getAttribute) return;
					var id = b.getAttribute('data-kill');
					if (!id) return;
					var doKill = function () {
						SqlmngerApi.post('api/server_admin.php', { action: 'kill_process', id: id }).then(function () {
							if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) {
								SqlmngerUi.toast('进程 ' + id + ' 已终止', 'ok');
							}
							loadPanel('processes');
						}).catch(function (err) {
							if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) {
								SqlmngerUi.error('KILL 失败: ' + errMsg(err));
							} else {
								alert('KILL 失败: ' + errMsg(err));
							}
						});
					};
					if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.confirm) {
						SqlmngerUi.confirm('确定 KILL 进程 ' + id + '？', '确认').then(function (ok) {
							if (ok) doKill();
						});
					} else if (confirm('确定 KILL 进程 ' + id + '？')) {
						doKill();
					}
				};
			} else {
				tableHost.onclick = null;
			}
		}

		function reloadCurrent() {
			if (state.view === 'dbs') loadDbs();
			else loadPanel(state.view);
		}

		hd.onclick = function (e) {
			var tbtn = e.target;
			while (tbtn && tbtn !== hd && !tbtn.getAttribute('data-act')) tbtn = tbtn.parentNode;
			if (!tbtn || !tbtn.getAttribute) return;
			var act = tbtn.getAttribute('data-act');
			if (act === 'reload') {
				reloadCurrent();
				return;
			}
			if (act === 'dbs') {
				state.filter = '';
				loadDbs();
				return;
			}
			if (act === 'privileges' || act === 'processes' || act === 'variables' || act === 'status') {
				state.filter = filterInp.value || '';
				loadPanel(act);
				return;
			}
			if (act === 'createdb') {
				openCreateDbDialog();
			}
		};

		function uiAlert(msg, title) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.alert) return SqlmngerUi.alert(msg, title);
			window.alert(msg);
			return Promise.resolve();
		}
		function uiError(msg, title) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) return SqlmngerUi.error(msg, title);
			window.alert(msg);
			return Promise.resolve();
		}
		function uiToast(msg, kind) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) SqlmngerUi.toast(msg, kind || 'ok');
		}

		function openCreateDbDialog() {
			if (readonly) {
				uiAlert('只读连接，无法创建数据库');
				return;
			}
			var driver = (state.serverData && state.serverData.driver) || '';
			var drv = String(driver).toLowerCase();
			if (drv === 'sqlite') {
				uiAlert('SQLite 不支持创建数据库（使用文件路径连接）');
				return;
			}
			if (typeof X === 'undefined' || !X.WinMgr) {
				uiError('窗口组件未加载');
				return;
			}

			var isSqlsrv = (drv === 'sqlsrv' || drv === 'mssql' || drv === 'mssql_tcp');
			// charset → collations（下拉，不可手输）
			var MYSQL_MAP = {
				utf8mb4: ['utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin', 'utf8mb4_unicode_520_ci'],
				utf8: ['utf8_general_ci', 'utf8_unicode_ci', 'utf8_bin'],
				latin1: ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'],
				gbk: ['gbk_chinese_ci', 'gbk_bin'],
				gb18030: ['gb18030_chinese_ci', 'gb18030_bin']
			};
			var SQLSRV_COLL = [
				'Chinese_PRC_CI_AS',
				'Chinese_PRC_CS_AS',
				'Chinese_PRC_CI_AI',
				'Chinese_PRC_Stroke_CI_AS',
				'SQL_Latin1_General_CP1_CI_AS',
				'Latin1_General_CI_AS',
				'Japanese_CI_AS'
			];

			function fillSelect(sel, items, withDefaultEmpty, selected) {
				sel.innerHTML = '';
				var i, o;
				if (withDefaultEmpty) {
					o = document.createElement('option');
					o.value = '';
					o.textContent = '（服务器默认）';
					sel.appendChild(o);
				}
				for (i = 0; i < items.length; i++) {
					if (!items[i]) continue;
					o = document.createElement('option');
					o.value = items[i];
					o.textContent = items[i];
					sel.appendChild(o);
				}
				if (selected != null && selected !== '') {
					sel.value = selected;
					if (sel.value !== selected && sel.options.length) {
						// 所选不在列表时落到第一项有效值
						sel.selectedIndex = withDefaultEmpty && sel.options.length > 1 ? 1 : 0;
					}
				}
			}

			var body = document.createElement('div');
			body.className = 'sqlmnger-createdb-body';
			body.innerHTML =
				'<div class="sqlmnger-cdb-form">' +
					'<div class="sqlmnger-cdb-field">' +
						'<label for="cdb-name">数据库名</label>' +
						'<input type="text" id="cdb-name" class="sqlmnger-input cdb-name" placeholder="database_name" autocomplete="off" spellcheck="false" />' +
					'</div>' +
					(isSqlsrv ? '' :
					'<div class="sqlmnger-cdb-field cdb-charset-row">' +
						'<label for="cdb-charset">字符集</label>' +
						'<select id="cdb-charset" class="sqlmnger-select cdb-charset"></select>' +
					'</div>') +
					'<div class="sqlmnger-cdb-field">' +
						'<label for="cdb-collation">Collation</label>' +
						'<select id="cdb-collation" class="sqlmnger-select cdb-collation"></select>' +
					'</div>' +
					'<p class="sqlmnger-cdb-hint cdb-hint"></p>' +
					'<div class="sqlmnger-cdb-msg cdb-msg" role="status"></div>' +
				'</div>';

			var nameInp = body.querySelector('.cdb-name');
			var collSel = body.querySelector('.cdb-collation');
			var charsetSel = body.querySelector('.cdb-charset');
			var hintEl = body.querySelector('.cdb-hint');
			var msgEl = body.querySelector('.cdb-msg');

			if (isSqlsrv) {
				hintEl.textContent = '可选择 Collation，或「服务器默认」。';
				fillSelect(collSel, SQLSRV_COLL, true, 'Chinese_PRC_CI_AS');
			} else {
				hintEl.textContent = '建议：utf8mb4 + utf8mb4_general_ci。切换字符集会更新 Collation 列表。';
				fillSelect(charsetSel, Object.keys(MYSQL_MAP), true, 'utf8mb4');
				fillSelect(collSel, MYSQL_MAP.utf8mb4 || [], true, 'utf8mb4_general_ci');
				charsetSel.addEventListener('change', function () {
					var cs = charsetSel.value || '';
					var list = cs && MYSQL_MAP[cs] ? MYSQL_MAP[cs] : [];
					var all = [];
					var k;
					if (!cs) {
						// 服务器默认字符集：合并全部 collation 供选，或仅默认
						for (k in MYSQL_MAP) {
							if (Object.prototype.hasOwnProperty.call(MYSQL_MAP, k)) {
								all = all.concat(MYSQL_MAP[k]);
							}
						}
						fillSelect(collSel, all, true, '');
					} else {
						fillSelect(collSel, list, true, list[0] || '');
					}
				});
			}

			function setMsg(text, kind) {
				msgEl.textContent = text || '';
				msgEl.className = 'sqlmnger-cdb-msg cdb-msg' + (kind ? ' is-' + kind : '');
			}

			function doCreate(name, collation, charset, cb) {
				var payload = { name: name };
				if (collation) payload.collation = collation;
				if (charset) payload.charset = charset;
				SqlmngerApi.post('api/db_create.php', payload).then(function () {
					if (onCreateDb) onCreateDb(name);
					loadDbs();
					uiToast('数据库已创建: ' + name, 'ok');
					if (cb) cb(true);
				}).catch(function (err) {
					if (cb) cb(false, errMsg(err));
					else uiError('创建失败: ' + errMsg(err));
				});
			}

			var win = X.WinMgr.create({
				xtype: 'window',
				title: '创建数据库',
				width: 480,
				height: isSqlsrv ? 280 : 320,
				modal: true,
				toolBtns: false,
				resizable: false,
				bbar: [
					{
						xtype: 'button',
						text: '创建',
						cls: 'primary',
						handler: function () {
							var n = (nameInp.value || '').trim();
							if (!n) {
								setMsg('请填写数据库名', 'err');
								nameInp.focus();
								return;
							}
							if (!/^[A-Za-z0-9_\u0080-\uffff\-]+$/.test(n)) {
								setMsg('名称不合法（仅字母、数字、下划线等）', 'err');
								return;
							}
							var col = (collSel.value || '').trim();
							var cs = (!isSqlsrv && charsetSel) ? (charsetSel.value || '').trim() : '';
							setMsg('创建中…', 'info');
							doCreate(n, col, cs, function (ok, err) {
								if (ok) {
									setMsg('创建成功', 'ok');
									setTimeout(function () {
										try { win.close(); } catch (e) { /* */ }
									}, 250);
								} else {
									setMsg(err || '创建失败', 'err');
								}
							});
						}
					},
					{
						xtype: 'button',
						text: '取消',
						handler: function () {
							try { win.close(); } catch (e) { /* */ }
						}
					}
				]
			});
			if (win.el) {
				win.el.classList.add('sqlmnger-cdb-win');
			}
			if (win._bd) {
				win._bd.innerHTML = '';
				win._bd.appendChild(body);
				win._bd.style.overflow = 'visible';
				win._bd.style.padding = '16px 18px 8px';
			} else if (win.el) {
				var bdEl = win.el.querySelector('.xwin-bd');
				if (bdEl) {
					bdEl.innerHTML = '';
					bdEl.appendChild(body);
					bdEl.style.overflow = 'visible';
					bdEl.style.padding = '16px 18px 8px';
				}
			}
			// 底栏按钮右对齐一点间距
			if (win._bbr) {
				win._bbr.classList.add('sqlmnger-cdb-bbr');
			}
			setTimeout(function () {
				try { nameInp.focus(); nameInp.select(); } catch (e) { /* */ }
			}, 50);
		}

		filterInp.oninput = function () {
			state.filter = filterInp.value || '';
			if (state.view !== 'dbs' && state.panelData) renderPanel();
		};

		function driverLabel(d) {
			d = String(d || '').toLowerCase();
			if (d === 'mysql') return 'MySQL';
			if (d === 'sqlsrv' || d === 'mssql') return 'SQL Server (sqlsrv)';
			if (d === 'mssql_tcp') return 'SQL Server (TCP/TDS)';
			if (d === 'sqlite') return 'SQLite';
			return d || '数据库';
		}
		function shortVer(v) {
			v = String(v || '');
			if (v.length > 80) return v.slice(0, 80) + '…';
			return v;
		}
		function formatSize(n) {
			if (n == null || n === '') return '?';
			n = Number(n);
			if (isNaN(n)) return '?';
			if (n < 1024) return String(n) + ' B';
			if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
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

		loadDbs();

		return Promise.resolve({
			el: el,
			reload: reloadCurrent,
			getState: function () {
				return { kind: 'server' };
			},
			destroy: function () { state.destroyed = true; }
		});
	}
})();
