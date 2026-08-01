/**
 * 表 Tab：数据（脏标记/提交/新增/多选删除）+ 结构编辑
 * 按钮均带 Font Awesome 图标
 */
window.SqlmngerTablePage = (function () {
	var t = { create: create };
	return t;

	function _(k, vars) {
		return (window.SqlmngerI18n && SqlmngerI18n.t) ? SqlmngerI18n.t(k, vars) : k;
	}

	function create(spec) {
		var database = spec.database;
		var table = spec.table;
		var readonly = !!spec.readonly;
		var onStateChange = typeof spec.onStateChange === 'function' ? spec.onStateChange : null;
		var initial = spec.initial || {};

		var el = document.createElement('div');
		el.className = 'xpg sqlmnger-table-page';
		el.style.cssText = 'overflow:hidden;display:flex;flex-direction:column;height:100%;flex:1;min-height:0;';

		var toolbar = document.createElement('div');
		toolbar.className = 'sqlmnger-tp-toolbar';
		toolbar.innerHTML =
			'<button type="button" data-act="data" class="sqlmnger-tp-btn is-on" title="' + escAttr(_('table.data')) + '"><i class="fa-solid fa-table"></i> ' + esc(_('table.data')) + '</button>' +
			'<button type="button" data-act="struct" class="sqlmnger-tp-btn" title="' + escAttr(_('table.struct')) + '"><i class="fa-solid fa-list"></i> ' + esc(_('table.struct')) + '</button>' +
			'<button type="button" data-act="alter" class="sqlmnger-tp-btn" title="' + escAttr(_('table.alter')) + '"><i class="fa-solid fa-pen-to-square"></i> ' + esc(_('table.alter')) + '</button>' +
			'<button type="button" data-act="reload" class="sqlmnger-tp-btn" title="' + escAttr(_('table.refresh')) + '"><i class="fa-solid fa-rotate"></i> ' + esc(_('table.refresh')) + '</button>' +
			'<button type="button" data-act="edit" class="sqlmnger-tp-btn primary" style="display:none" title="' + escAttr(_('table.edit')) + '"><i class="fa-solid fa-pen"></i> ' + esc(_('table.edit')) + '</button>' +
			'<button type="button" data-act="add" class="sqlmnger-tp-btn" style="display:none" title="' + escAttr(_('table.addRow')) + '"><i class="fa-solid fa-plus"></i> ' + esc(_('table.addRow')) + '</button>' +
			'<button type="button" data-act="copy" class="sqlmnger-tp-btn" style="display:none" disabled title="' + escAttr(_('table.copy')) + '"><i class="fa-solid fa-copy"></i> ' + esc(_('table.copy')) + '</button>' +
			'<button type="button" data-act="delete" class="sqlmnger-tp-btn danger" style="display:none" disabled title="' + escAttr(_('table.delete')) + '"><i class="fa-solid fa-trash-can"></i> ' + esc(_('table.delete')) + '</button>' +
			'<button type="button" data-act="submit" class="sqlmnger-tp-btn primary" style="display:none" disabled title="' + escAttr(_('table.submit')) + '"><i class="fa-solid fa-floppy-disk"></i> ' + esc(_('table.submit')) + '</button>' +
			'<button type="button" data-act="cancel-edit" class="sqlmnger-tp-btn" style="display:none" title="' + escAttr(_('table.cancel')) + '"><i class="fa-solid fa-xmark"></i> ' + esc(_('table.cancel')) + '</button>' +
			'<span class="sqlmnger-tp-title"></span>' +
			'<span class="sqlmnger-tp-msg"></span>';
		el.appendChild(toolbar);

		// 导出控件：挂在表格底栏右下（VirtualGrid statusBar extra），不在顶栏
		var exportWrap = document.createElement('span');
		exportWrap.className = 'sqlmnger-export-wrap is-footer';
		exportWrap.setAttribute('data-export-wrap', '');
		exportWrap.title = _('table.export');
		exportWrap.innerHTML =
			'<label class="sqlmnger-export-label">' + esc(_('table.export')) + '</label>' +
			'<select class="sqlmnger-export-scope" title="' + escAttr(_('table.export')) + '">' +
				'<option value="page">' + esc(_('table.scopePage')) + '</option>' +
				'<option value="all" selected>' + esc(_('table.scopeAll')) + '</option>' +
			'</select>' +
			'<select class="sqlmnger-export-fmt" title="format">' +
				'<option value="sql">SQL</option>' +
				'<option value="csv" selected>CSV</option>' +
				'<option value="xlsx">XLSX</option>' +
				'<option value="json">JSON</option>' +
			'</select>' +
			'<span class="sqlmnger-export-dd" data-export-dd>' +
				'<button type="button" class="sqlmnger-tp-btn sqlmnger-export-toggle" data-act="export-toggle" title="' + escAttr(_('table.open')) + '">' +
					'<i class="fa-solid fa-file-export"></i> <span data-export-label>' + esc(_('table.open')) + '</span>' +
					' <i class="fa-solid fa-caret-down"></i>' +
				'</button>' +
				'<div class="sqlmnger-export-dd-menu" data-export-menu hidden>' +
					'<button type="button" data-export-mode="open" title="' + escAttr(_('table.open')) + '">' +
						'<i class="fa-solid fa-up-right-from-square"></i> ' + esc(_('table.open')) + '</button>' +
					'<button type="button" data-export-mode="save" title="' + escAttr(_('table.exportFile')) + '">' +
						'<i class="fa-solid fa-download"></i> ' + esc(_('table.exportFile')) + '</button>' +
					'<button type="button" data-export-mode="zip" title="' + escAttr(_('table.exportZip')) + '">' +
						'<i class="fa-solid fa-file-zipper"></i> ' + esc(_('table.exportZip')) + '</button>' +
				'</div>' +
			'</span>';

		// WHERE + LIMIT 一行栏（数据模式常显，无单独「过滤器」按钮）
		var whereBar = document.createElement('div');
		whereBar.className = 'sqlmnger-where-summary';
		whereBar.style.display = 'none';
		whereBar.innerHTML =
			'<span class="sqlmnger-where-summary-ico" title="WHERE"><i class="fa-solid fa-filter"></i></span>' +
			'<span class="sqlmnger-where-summary-label">WHERE</span>' +
			'<input type="text" class="sqlmnger-where-summary-inp" spellcheck="false" ' +
				'placeholder="' + escAttr(_('table.wherePh')) + '" autocomplete="off" />' +
			'<button type="button" class="sqlmnger-tp-btn primary" data-where="apply" title="' + escAttr(_('table.whereApply')) + '"><i class="fa-solid fa-check"></i> ' + esc(_('table.whereApply')) + '</button>' +
			'<button type="button" class="sqlmnger-tp-btn" data-where="clear" title="' + escAttr(_('table.whereClear')) + '"><i class="fa-solid fa-eraser"></i> ' + esc(_('table.whereClear')) + '</button>' +
			'<span class="sqlmnger-limit-wrap" title="LIMIT">' +
				'<label>' + esc(_('table.limit')) + '</label>' +
				'<select class="sqlmnger-limit-sel">' +
					'<option value="100">100</option>' +
					'<option value="500">500</option>' +
					'<option value="1000">1000</option>' +
					'<option value="2000" selected>2000</option>' +
					'<option value="5000">5000</option>' +
					'<option value="10000">10000</option>' +
					'<option value="20000">20000</option>' +
					'<option value="50000">50000</option>' +
					'<option value="100000">100000</option>' +
					'<option value="1000000">1000000</option>' +
					'<option value="0">' + esc(_('table.unlimited')) + '</option>' +
				'</select>' +
			'</span>';
		el.appendChild(whereBar);

		var body = document.createElement('div');
		body.className = 'sqlmnger-tp-body';
		el.appendChild(body);

		// 底部分页栏
		var pagerBar = document.createElement('div');
		pagerBar.className = 'sqlmnger-pager';
		pagerBar.style.display = 'none';
		pagerBar.innerHTML =
			'<span class="sqlmnger-pager-range" data-role="range">—</span>' +
			'<span class="sqlmnger-pager-nav">' +
				'<button type="button" class="sqlmnger-tp-btn" data-page="first" title="' + escAttr(_('table.pageFirst')) + '"><i class="fa-solid fa-angles-left"></i></button>' +
				'<button type="button" class="sqlmnger-tp-btn" data-page="prev" title="' + escAttr(_('table.pagePrev')) + '"><i class="fa-solid fa-angle-left"></i></button>' +
				'<span class="sqlmnger-pager-page">' +
					esc(_('table.pagerLabel')) + ' <input type="number" class="sqlmnger-pager-inp" min="1" value="1" /> '
					+ esc(_('table.pagerSlash')) + ' <em data-role="pages">1</em> ' + esc(_('table.pageUnit')) +
				'</span>' +
				'<button type="button" class="sqlmnger-tp-btn" data-page="next" title="' + escAttr(_('table.pageNext')) + '"><i class="fa-solid fa-angle-right"></i></button>' +
				'<button type="button" class="sqlmnger-tp-btn" data-page="last" title="' + escAttr(_('table.pageLast')) + '"><i class="fa-solid fa-angles-right"></i></button>' +
			'</span>';
		el.appendChild(pagerBar);

		var titleEl = toolbar.querySelector('.sqlmnger-tp-title');
		var msgEl = toolbar.querySelector('.sqlmnger-tp-msg');
		var btnEdit = toolbar.querySelector('[data-act=edit]');
		var btnSubmit = toolbar.querySelector('[data-act=submit]');
		var btnCancelEdit = toolbar.querySelector('[data-act=cancel-edit]');
		var btnAdd = toolbar.querySelector('[data-act=add]');
		var btnCopy = toolbar.querySelector('[data-act=copy]');
		var btnDelete = toolbar.querySelector('[data-act=delete]');
		var exportScope = exportWrap.querySelector('.sqlmnger-export-scope');
		var exportFmt = exportWrap.querySelector('.sqlmnger-export-fmt');
		var exportDd = exportWrap.querySelector('[data-export-dd]');
		var exportMenu = exportWrap.querySelector('[data-export-menu]');
		var exportLabel = exportWrap.querySelector('[data-export-label]');
		var btnExportToggle = exportWrap.querySelector('[data-act=export-toggle]');
		var exportMode = 'open'; // open | save
		var whereInp = whereBar.querySelector('.sqlmnger-where-summary-inp');
		var limitSel = whereBar.querySelector('.sqlmnger-limit-sel');
		var pagerRange = pagerBar.querySelector('[data-role=range]');
		var pagerPages = pagerBar.querySelector('[data-role=pages]');
		var pagerInp = pagerBar.querySelector('.sqlmnger-pager-inp');
		titleEl.textContent = database + ' . ' + table + (readonly ? _('table.readonlySuffix') : '');

		// 0 = 不限
		var LIMIT_OPTS = [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 1000000, 0];
		var state = {
			mode: 'data',
			grid: null,
			payload: null,
			orig: null,
			dirty: {},
			selected: {}, // dataIdx -> true
			destroyed: false,
			canEdit: false, // 表是否具备编辑能力（有主键且非只读）
			editMode: false, // 是否处于修改模式（默认只读浏览）
			gridCols: null, // includes select col
			pendingSort: null, // 当前服务端排序（请求 ORDER BY 的源；重载/F5 保持）
			whereClause: '', // 服务端 WHERE（不含 WHERE 关键字）
			pendingColFilters: null, // 重载后恢复列内筛选
			pageSize: 2000, // LIMIT，0=不限
			page: 1, // 1-based
			totalMatched: 0,
			pageCount: 1,
			rowFrom: 0,
			rowTo: 0,
			_applyingSort: false // setSort 恢复表头时抑制 onSortChange 再次拉数
		};
		// 从 hash 等恢复的初始状态
		if (initial.where != null && String(initial.where) !== '') {
			state.whereClause = String(initial.where);
		}
		if (initial.limit != null && initial.limit !== '') {
			var il = parseInt(initial.limit, 10);
			if (!isNaN(il) && il >= 0) state.pageSize = il;
		}
		if (initial.page != null && initial.page !== '') {
			var ip = parseInt(initial.page, 10);
			if (!isNaN(ip) && ip >= 1) state.page = ip;
		}
		if (initial.sort) {
			// 服务端排序规格：loadData 始终带上（见 keepPendingSort）
			state.pendingSort = normalizeSortSpec(initial.sort);
		}
		if (limitSel) limitSel.value = String(state.pageSize);

		function notifyState() {
			if (!onStateChange || state.destroyed) return;
			try { onStateChange(getViewState()); } catch (exN) { /* */ }
		}

		function getViewState() {
			// 服务端排序以 pendingSort 为准；grid 指示器与之一致时 live 也可
			var liveSort = captureSort();
			return {
				kind: 'table',
				database: database,
				table: table,
				mode: state.mode || 'data', // data | struct | alter
				where: state.whereClause || '',
				limit: state.pageSize,
				page: state.page || 1,
				sort: state.pendingSort || liveSort || null
			};
		}

		/** 规范化排序规格（供 API / hash / setSort） */
		function normalizeSortSpec(spec) {
			if (!spec) return null;
			var keysIn = (spec.keys && spec.keys.length) ? spec.keys : [spec];
			var keys = [], i, k, nm, dir;
			for (i = 0; i < keysIn.length; i++) {
				k = keysIn[i];
				if (!k) continue;
				nm = (k.name != null && String(k.name) !== '') ? String(k.name)
					: (k.field != null && String(k.field) !== '' && !/^\d+$/.test(String(k.field))
						? String(k.field) : '');
				if (!nm) continue;
				dir = k.dir === -1 || k.dir === '-1' ? -1 : 1;
				keys.push({ name: nm, field: nm, dir: dir });
			}
			if (!keys.length) return null;
			return {
				keys: keys,
				name: keys[0].name,
				field: keys[0].field,
				dir: keys[0].dir
			};
		}

		/** 转 API 请求体：[{name, dir}] */
		function sortSpecToApi(spec) {
			var n = normalizeSortSpec(spec);
			if (!n || !n.keys) return null;
			var out = [], i, k;
			for (i = 0; i < n.keys.length; i++) {
				k = n.keys[i];
				out.push({ name: k.name, dir: k.dir === -1 ? -1 : 1 });
			}
			return out.length ? out : null;
		}

		function sortSpecKey(spec) {
			var api = sortSpecToApi(spec);
			if (!api) return '';
			var parts = [], i;
			for (i = 0; i < api.length; i++) {
				parts.push(api[i].name + ':' + (api[i].dir === -1 ? -1 : 1));
			}
			return parts.join(',');
		}

		/** 离开数据页（结构/改表）前把列筛选写入 pending；排序已在 pendingSort */
		function stashDataViewState() {
			if (!state.grid) return;
			// 有 grid 时同步一次排序指示器（用户可能刚点了表头但未完成拉数）
			var live = captureSort();
			if (live) state.pendingSort = normalizeSortSpec(live);
			var f = captureColFilters();
			if (f && Object.keys(f).length) state.pendingColFilters = f;
			else state.pendingColFilters = null;
		}

		function hasWhere() {
			return !!(state.whereClause && String(state.whereClause).trim());
		}

		function detachExportWrap() {
			if (exportWrap && exportWrap.parentNode) {
				exportWrap.parentNode.removeChild(exportWrap);
			}
		}

		/** 将导出控件挂到当前表格底栏右下（VirtualGrid statusBar extra） */
		function mountExportOnGrid() {
			if (!exportWrap) return;
			if (state.mode !== 'data' || !state.grid) {
				detachExportWrap();
				exportWrap.style.display = 'none';
				return;
			}
			var slot = typeof state.grid.getStatusBarExtra === 'function'
				? state.grid.getStatusBarExtra()
				: null;
			if (slot) {
				if (exportWrap.parentNode !== slot) slot.appendChild(exportWrap);
				exportWrap.style.display = '';
			} else {
				// 无扩展槽时退回页内（不应常态发生）
				if (exportWrap.parentNode !== el) el.appendChild(exportWrap);
				exportWrap.style.display = '';
			}
		}

		function updateWhereUi() {
			var has = hasWhere();
			var dataMode = state.mode === 'data';
			// 数据模式始终显示 WHERE/LIMIT 栏
			whereBar.style.display = dataMode ? '' : 'none';
			if (!dataMode) {
				detachExportWrap();
				if (exportWrap) exportWrap.style.display = 'none';
			} else {
				mountExportOnGrid();
			}
			if (dataMode) {
				if (whereInp && document.activeElement !== whereInp) {
					whereInp.value = state.whereClause || '';
				}
				if (has) whereBar.classList.add('is-active');
				else whereBar.classList.remove('is-active');
			}
		}

		function updateWhereBtn() {
			updateWhereUi();
		}

		function uiConfirm(msg, title) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.confirm) {
				return SqlmngerUi.confirm(msg, title);
			}
			return Promise.resolve(!!window.confirm(msg));
		}
		function uiAlert(msg, title) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.alert) {
				return SqlmngerUi.alert(msg, title);
			}
			window.alert(msg);
			return Promise.resolve();
		}
		function uiError(msg, title) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) {
				return SqlmngerUi.error(msg, title);
			}
			window.alert(msg);
			return Promise.resolve();
		}
		function uiToast(msg, kind) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) {
				SqlmngerUi.toast(msg, kind || 'ok');
			}
		}

		/** @returns {Promise<boolean>} */
		function confirmDiscardIfDirty(msg) {
			if (!dirtyCount()) return Promise.resolve(true);
			return uiConfirm(msg || '有未提交修改，继续将丢弃修改，确定？', '确认');
		}

		function applyWhereAndReload() {
			var next = (whereInp.value || '').trim();
			// 与当前已应用条件相同且输入无变 → 仅提示
			if (next === (state.whereClause || '').trim() && state.payload) {
				setMsg(next ? '过滤器未更改' : '过滤器为空', 'info');
				return;
			}
			confirmDiscardIfDirty('有未提交修改，应用过滤器将刷新并丢弃修改，继续？').then(function (ok) {
				if (!ok) {
					whereInp.value = state.whereClause || '';
					return;
				}
				state.whereClause = next;
				state.page = 1; // 改条件回首页
				updateWhereUi();
				state.dirty = {};
				state.selected = {};
				notifyState();
				loadData({ preserveSort: true, preserveColFilters: true });
			});
		}

		function clearWhereAndReload() {
			whereInp.value = '';
			if (!state.whereClause) {
				updateWhereUi();
				setMsg('过滤器已空', 'info');
				return;
			}
			confirmDiscardIfDirty('有未提交修改，清除过滤器将刷新并丢弃修改，继续？').then(function (ok) {
				if (!ok) {
					whereInp.value = state.whereClause || '';
					return;
				}
				state.whereClause = '';
				state.page = 1;
				updateWhereUi();
				state.dirty = {};
				state.selected = {};
				notifyState();
				loadData({ preserveSort: true, preserveColFilters: true });
			});
		}

		function updatePagerUi() {
			var dataMode = state.mode === 'data';
			var pages = state.pageCount || 1;
			// 仅多于 1 页时显示翻页栏
			pagerBar.style.display = (dataMode && pages > 1) ? '' : 'none';
			if (!dataMode || pages <= 1) return;

			var total = state.totalMatched || 0;
			var from = state.rowFrom || 0;
			var to = state.rowTo || 0;
			var page = state.page || 1;
			if (page < 1) page = 1;
			if (page > pages) page = pages;

			if (pagerRange) {
				if (total <= 0) {
					pagerRange.textContent = _('table.pagerNoData');
				} else {
					pagerRange.textContent = _('table.pagerRange', { from: from, to: to, total: total });
				}
			}
			if (pagerPages) pagerPages.textContent = String(pages);
			// 输入中不打断；否则同步页码
			if (pagerInp) {
				pagerInp.max = String(pages);
				if (document.activeElement !== pagerInp) {
					pagerInp.value = String(page);
				}
			}
			if (limitSel && document.activeElement !== limitSel) {
				limitSel.value = String(state.pageSize);
			}

			var btns = pagerBar.querySelectorAll('[data-page]');
			var bi, b, act;
			for (bi = 0; bi < btns.length; bi++) {
				b = btns[bi];
				act = b.getAttribute('data-page');
				if (act === 'first' || act === 'prev') b.disabled = page <= 1;
				else if (act === 'next' || act === 'last') b.disabled = page >= pages;
			}
		}

		function goPage(page, opts) {
			opts = opts || {};
			page = parseInt(page, 10) || 1;
			var pages = state.pageCount || 1;
			if (page < 1) page = 1;
			if (page > pages) page = pages;
			if (page === state.page && state.payload) {
				updatePagerUi();
				if (opts.keepFocus && pagerInp) {
					try { pagerInp.focus(); pagerInp.select(); } catch (ex) { /* */ }
				}
				return;
			}
			confirmDiscardIfDirty('有未提交修改，翻页将丢弃修改，继续？').then(function (ok) {
				if (!ok) {
					updatePagerUi();
					if (opts.keepFocus && pagerInp) {
						try { pagerInp.focus(); pagerInp.select(); } catch (ex) { /* */ }
					}
					return;
				}
				state.page = page;
				state.dirty = {};
				state.selected = {};
				notifyState();
				// 加载后若要求保留焦点，在 loadData 完成时处理
				var loadOpts = { preserveSort: true, preserveColFilters: true };
				if (opts.keepFocus) loadOpts.keepPagerFocus = true;
				loadData(loadOpts);
			});
		}

		function changePageSize(n) {
			// 允许 0=不限
			n = parseInt(n, 10);
			if (isNaN(n) || n < 0) n = 2000;
			if (LIMIT_OPTS.indexOf(n) < 0) {
				// 自定义：0 或 1..1000000
				if (n !== 0) {
					if (n < 1) n = 1;
					if (n > 1000000) n = 1000000;
				}
			}
			if (n === state.pageSize) return;
			confirmDiscardIfDirty('有未提交修改，修改 LIMIT 将丢弃修改，继续？').then(function (ok) {
				if (!ok) {
					if (limitSel) limitSel.value = String(state.pageSize);
					return;
				}
				state.pageSize = n;
				state.page = 1;
				state.dirty = {};
				state.selected = {};
				notifyState();
				loadData({ preserveSort: true, preserveColFilters: true });
			});
		}

		whereBar.onclick = function (e) {
			var t = e.target;
			while (t && t !== whereBar && !t.getAttribute('data-where')) t = t.parentNode;
			if (!t || !t.getAttribute) return;
			var act = t.getAttribute('data-where');
			if (act === 'apply') applyWhereAndReload();
			else if (act === 'clear') clearWhereAndReload();
		};
		whereInp.onkeydown = function (e) {
			if (e.key === 'Enter' || e.keyCode === 13) {
				e.preventDefault();
				e.stopPropagation();
				applyWhereAndReload();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				whereInp.value = state.whereClause || '';
				whereInp.blur();
			}
		};
		if (limitSel) {
			limitSel.onchange = function () {
				changePageSize(limitSel.value);
			};
		}
		pagerBar.onclick = function (e) {
			var t = e.target;
			while (t && t !== pagerBar && !t.getAttribute('data-page')) t = t.parentNode;
			if (!t || !t.getAttribute) return;
			var act = t.getAttribute('data-page');
			var pages = state.pageCount || 1;
			if (act === 'first') goPage(1);
			else if (act === 'prev') goPage((state.page || 1) - 1);
			else if (act === 'next') goPage((state.page || 1) + 1);
			else if (act === 'last') goPage(pages);
		};
		pagerInp.onkeydown = function (e) {
			if (e.key === 'Enter' || e.keyCode === 13) {
				e.preventDefault();
				// 回车跳转后焦点仍留在页码框，便于连续改页
				goPage(pagerInp.value, { keepFocus: true });
			}
		};
		pagerInp.onchange = function () {
			// 失焦变更：不强制抢焦点
			goPage(pagerInp.value);
		};

		function setMsg(text, kind) {
			msgEl.textContent = text || '';
			msgEl.className = 'sqlmnger-tp-msg' + (kind ? ' is-' + kind : '');
		}

		function dirtyCount() {
			var n = 0, k, c;
			for (k in state.dirty) {
				if (!Object.prototype.hasOwnProperty.call(state.dirty, k)) continue;
				for (c in state.dirty[k].set) {
					if (Object.prototype.hasOwnProperty.call(state.dirty[k].set, c)) n++;
				}
			}
			return n;
		}

		function dirtyRowCount() {
			var n = 0, k;
			for (k in state.dirty) {
				if (Object.prototype.hasOwnProperty.call(state.dirty, k)) n++;
			}
			return n;
		}

		function selectedCount() {
			var n = 0, k;
			for (k in state.selected) {
				if (Object.prototype.hasOwnProperty.call(state.selected, k) && state.selected[k]) n++;
			}
			return n;
		}

		/** 返回勾选行 dataIdx 列表（升序） */
		function selectedIndices() {
			var list = [], k, idx;
			for (k in state.selected) {
				if (!Object.prototype.hasOwnProperty.call(state.selected, k) || !state.selected[k]) continue;
				idx = parseInt(k, 10);
				if (!isNaN(idx)) list.push(idx);
			}
			list.sort(function (a, b) { return a - b; });
			return list;
		}

		function isEditing() {
			return !!(state.canEdit && state.editMode && !readonly);
		}

		function setEditMode(on) {
			state.editMode = !!on && state.canEdit && !readonly;
			if (state.grid) {
				if (typeof state.grid.setEditable === 'function') {
					state.grid.setEditable(state.editMode);
				}
				if (!state.editMode && state.grid.cancelEdit) {
					try { state.grid.cancelEdit(); } catch (ex) { /* */ }
				}
			}
			updateDirtyUi();
		}

		function cancelEditMode() {
			if (!state.editMode) return;
			// 取消不确认：有脏数据则重载丢弃，否则直接退出
			if (dirtyCount()) {
				state.dirty = {};
				state.selected = {};
				state.editMode = false;
				loadData({ preserveSort: true, preserveColFilters: true, keepPendingSort: true });
			} else {
				setEditMode(false);
			}
			setMsg(_('table.exitEdit'), 'info');
		}

		function updateDirtyUi() {
			var n = dirtyCount();
			var rows = dirtyRowCount();
			var sel = selectedCount();
			var dataMode = state.mode === 'data';
			var can = dataMode && state.canEdit && !readonly;
			var editing = can && state.editMode;

			// 浏览：修改 + 删除（勾选行即可删）；编辑：再加 提交/取消/新增/复制
			btnEdit.style.display = can && !editing ? '' : 'none';
			btnAdd.style.display = editing ? '' : 'none';
			if (btnCopy) btnCopy.style.display = editing ? '' : 'none';
			// 删除不依赖「修改」模式：选中行即可删
			btnDelete.style.display = can ? '' : 'none';
			btnSubmit.style.display = editing ? '' : 'none';
			btnCancelEdit.style.display = editing ? '' : 'none';

			btnDelete.disabled = sel === 0;
			btnDelete.innerHTML = '<i class="fa-solid fa-trash-can"></i> '
				+ (sel ? _('table.deleteCount', { n: sel }) : _('table.delete'));
			if (btnCopy) {
				btnCopy.disabled = sel === 0;
				btnCopy.innerHTML = '<i class="fa-solid fa-copy"></i> '
					+ (sel ? _('table.copyCount', { n: sel }) : _('table.copy'));
			}
			btnSubmit.disabled = n === 0;
			btnSubmit.innerHTML = n
				? ('<i class="fa-solid fa-floppy-disk"></i> ' + _('table.submitCount', { rows: rows, cells: n }))
				: ('<i class="fa-solid fa-floppy-disk"></i> ' + _('table.submit'));
		}

		function setMode(mode) {
			// data | struct(显示结构) | alter(修改表)
			if (mode !== 'data' && mode !== 'struct' && mode !== 'alter') mode = 'data';
			// 只读连接无「修改表」
			if (mode === 'alter' && readonly) {
				setMsg(_('table.readonlyConn'), 'err');
				mode = 'struct';
			}
			state.mode = mode;
			var btns = toolbar.querySelectorAll(
				'.sqlmnger-tp-btn[data-act=data], .sqlmnger-tp-btn[data-act=struct], .sqlmnger-tp-btn[data-act=alter]'
			);
			var i;
			for (i = 0; i < btns.length; i++) {
				if (btns[i].getAttribute('data-act') === mode) btns[i].classList.add('is-on');
				else btns[i].classList.remove('is-on');
			}
			// 只读时隐藏「修改表」入口
			var btnAlter = toolbar.querySelector('[data-act=alter]');
			if (btnAlter) btnAlter.style.display = readonly ? 'none' : '';

			updateWhereUi();
			updatePagerUi();
			updateDirtyUi();
			if (mode === 'data') {
				// 无 grid 时保留 pending（从结构页切回，或 hash 初始排序）
				loadData({ preserveSort: true, preserveColFilters: true });
			} else if (mode === 'struct') {
				stashDataViewState();
				loadStructView();
			} else {
				stashDataViewState();
				loadStructAlter();
			}
			// 结构/改表/数据 同步到 URL hash
			notifyState();
		}

		// 导出下拉：挂在底栏，不走顶栏 toolbar 点击
		if (exportWrap) {
			exportWrap.onclick = function (e) {
				var tbtn = e.target;
				while (tbtn && tbtn !== exportWrap && !tbtn.getAttribute('data-act')) {
					tbtn = tbtn.parentNode;
				}
				if (!tbtn || !tbtn.getAttribute) return;
				if (tbtn.getAttribute('data-act') === 'export-toggle') {
					e.preventDefault();
					e.stopPropagation();
					toggleExportMenu();
				}
			};
		}

		toolbar.onclick = function (e) {
			var tbtn = e.target;
			while (tbtn && tbtn !== toolbar && !tbtn.getAttribute('data-act')) {
				tbtn = tbtn.parentNode;
			}
			if (!tbtn || !tbtn.getAttribute) return;
			var act = tbtn.getAttribute('data-act');
			if (act === 'data' || act === 'struct' || act === 'alter') setMode(act);
			if (act === 'reload') {
				if (state.mode === 'data') {
					var doReloadData = function () {
						state.dirty = {};
						state.selected = {};
						// 刷新保留排序与列内筛选（WHERE 始终保留）
						loadData({ preserveSort: true, preserveColFilters: true });
					};
					if (dirtyCount()) {
						uiConfirm('有未提交修改，确定刷新并丢弃？', '确认').then(function (ok) {
							if (ok) doReloadData();
						});
					} else {
						doReloadData();
					}
				} else if (state.mode === 'struct') {
					loadStructView();
				} else {
					loadStructAlter();
				}
			}
			if (act === 'edit') {
				if (!state.canEdit || readonly) {
					setMsg(_('table.cannotEdit'), 'err');
					return;
				}
				setEditMode(true);
				setMsg(_('table.editMode'), 'info');
			}
			if (act === 'submit') submitDirty();
			if (act === 'cancel-edit') cancelEditMode();
			if (act === 'add') {
				if (!isEditing()) return;
				addRow();
			}
			if (act === 'copy') {
				if (!isEditing()) return;
				copySelectedRows();
			}
			if (act === 'delete') {
				// 浏览模式也可删除选中行（无需先点「修改」）
				deleteSelected();
			}
		};

		function setExportMode(mode) {
			if (mode === 'save') exportMode = 'save';
			else if (mode === 'zip') exportMode = 'zip';
			else exportMode = 'open';
			if (exportLabel) {
				exportLabel.textContent = exportMode === 'save'
					? _('table.exportFile')
					: (exportMode === 'zip' ? _('table.exportZip') : _('table.open'));
			}
		}

		function closeExportMenu() {
			if (exportMenu) exportMenu.hidden = true;
			if (exportDd) exportDd.classList.remove('is-open');
		}

		function toggleExportMenu() {
			if (!exportMenu) return;
			var open = !!exportMenu.hidden;
			exportMenu.hidden = !open;
			if (exportDd) {
				if (open) exportDd.classList.add('is-open');
				else exportDd.classList.remove('is-open');
			}
		}

		// 下拉：打开 / 导出
		if (exportMenu) {
			exportMenu.onclick = function (e) {
				var t = e.target;
				while (t && t !== exportMenu && !t.getAttribute('data-export-mode')) {
					t = t.parentNode;
				}
				if (!t || !t.getAttribute) return;
				var mode = t.getAttribute('data-export-mode');
				if (!mode) return;
				e.preventDefault();
				e.stopPropagation();
				setExportMode(mode);
				closeExportMenu();
				doExport(mode);
			};
		}
		// 点外部关闭
		document.addEventListener('mousedown', function (e) {
			if (!exportDd || !exportMenu || exportMenu.hidden) return;
			var n = e.target;
			while (n) {
				if (n === exportDd) return;
				n = n.parentNode;
			}
			closeExportMenu();
		});

		/**
		 * 导出当前表数据
		 * @param {string} [mode] open=弹窗预览；save=下载；zip=打包 zip 下载
		 */
		function doExport(mode) {
			if (state.mode !== 'data') {
				setMsg('请先切换到数据页再导出', 'info');
				return;
			}
			if (mode !== 'save' && mode !== 'open' && mode !== 'zip') mode = exportMode;
			var fmt = exportFmt ? String(exportFmt.value || 'csv') : 'csv';
			var scope = exportScope ? String(exportScope.value || 'all') : 'all';
			if (fmt !== 'sql' && fmt !== 'csv' && fmt !== 'xlsx' && fmt !== 'json') fmt = 'csv';
			if (scope !== 'page' && scope !== 'all') scope = 'all';

			var body = {
				database: database,
				table: table,
				format: fmt,
				scope: scope,
				where: state.whereClause || ''
			};
			if (mode === 'zip') body.zip = true;
			if (scope === 'page') {
				body.limit = state.pageSize;
				body.page = state.page || 1;
			}
			// 导出与当前服务端排序一致
			var expSort = sortSpecToApi(state.pendingSort);
			if (expSort) body.sort = expSort;

			if (btnExportToggle) btnExportToggle.disabled = true;
			var tipBusy = mode === 'open' ? '生成预览…' : (mode === 'zip' ? '打包 ZIP…' : '导出中…');
			setMsg(tipBusy, 'info');

			var p = (mode === 'save' || mode === 'zip')
				? SqlmngerApi.download('api/table_export.php', body)
				: SqlmngerApi.fetchBlob('api/table_export.php', body);

			p.then(function (res) {
				var name = res && res.filename ? res.filename : (fmt.toUpperCase());
				if (mode === 'save' || mode === 'zip') {
					setMsg('已导出 ' + name, 'ok');
					uiToast((mode === 'zip' ? 'ZIP 导出成功: ' : '导出成功: ') + name, 'ok');
					return;
				}
				return openExportWindow(res, fmt).then(function (ok) {
					if (ok) {
						setMsg('已打开 ' + name, 'ok');
						uiToast('已打开预览', 'ok');
					}
				});
			}).catch(function (err) {
				var lab = mode === 'open' ? '打开' : (mode === 'zip' ? '导出zip' : '导出');
				setMsg(lab + '失败: ' + errMsg(err), 'err');
				uiError(lab + '失败: ' + errMsg(err));
			}).then(function () {
				if (btnExportToggle) btnExportToggle.disabled = false;
			});
		}

		/**
		 * 用 X.Window 弹窗展示导出内容（文本）；xlsx 提示并提供下载
		 * @returns {Promise<boolean>}
		 */
		function openExportWindow(res, fmt) {
			var filename = (res && res.filename) || 'export';
			var blob = res && res.blob;
			if (!blob) {
				return uiAlert('无内容可打开', '提示').then(function () { return false; });
			}
			if (typeof X === 'undefined' || !X.WinMgr) {
				return uiAlert('界面组件未就绪（X.WinMgr）', '提示').then(function () { return false; });
			}

			// xlsx 二进制：弹窗说明 + 下载按钮
			if (fmt === 'xlsx') {
				showExportPreviewWin({
					filename: filename,
					fmt: fmt,
					meta: database + ' . ' + table + ' · XLSX · '
						+ (typeof blob.size === 'number' ? (blob.size + ' 字节') : ''),
					text: null,
					binaryNote: 'XLSX 为二进制表格，无法在此预览文本。请点击「下载」保存后用 Excel 打开。',
					blob: blob
				});
				return Promise.resolve(true);
			}

			return readBlobAsText(blob).then(function (text) {
				var chars = text ? text.length : 0;
				showExportPreviewWin({
					filename: filename,
					fmt: fmt,
					meta: database + ' . ' + table
						+ ' · ' + String(fmt || '').toUpperCase()
						+ ' · ' + chars + ' 字符',
					text: text == null ? '' : text,
					binaryNote: null,
					blob: blob
				});
				return true;
			});
		}

		/**
		 * @param {{filename:string,fmt:string,meta:string,text:?string,binaryNote:?string,blob:Blob}} opts
		 */
		function showExportPreviewWin(opts) {
			opts = opts || {};
			var filename = opts.filename || 'export';
			var text = opts.text;
			var isBin = !!opts.binaryNote;

			var wrap = document.createElement('div');
			wrap.className = 'sqlmnger-export-preview';
			var meta = document.createElement('div');
			meta.className = 'sqlmnger-export-preview-meta';
			meta.textContent = opts.meta || '';
			wrap.appendChild(meta);

			var pre = null;
			if (isBin) {
				var note = document.createElement('div');
				note.className = 'sqlmnger-export-preview-note';
				note.textContent = opts.binaryNote;
				wrap.appendChild(note);
			} else {
				pre = document.createElement('pre');
				pre.className = 'sqlmnger-export-preview-pre';
				pre.textContent = text == null ? '' : text;
				wrap.appendChild(pre);
			}

			var win = X.WinMgr.create({
				xtype: 'window',
				title: '导出预览 · ' + filename,
				width: Math.min(920, Math.max(480, (window.innerWidth || 900) - 80)),
				height: Math.min(640, Math.max(360, (window.innerHeight || 700) - 80)),
				modal: true,
				resizable: true,
				bbar: [
					{
						xtype: 'button',
						text: '复制全部',
						handler: function () {
							if (isBin || text == null) {
								uiToast('无可复制文本', 'info');
								return;
							}
							copyTextToClipboard(text).then(function (ok) {
								if (ok) uiToast('已复制到剪贴板', 'ok');
								else uiAlert('复制失败，请手动选择文本复制', '提示');
							});
						}
					},
					{
						xtype: 'button',
						text: '下载',
						cls: 'primary',
						handler: function () {
							try {
								var a = document.createElement('a');
								var url = (window.URL || window.webkitURL).createObjectURL(opts.blob);
								a.href = url;
								a.download = filename;
								a.style.display = 'none';
								document.body.appendChild(a);
								a.click();
								setTimeout(function () {
									try {
										document.body.removeChild(a);
										(window.URL || window.webkitURL).revokeObjectURL(url);
									} catch (e2) { /* */ }
								}, 1500);
								uiToast('已开始下载 ' + filename, 'ok');
							} catch (ex) {
								uiError('下载失败: ' + (ex && ex.message ? ex.message : ex));
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

		/** @returns {Promise<boolean>} */
		function copyTextToClipboard(text) {
			text = text == null ? '' : String(text);
			if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
				return navigator.clipboard.writeText(text).then(function () {
					return true;
				}).catch(function () {
					return fallbackCopy(text);
				});
			}
			return Promise.resolve(fallbackCopy(text));
		}

		function fallbackCopy(text) {
			try {
				var ta = document.createElement('textarea');
				ta.value = text;
				ta.setAttribute('readonly', 'readonly');
				ta.style.position = 'fixed';
				ta.style.left = '-9999px';
				document.body.appendChild(ta);
				ta.select();
				var ok = document.execCommand('copy');
				document.body.removeChild(ta);
				return !!ok;
			} catch (e) {
				return false;
			}
		}

		function readBlobAsText(blob) {
			return new Promise(function (resolve) {
				if (!blob) {
					resolve('');
					return;
				}
				if (typeof blob.text === 'function') {
					blob.text().then(function (t) { resolve(String(t || '')); })
						.catch(function () { resolve(''); });
					return;
				}
				var fr = new FileReader();
				fr.onload = function () { resolve(String(fr.result || '')); };
				fr.onerror = function () { resolve(''); };
				fr.readAsText(blob);
			});
		}

		function onKeyDown(e) {
			if (state.destroyed || state.mode !== 'data') return;
			if (e.ctrlKey && (e.key === 'Enter' || e.keyCode === 13)) {
				if (!isEditing()) return;
				e.preventDefault();
				if (state.grid && state.grid.commitEdit) {
					try { state.grid.commitEdit(); } catch (ex) { /* */ }
				}
				submitDirty();
			}
			if (e.key === 'Escape' && isEditing() && !state.grid) {
				// 无单元格编辑时 Esc 退出修改模式（有编辑态时由 grid 处理）
			}
		}
		document.addEventListener('keydown', onKeyDown);

		function destroyGrid() {
			// 先拆下导出控件，避免随 grid DOM 销毁
			detachExportWrap();
			if (state.grid) {
				SqlmngerTable.destroyGrid(state.grid);
				state.grid = null;
			}
		}

		function forcePaint() {
			if (!state.grid) return;
			if (typeof state.grid.forceRender === 'function') state.grid.forceRender();
			else if (typeof state.grid.refresh === 'function') state.grid.refresh(true);
		}

		function captureSort() {
			if (state.grid && typeof state.grid.getSort === 'function') {
				return state.grid.getSort();
			}
			return null;
		}

		function applyPendingSort() {
			// 服务端排序：pending 始终保留为请求源；此处只恢复表头 ▲/▼
			var spec = normalizeSortSpec(state.pendingSort);
			if (!spec || !state.grid || typeof state.grid.setSort !== 'function') {
				return false;
			}
			state.pendingSort = spec;
			var ok = false;
			state._applyingSort = true;
			try {
				ok = !!state.grid.setSort(spec);
			} catch (ex) {
				ok = false;
			} finally {
				state._applyingSort = false;
			}
			return ok;
		}

		function captureColFilters() {
			if (state.grid && typeof state.grid.getColFilters === 'function') {
				return state.grid.getColFilters();
			}
			return null;
		}

		function applyPendingColFilters() {
			var f = state.pendingColFilters;
			state.pendingColFilters = null;
			if (!f || !state.grid || typeof state.grid.setColFilters !== 'function') return;
			try { state.grid.setColFilters(f); } catch (ex) { /* */ }
		}

		function loadData(opts) {
			opts = opts || {};
			// 服务端排序：pendingSort 为唯一请求源
			// preserveSort：有 grid 时从指示器同步（用户刚点排序时 onSortChange 已写 pending）
			if (opts.preserveSort) {
				if (state.grid) {
					var capS = captureSort();
					// 有指示器用指示器；无则保留已有 pending（勿用 null 清掉服务端排序）
					if (capS) state.pendingSort = normalizeSortSpec(capS);
				}
			} else if (opts.clearPendingSort) {
				state.pendingSort = null;
			} else if (opts.keepPendingSort) {
				// 显式保留 pending（排序变更拉数 / hash 恢复）
			}
			// 默认：保留 state.pendingSort（含 initial.sort）
			if (opts.preserveColFilters) {
				if (state.grid) {
					var capF = captureColFilters();
					if (capF && Object.keys(capF).length) state.pendingColFilters = capF;
					else if (opts.forceClearColFilters) state.pendingColFilters = null;
					else state.pendingColFilters = capF; // 有 grid 且无筛选 → null
				}
				// else：保留 pendingColFilters
			} else if (opts.keepPendingColFilters) {
				// keep
			} else if (opts.clearPendingColFilters) {
				state.pendingColFilters = null;
			}
			// 默认保留 pendingColFilters

			destroyGrid();
			body.innerHTML = '';
			var wrap = document.createElement('div');
			wrap.className = 'sqlmnger-tp-gridwrap';
			wrap.textContent = '加载数据…';
			body.appendChild(wrap);
			setMsg('加载中…', 'info');
			updateWhereBtn();
			updatePagerUi();

			// pageSize===0 表示不限，不能用 || 回退成默认
			var reqLimit = (state.pageSize === 0) ? 0
				: (state.pageSize > 0 ? state.pageSize : 2000);
			var req = {
				database: database,
				table: table,
				limit: reqLimit,
				page: state.page || 1
			};
			if (state.whereClause && String(state.whereClause).trim()) {
				req.where = String(state.whereClause).trim();
			}
			// 服务端 ORDER BY
			var apiSort = sortSpecToApi(state.pendingSort);
			if (apiSort) req.sort = apiSort;

			SqlmngerApi.post('api/table_data.php', req).then(function (env) {
				if (state.destroyed) return;
				// bindDataPayload 内会 applyPendingSort / applyPendingColFilters / notifyState
				bindDataPayload(wrap, env.data || {});
				// 重绑后同步可编辑状态（默认只读，修改模式才开）
				if (state.grid && typeof state.grid.setEditable === 'function') {
					state.grid.setEditable(isEditing());
				}
				if (opts.keepPagerFocus && pagerInp) {
					setTimeout(function () {
						try {
							pagerInp.focus();
							pagerInp.select();
						} catch (ex) { /* */ }
					}, 0);
				}
			}).catch(function (err) {
				wrap.textContent = '加载失败: ' + errMsg(err);
				setMsg(errMsg(err), 'err');
			});
		}

		function bindDataPayload(wrap, data) {
			state.payload = data;
			state.dirty = {};
			state.selected = {};
			state.orig = [];
			// 同步分页元数据（limit=0 表示不限，不可用 || 回退）
			if (data.limit != null) {
				var limSync = parseInt(data.limit, 10);
				if (!isNaN(limSync) && limSync >= 0) state.pageSize = limSync;
			}
			if (data.page != null) {
				var pgSync = parseInt(data.page, 10);
				if (!isNaN(pgSync) && pgSync >= 1) state.page = pgSync;
			}
			state.totalMatched = data.total_matched != null ? parseInt(data.total_matched, 10) : (data.total || 0);
			state.pageCount = data.page_count != null ? parseInt(data.page_count, 10) : 1;
			if (state.pageCount < 1) state.pageCount = 1;
			state.rowFrom = data.row_from != null ? parseInt(data.row_from, 10) : 0;
			state.rowTo = data.row_to != null ? parseInt(data.row_to, 10) : 0;
			if (limitSel) limitSel.value = String(state.pageSize);

			var rows = data.rows || [];
			var ri, rj, row, copy;
			for (ri = 0; ri < rows.length; ri++) {
				row = rows[ri] || [];
				copy = [];
				for (rj = 0; rj < row.length; rj++) copy[rj] = row[rj];
				state.orig[ri] = copy;
			}
			wrap.textContent = '';

			var canEdit = !readonly && !data.readonly && data.primary_key && data.primary_key.length > 0;
			state.canEdit = canEdit;
			// 无编辑能力时强制退出修改模式
			if (!canEdit) state.editMode = false;

			// 业务列
			var bizCols = (data.columns || []).slice();
			var i, c;
			for (i = 0; i < bizCols.length; i++) {
				c = bizCols[i];
				c.w = parseInt(c.w, 10) || 100;
				// field 仍指向 rows 下标
				if (c.field == null) c.field = i;
				// 表头/排序 hash 依赖 name 与 t
				if (c.name == null && c.t != null) c.name = c.t;
				if (c.t == null && c.name != null) c.t = c.name;
				if (c.is_primary) c.editable = false;
				else if (!canEdit) c.editable = false;
				else if (c.editable == null) c.editable = true;
			}

			// 多选列（field 特殊：不读 rows，用 selected）
			var selCol = {
				field: '__sel__',
				t: '',
				w: 40,
				a: 'center',
				editable: false,
				is_select: true,
				render: function (val, rowArr, dom) {
					// val 不用；通过闭包 + data-didx 在 render 后绑
					var dataIdx = arguments.length > 3 ? arguments[3] : null;
					return null; // 由下面自定义 — Grid render(val, row, null)
				}
			};

			// 包装 render：Grid 调用 col.render(val, dataArr[dataIdx], null)
			// 我们需要 dataIdx — 从当前 render 循环 dataset 拿不到。
			// 改用 getCell + 自定义：把 selected 存在 row 扩展不行（二维数组）。
			// 方案：render 函数不依赖 val，在 bind 时用闭包扫描不了 dataIdx。
			// 看 core：col.render(val, dataArr[dataIdx], null) — 第二参是整行。
			// 可在行首塞选中标记？会破坏字段。
			// 更好：render 时用 surface query — 不行。
			// 最稳：在 getCell 层对 __sel__ 返回 0/1，需要改 core getCell。
			// 不改 core：使用 fmt/render 且在 onCell click。

			// 实际 Grid getCell:
			// var f = cols[c].field; return dataArr[r][f != null ? f : c]
			// 若 field 是 '__sel__' 则 dataArr[r]['__sel__'] undefined。

			// 注入：扩展 rows 为带 _sel 属性的数组对象
			// rows 是 array，可挂属性 rows[i]._sel = 0
			// getCell: dataArr[r][f] 对数字索引；若 field 是字符串 '__sel__' 取 dataArr[r]['__sel__']
			// 对数组，dataArr[r]['__sel__'] 可作为 expando！

			for (ri = 0; ri < rows.length; ri++) {
				if (rows[ri] && typeof rows[ri] === 'object') {
					rows[ri].__sel__ = state.selected[ri] ? 1 : 0;
				}
			}

			selCol.field = '__sel__';
			selCol.editable = false;
			selCol.render = function (s, rowObj) {
				var checked = !!(rowObj && rowObj.__sel__);
				var lab = document.createElement('label');
				lab.className = 'xvr-chk';
				var inp = document.createElement('input');
				inp.type = 'checkbox';
				inp.checked = checked;
				inp.onclick = function (e) {
					if (e) e.stopPropagation();
					// 找到 dataIdx：在 rows 中定位 rowObj
					var di = -1, j;
					for (j = 0; j < rows.length; j++) {
						if (rows[j] === rowObj) { di = j; break; }
					}
					if (di < 0) return;
					rowObj.__sel__ = inp.checked ? 1 : 0;
					if (inp.checked) state.selected[di] = true;
					else delete state.selected[di];
					updateDirtyUi();
					// 刷新行 class（is-checked 背景）
					forcePaint();
				};
				lab.appendChild(inp);
				return lab;
			};

			// 表头全选：用 t 空，点击表头单独处理困难，在工具栏已有删除
			// 表头显示全选 checkbox via t as html? 仅文本。用 '☑'
			selCol.t = ' ';

			var allCols = [selCol].concat(bizCols);
			// 业务列 field 不变（0..n）；select 用 __sel__

			// getCellClass: colIdx 0 是 select；业务 colIdx = j，field 在 bizCols[j-1]
			// 默认只读；进入「修改」模式后 setEditable(true)
			var gridOpts = {
				editable: isEditing(),
				sortable: true,
				serverSort: true, // 表头排序 → onSortChange → 服务端 ORDER BY 重载
				filterRow: true, // 筛选行能力；默认隐藏，点底栏「筛选」展开
				filterRowVisible: false,
				toolbar: false, // 去掉表头下方提示条（原 toolbarText）
				// 服务端查询用时（底栏与「共 N 行 | 显示行」合并显示）
				elapsedMs: (data.elapsed_ms != null ? data.elapsed_ms
					: (data.elapsedMs != null ? data.elapsedMs : null)),
				clicksToEdit: 1,
				autoFit: true,
				minColWidth: 48,
				maxColWidth: 280,
				sampleRows: 150,
				// 斑马纹 + 勾选行高亮
				getRowClass: function (r, vp) {
					var parts = [];
					if ((vp & 1) === 1) parts.push('alt');
					if (state.selected[r] || state.selected[String(r)]
						|| (rows[r] && rows[r].__sel__)) {
						parts.push('is-checked');
					}
					return parts.join(' ');
				},
				getCellClass: function (r, cidx) {
					if (cidx === 0) return '';
					var bizIdx = cidx - 1;
					var d = state.dirty[r] || state.dirty[String(r)];
					if (d && d.cells && (d.cells[bizIdx] || d.cells[String(bizIdx)])) {
						return 'xvr-dirty';
					}
					return '';
				},
				onCellValueChange: function (rowIdx, colIdx, newVal) {
					if (!isEditing()) return;
					if (colIdx === 0) return;
					markDirty(rowIdx, colIdx - 1, newVal);
				},
				onSortChange: function (sortSpec, isEmpty) {
					// setSort 恢复表头时不重复拉数
					if (state._applyingSort || state.destroyed) return;
					var next = (isEmpty || !sortSpec) ? null : normalizeSortSpec(sortSpec);
					// 与当前服务端排序相同则只同步 hash
					if (sortSpecKey(next) === sortSpecKey(state.pendingSort)) {
						notifyState();
						return;
					}
					function doServerSortReload() {
						state.pendingSort = next;
						state.page = 1; // 改排序回首页
						state.dirty = {};
						state.selected = {};
						notifyState();
						loadData({ keepPendingSort: true, preserveColFilters: true });
					}
					if (dirtyCount()) {
						confirmDiscardIfDirty('有未提交修改，改排序将刷新并丢弃修改，继续？').then(function (ok) {
							if (!ok) {
								// 还原表头到当前 pending
								state._applyingSort = true;
								try {
									if (state.pendingSort && state.grid && state.grid.setSort) {
										state.grid.setSort(state.pendingSort);
									} else if (state.grid && state.grid.clearSort) {
										state.grid.clearSort();
									}
								} catch (exR) { /* */ }
								state._applyingSort = false;
								return;
							}
							doServerSortReload();
						});
					} else {
						doServerSortReload();
					}
				},
				// Adminer：列头悬停「=」→ 填入 WHERE「列=」并聚焦
				onHeaderWhere: function (colIdx, col) {
					if (colIdx === 0 || (col && (col.is_select || col.field === '__sel__'))) return;
					var name = '';
					if (col) {
						if (col.name != null && String(col.name) !== '') name = String(col.name);
						else if (col.t != null && String(col.t) !== '') name = String(col.t);
					}
					if (!name) return;
					// 切到数据模式（若在结构页）
					if (state.mode !== 'data') {
						setMode('data');
					}
					updateWhereUi();
					whereInp.value = name + '=';
					try {
						whereInp.focus();
						var len = whereInp.value.length;
						if (typeof whereInp.setSelectionRange === 'function') {
							whereInp.setSelectionRange(len, len);
						}
					} catch (exF) { /* */ }
				},
				// Ctrl/Cmd+点击单元格：进入修改模式，随后 Grid 会 startEdit 该格
				onCtrlClickEdit: function (/* rowIdx, colIdx */) {
					if (readonly || !state.canEdit) {
						setMsg(_('table.cannotEdit'), 'err');
						return;
					}
					if (!isEditing()) {
						setEditMode(true);
						setMsg(_('table.editModeCtrl'), 'info');
					}
				}
			};

			state.gridCols = allCols;

			try {
				state.grid = SqlmngerTable.bindGrid(wrap, {
					columns: allCols,
					rows: rows,
					total: data.total != null ? data.total : rows.length
				}, gridOpts);
				state.grid.onCellValueChange = function (rowIdx, colIdx, newVal) {
					if (!isEditing()) return;
					if (colIdx === 0) return;
					markDirty(rowIdx, colIdx - 1, newVal);
				};
				if (typeof state.grid.setEditable === 'function') {
					state.grid.setEditable(isEditing());
				}
				// 选择列不可编辑
				if (state.grid.el) {
					state.grid.el.style.flex = '1';
					state.grid.el.style.minHeight = '0';
					state.grid.el.style.height = '100%';
				}
				// 导出挂到表格右下角状态栏
				mountExportOnGrid();
				// 表头第一列加全选
				setTimeout(function () {
					var hdr0 = state.grid.el && state.grid.el.querySelector('.xvr-hdr > div');
					if (hdr0) {
						hdr0.innerHTML = '';
						var hin = document.createElement('input');
						hin.type = 'checkbox';
						hin.title = '全选';
						hin.onclick = function (e) {
							if (e) e.stopPropagation();
							var on = hin.checked;
							var j;
							for (j = 0; j < rows.length; j++) {
								if (rows[j]) rows[j].__sel__ = on ? 1 : 0;
								if (on) state.selected[j] = true;
								else delete state.selected[j];
							}
							forcePaint();
							updateDirtyUi();
						};
						hdr0.appendChild(hin);
						hdr0.style.textAlign = 'center';
					}
				}, 0);

				updateDirtyUi();
				updateWhereBtn();
				updatePagerUi();
				// 必须在 notifyState 之前恢复排序/列筛选，否则 getViewState 读到无排序的 grid
				// 会与 pending 竞争；排序 apply 成功后会 fireSortChange → notifyState
				var hadPendingSort = !!state.pendingSort;
				applyPendingSort();
				if (hadPendingSort && state.pendingSort) {
					// 列尚未完全就绪时短延迟再试
					setTimeout(function () {
						if (!state.destroyed) applyPendingSort();
					}, 30);
				}
				applyPendingColFilters();
				var wmsg = state.whereClause && String(state.whereClause).trim()
					? _('table.whereTag')
					: '';
				setMsg(
					_('table.loadedMsg', {
						from: state.rowFrom || 0,
						to: state.rowTo || 0,
						total: state.totalMatched || 0,
						page: state.page,
						pages: state.pageCount,
						where: wmsg,
						edit: canEdit ? _('table.editableTag') : ''
					}),
					'ok'
				);
				notifyState();
			} catch (err) {
				wrap.textContent = '表格渲染失败: ' + err;
				setMsg(String(err), 'err');
			}
		}

		function markDirty(bizColIdx, colIdxMaybe, newValMaybe) {
			// 兼容 (rowIdx, bizColIdx, newVal)
			var rowIdx = arguments[0];
			var bizColIdx = arguments[1];
			var newVal = arguments[2];
			var data = state.payload;
			if (!data || !data.columns || !data.columns[bizColIdx]) return;
			var colDef = data.columns[bizColIdx];
			if (colDef.is_primary) {
				setMsg('主键不可修改', 'err');
				return;
			}
			var f = colDef.field != null ? colDef.field : bizColIdx;
			var orig = state.orig && state.orig[rowIdx] ? state.orig[rowIdx][f] : undefined;
			var same = (orig === newVal) || (orig == null && (newVal === '' || newVal == null))
				|| (String(orig) === String(newVal));

			var key = rowIdx;
			if (same) {
				if (state.dirty[key]) {
					delete state.dirty[key].set[colDef.name];
					delete state.dirty[key].cells[bizColIdx];
					var empty = true, k;
					for (k in state.dirty[key].set) {
						if (Object.prototype.hasOwnProperty.call(state.dirty[key].set, k)) {
							empty = false;
							break;
						}
					}
					if (empty) delete state.dirty[key];
				}
			} else {
				var isNewRow = !!(state.payload.rows[rowIdx] && state.payload.rows[rowIdx].__isNew);
				if (!state.dirty[key]) {
					state.dirty[key] = {
						isNew: isNewRow,
						keys: isNewRow ? {} : rowKeysFromOrig(rowIdx),
						set: {},
						cells: {}
					};
				}
				state.dirty[key].isNew = isNewRow;
				if (!isNewRow) {
					state.dirty[key].keys = rowKeysFromOrig(rowIdx);
				}
				state.dirty[key].set[colDef.name] = newVal;
				state.dirty[key].cells[bizColIdx] = 1;
			}
			// 延迟重绘：等 commitEdit 的 _restoreCell 结束
			setTimeout(function () {
				if (state.destroyed) return;
				forcePaint();
				// 再直接给可见 DOM 打标，双保险
				paintDirtyDom();
			}, 0);
			updateDirtyUi();
			var n = dirtyCount();
			if (n) setMsg('已标记修改 ' + n + ' 处（未提交）', 'info');
			else setMsg('无待提交修改', 'ok');
		}

		function paintDirtyDom() {
			if (!state.grid || !state.grid.el) return;
			var spans = state.grid.el.querySelectorAll('.xvr-row > span[data-didx][data-col]');
			var i, sp, di, ci, biz, d;
			for (i = 0; i < spans.length; i++) {
				sp = spans[i];
				di = parseInt(sp.getAttribute('data-didx'), 10);
				ci = parseInt(sp.getAttribute('data-col'), 10);
				if (ci === 0) continue; // select col
				biz = ci - 1;
				d = state.dirty[di] || state.dirty[String(di)];
				if (d && d.cells && (d.cells[biz] || d.cells[String(biz)])) {
					if (sp.className.indexOf('xvr-dirty') < 0) {
						sp.className = (sp.className ? sp.className + ' ' : '') + 'xvr-dirty';
					}
				} else {
					sp.className = String(sp.className || '').replace(/\bxvr-dirty\b/g, '').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
				}
			}
		}

		function rowKeysFromOrig(rowIdx) {
			var data = state.payload;
			var pk = data.primary_key || [];
			var keys = {};
			var i, j, f;
			var row = state.orig[rowIdx];
			if (!row) return keys;
			for (i = 0; i < pk.length; i++) {
				for (j = 0; j < data.columns.length; j++) {
					if (data.columns[j].name === pk[i]) {
						f = data.columns[j].field != null ? data.columns[j].field : j;
						keys[pk[i]] = row[f];
						break;
					}
				}
			}
			return keys;
		}

		function rowKeysLive(rowIdx) {
			var data = state.payload;
			var row = data.rows[rowIdx];
			var pk = data.primary_key || [];
			var keys = {};
			var i, j, f;
			for (i = 0; i < pk.length; i++) {
				for (j = 0; j < data.columns.length; j++) {
					if (data.columns[j].name === pk[i]) {
						f = data.columns[j].field != null ? data.columns[j].field : j;
						keys[pk[i]] = row[f];
						break;
					}
				}
			}
			return keys;
		}

		function submitDirty() {
			if (!isEditing()) {
				setMsg('请先点击「修改」进入编辑模式', 'info');
				return;
			}
			if (!dirtyCount()) {
				setMsg('没有待提交的修改', 'info');
				return;
			}
			if (state.grid && state.grid.commitEdit) {
				try { state.grid.commitEdit(); } catch (ex) { /* */ }
			}
			var jobs = [];
			var rowIdx;
			for (rowIdx in state.dirty) {
				if (!Object.prototype.hasOwnProperty.call(state.dirty, rowIdx)) continue;
				(function (ri, entry) {
					var p;
					if (entry.isNew) {
						p = SqlmngerApi.post('api/table_row_insert.php', {
							database: database,
							table: table,
							set: entry.set
						});
					} else {
						p = SqlmngerApi.post('api/table_row_save.php', {
							database: database,
							table: table,
							keys: entry.keys,
							set: entry.set
						});
					}
					jobs.push(p.then(function () {
						return { ok: true, ri: ri };
					}).catch(function (err) {
						return { ok: false, ri: ri, err: err };
					}));
				})(rowIdx, state.dirty[rowIdx]);
			}
			setMsg('提交中…', 'info');
			Promise.all(jobs).then(function (results) {
				var fail = 0, ok = 0, i;
				var still = {};
				for (i = 0; i < results.length; i++) {
					if (results[i].ok) {
						ok++;
					} else {
						fail++;
						still[results[i].ri] = state.dirty[results[i].ri];
					}
				}
				state.dirty = still;
				updateDirtyUi();
				if (fail) {
					setMsg('成功 ' + ok + ' 行，失败 ' + fail + ' 行', 'err');
					uiToast('提交部分失败：成功 ' + ok + '，失败 ' + fail, 'err');
					forcePaint();
					paintDirtyDom();
				} else {
					setMsg('已提交 ' + ok + ' 行', 'ok');
					uiToast('保存成功，已提交 ' + ok + ' 行', 'ok');
					// 成功后整表刷新（拿到新主键等），保留排序与列筛选；保持修改模式
					loadData({ preserveSort: true, preserveColFilters: true });
				}
			});
		}

		function addRow() {
			if (!isEditing() || !state.payload) return;
			if (state.grid && state.grid.commitEdit) {
				try { state.grid.commitEdit(); } catch (ex) { /* */ }
			}
			// 仅本地追加空行，点「提交」才 INSERT 写库（与复制一致）
			var idx = addLocalNewRow(null, {
				msg: '已添加本地新行（未写库，编辑后点「提交」保存）'
			});
			if (idx >= 0) {
				focusGridRow(idx, firstEditableBizCol());
				setTimeout(function () {
					paintDirtyDom();
					focusGridRow(idx, firstEditableBizCol());
				}, 40);
			}
		}

		/**
		 * 本地追加新行（可带初始值）。
		 * @param {object|null} seedSet  { colName: value }，主键/自增列会被忽略
		 * @param {{focus?:boolean, msg?:string}|null} opts
		 */
		function addLocalNewRow(seedSet, opts) {
			opts = opts || {};
			var data = state.payload;
			if (!data || !data.columns) return -1;
			var cols = data.columns || [];
			var row = [];
			var i, f, c, v;
			var setMap = {};
			var cellsMap = {};

			// 保留已有 dirty（bind 会清空）
			var savedDirty = {};
			var dk;
			for (dk in state.dirty) {
				if (Object.prototype.hasOwnProperty.call(state.dirty, dk)) {
					savedDirty[dk] = state.dirty[dk];
				}
			}

			for (i = 0; i < cols.length; i++) {
				c = cols[i];
				f = c.field != null ? c.field : i;
				row[f] = null;
				// 主键 / 自增：不复制，留给库生成
				if (c.is_primary || isAutoIncCol(c)) {
					continue;
				}
				if (seedSet && Object.prototype.hasOwnProperty.call(seedSet, c.name)) {
					v = seedSet[c.name];
					row[f] = v;
					setMap[c.name] = v;
					cellsMap[i] = 1;
				}
			}
			// 无任何可写字段时，给首个非主键列空串，保证可提交
			if (!Object.keys(setMap).length) {
				for (i = 0; i < cols.length; i++) {
					if (cols[i].is_primary || isAutoIncCol(cols[i])) continue;
					f = cols[i].field != null ? cols[i].field : i;
					row[f] = '';
					setMap[cols[i].name] = '';
					cellsMap[i] = 1;
					break;
				}
			}

			row.__sel__ = 0;
			row.__isNew = 1;
			data.rows.push(row);
			data.total = (data.total != null ? data.total : data.rows.length - 1) + 1;
			var idx = data.rows.length - 1;

			var wrap = body.querySelector('.sqlmnger-tp-gridwrap');
			if (!wrap) {
				wrap = document.createElement('div');
				wrap.className = 'sqlmnger-tp-gridwrap';
				body.innerHTML = '';
				body.appendChild(wrap);
			}
			destroyGrid();
			bindDataPayload(wrap, data);

			// 恢复旧 dirty + 新行 dirty；orig 新行置空，避免 markDirty 把复制值当成“未改”
			state.dirty = savedDirty;
			state.orig[idx] = [];
			for (i = 0; i < cols.length; i++) {
				f = cols[i].field != null ? cols[i].field : i;
				state.orig[idx][f] = null;
			}
			// 确保行标记仍在（bind 可能用了数组拷贝）
			if (data.rows[idx]) {
				data.rows[idx].__isNew = 1;
				data.rows[idx].__sel__ = 1;
			}
			state.dirty[idx] = { isNew: true, keys: {}, set: setMap, cells: cellsMap };
			// 选中新行
			state.selected = {};
			state.selected[idx] = true;

			if (state.grid && typeof state.grid.setEditable === 'function') {
				state.grid.setEditable(isEditing());
			}
			updateDirtyUi();
			focusGridRow(idx, firstEditableBizCol());
			setTimeout(function () {
				paintDirtyDom();
				focusGridRow(idx, firstEditableBizCol());
			}, 30);

			if (opts.msg) setMsg(opts.msg, 'info');
			else setMsg('已添加本地新行，编辑后点提交', 'info');
			return idx;
		}

		function isAutoIncCol(c) {
			if (!c) return false;
			var ex = String(c.extra || '').toLowerCase();
			if (ex.indexOf('auto_increment') >= 0) return true;
			// SQL Server identity 等若有 extra 标记
			if (ex.indexOf('identity') >= 0) return true;
			return false;
		}

		function firstEditableBizCol() {
			var cols = (state.payload && state.payload.columns) || [];
			var i;
			for (i = 0; i < cols.length; i++) {
				if (!cols[i].is_primary && !isAutoIncCol(cols[i])) return i;
			}
			return 0;
		}

		/** 滚动并选中行；bizCol 为业务列下标（不含多选列） */
		function focusGridRow(dataIdx, bizCol) {
			if (!state.grid) return;
			var col = (bizCol != null ? bizCol : 0) + 1; // +1 跳过多选列
			try {
				if (typeof state.grid.scrollTo === 'function') state.grid.scrollTo(dataIdx);
				if (typeof state.grid.setSelection === 'function') state.grid.setSelection(dataIdx, col);
			} catch (ex) { /* */ }
		}

		/**
		 * 复制勾选行 → 本地新行（可多选，按顺序各复制一条），定位到最后一条新行
		 */
		function copySelectedRows() {
			if (!isEditing() || !state.payload) {
				setMsg('请先进入修改模式', 'info');
				return;
			}
			if (state.grid && state.grid.commitEdit) {
				try { state.grid.commitEdit(); } catch (ex) { /* */ }
			}
			var idxs = selectedIndices();
			if (!idxs.length) {
				setMsg('请先勾选要复制的行', 'info');
				return;
			}
			var data = state.payload;
			var cols = data.columns || [];
			var n = 0;
			var lastIdx = -1;
			var si, srcIdx, srcRow, seed, i, c, f, val;

			// 先收集所有 seed（源行在追加前下标稳定）
			var seeds = [];
			for (si = 0; si < idxs.length; si++) {
				srcIdx = idxs[si];
				srcRow = data.rows[srcIdx];
				if (!srcRow) continue;
				seed = {};
				for (i = 0; i < cols.length; i++) {
					c = cols[i];
					if (c.is_primary || isAutoIncCol(c)) continue;
					f = c.field != null ? c.field : i;
					// 优先 live 行，其次 orig
					val = srcRow[f];
					if (val === undefined && state.orig[srcIdx]) val = state.orig[srcIdx][f];
					// 合并未提交的 dirty
					if (state.dirty[srcIdx] && state.dirty[srcIdx].set
						&& Object.prototype.hasOwnProperty.call(state.dirty[srcIdx].set, c.name)) {
						val = state.dirty[srcIdx].set[c.name];
					}
					seed[c.name] = val;
				}
				seeds.push(seed);
			}
			if (!seeds.length) {
				setMsg('无法复制选中行', 'err');
				return;
			}

			// 逐条追加本地行（内部会 rebind；为效率：只 rebind 一次）
			lastIdx = appendLocalNewRows(seeds);
			n = seeds.length;
			if (lastIdx < 0) {
				setMsg('复制失败', 'err');
				return;
			}
			setMsg('已复制 ' + n + ' 行到末尾（本地新行，提交后写库）', 'ok');
			focusGridRow(lastIdx, firstEditableBizCol());
			setTimeout(function () {
				paintDirtyDom();
				focusGridRow(lastIdx, firstEditableBizCol());
			}, 40);
		}

		/** 一次重绑追加多条本地新行，返回最后一行 dataIdx */
		function appendLocalNewRows(seeds) {
			var data = state.payload;
			if (!data || !seeds || !seeds.length) return -1;
			var cols = data.columns || [];
			var savedDirty = {};
			var dk, i, s, row, f, c, v, idx0, idx, setMap, cellsMap, firstNew;

			for (dk in state.dirty) {
				if (Object.prototype.hasOwnProperty.call(state.dirty, dk)) {
					savedDirty[dk] = state.dirty[dk];
				}
			}

			firstNew = data.rows.length;
			for (s = 0; s < seeds.length; s++) {
				row = [];
				setMap = {};
				cellsMap = {};
				for (i = 0; i < cols.length; i++) {
					c = cols[i];
					f = c.field != null ? c.field : i;
					row[f] = null;
					if (c.is_primary || isAutoIncCol(c)) continue;
					if (seeds[s] && Object.prototype.hasOwnProperty.call(seeds[s], c.name)) {
						v = seeds[s][c.name];
						row[f] = v;
						setMap[c.name] = v;
						cellsMap[i] = 1;
					}
				}
				if (!Object.keys(setMap).length) {
					for (i = 0; i < cols.length; i++) {
						if (cols[i].is_primary || isAutoIncCol(cols[i])) continue;
						f = cols[i].field != null ? cols[i].field : i;
						row[f] = '';
						setMap[cols[i].name] = '';
						cellsMap[i] = 1;
						break;
					}
				}
				row.__sel__ = 0;
				row.__isNew = 1;
				data.rows.push(row);
				// 暂存 dirty 到 savedDirty 用未来下标
				idx = firstNew + s;
				savedDirty[idx] = { isNew: true, keys: {}, set: setMap, cells: cellsMap };
			}
			data.total = (data.total != null ? Number(data.total) : firstNew) + seeds.length;

			var wrap = body.querySelector('.sqlmnger-tp-gridwrap');
			if (!wrap) {
				wrap = document.createElement('div');
				wrap.className = 'sqlmnger-tp-gridwrap';
				body.innerHTML = '';
				body.appendChild(wrap);
			}
			destroyGrid();
			bindDataPayload(wrap, data);

			// 恢复 dirty；新行 orig 全 null
			state.dirty = savedDirty;
			state.selected = {};
			for (s = 0; s < seeds.length; s++) {
				idx = firstNew + s;
				state.orig[idx] = [];
				for (i = 0; i < cols.length; i++) {
					f = cols[i].field != null ? cols[i].field : i;
					state.orig[idx][f] = null;
				}
				if (data.rows[idx]) {
					data.rows[idx].__isNew = 1;
					data.rows[idx].__sel__ = (s === seeds.length - 1) ? 1 : 0;
				}
				if (s === seeds.length - 1) state.selected[idx] = true;
			}

			if (state.grid && typeof state.grid.setEditable === 'function') {
				state.grid.setEditable(isEditing());
			}
			updateDirtyUi();
			return firstNew + seeds.length - 1;
		}

		function isLocalNewRow(idx) {
			var row = state.payload && state.payload.rows ? state.payload.rows[idx] : null;
			if (row && row.__isNew) return true;
			var d = state.dirty[idx] || state.dirty[String(idx)];
			return !!(d && d.isNew);
		}

		/**
		 * 移除指定下标的本地行（不写库），重映射 dirty；返回移除条数
		 */
		function removeLocalRowsByIdx(removeSet) {
			if (!state.payload || !state.payload.rows) return 0;
			var oldRows = state.payload.rows;
			var newRows = [], newOrig = [], newDirty = {};
			var j, ni = 0, removed = 0, d, f, i, cols;
			for (j = 0; j < oldRows.length; j++) {
				if (removeSet[j] || removeSet[String(j)]) {
					removed++;
					continue;
				}
				newRows.push(oldRows[j]);
				newOrig.push(state.orig ? state.orig[j] : null);
				d = state.dirty[j] || state.dirty[String(j)];
				if (d) newDirty[ni] = d;
				ni++;
			}
			if (!removed) return 0;
			state.payload.rows = newRows;
			if (state.payload.total != null) {
				state.payload.total = Math.max(0, Number(state.payload.total) - removed);
			} else {
				state.payload.total = newRows.length;
			}
			state.orig = newOrig;
			state.dirty = newDirty;
			state.selected = {};
			// 保持 __isNew 标记
			for (j = 0; j < newRows.length; j++) {
				if (newDirty[j] && newDirty[j].isNew && newRows[j]) {
					newRows[j].__isNew = 1;
				}
			}
			var wrap = body.querySelector('.sqlmnger-tp-gridwrap');
			if (!wrap) return removed;
			// 保存 editMode，bind 会保留 payload
			var keepEdit = state.editMode;
			destroyGrid();
			bindDataPayload(wrap, state.payload);
			state.dirty = newDirty;
			// bind 用行内容填 orig；本地新行 orig 再置空
			for (j = 0; j < newRows.length; j++) {
				if (newDirty[j] && newDirty[j].isNew) {
					cols = state.payload.columns || [];
					state.orig[j] = [];
					for (i = 0; i < cols.length; i++) {
						f = cols[i].field != null ? cols[i].field : i;
						state.orig[j][f] = null;
					}
					if (newRows[j]) newRows[j].__isNew = 1;
				}
			}
			state.editMode = keepEdit;
			if (state.grid && typeof state.grid.setEditable === 'function') {
				state.grid.setEditable(isEditing());
			}
			updateDirtyUi();
			setTimeout(function () { paintDirtyDom(); }, 20);
			return removed;
		}

		function deleteSelected() {
			if (!state.canEdit || readonly) {
				setMsg('当前表不可删除（无主键或只读连接）', 'err');
				return;
			}
			if (state.mode !== 'data') return;
			var idxs = selectedIndices();
			if (!idxs.length) {
				setMsg('请先勾选要删除的行', 'info');
				return;
			}

			var removeLocal = {};
			var keysList = [];
			var i, idx, localN = 0, serverN = 0;
			for (i = 0; i < idxs.length; i++) {
				idx = idxs[i];
				if (isLocalNewRow(idx)) {
					removeLocal[idx] = true;
					localN++;
				} else {
					keysList.push(rowKeysLive(idx));
					serverN++;
				}
			}

			// 仅未提交的本地新行：直接移除，不确认
			if (serverN < 1) {
				var n1 = removeLocalRowsByIdx(removeLocal);
				setMsg('已移除 ' + n1 + ' 条未提交新行', 'ok');
				return;
			}

			// 含已落库行：需确认写库删除
			var tip = '确定删除选中的 ' + serverN + ' 行？此操作直接写库，不可撤销。';
			if (localN > 0) {
				tip = '将删除 ' + serverN + ' 条已有行（写库），并移除 ' + localN + ' 条未提交新行。确定？';
			}
			uiConfirm(tip, '确认删除').then(function (ok) {
				if (!ok) return;
				// 先去掉本地新行（无确认路径已处理；此处与库删除一起）
				if (localN > 0) removeLocalRowsByIdx(removeLocal);

				setMsg('删除中…', 'info');
				SqlmngerApi.post('api/table_row_delete.php', {
					database: database,
					table: table,
					keys_list: keysList
				}).then(function (env) {
					var nDel = env.data && env.data.affected;
					setMsg('已删除 ' + nDel + ' 行'
						+ (localN ? '（另移除 ' + localN + ' 条本地新行）' : ''), 'ok');
					uiToast('删除成功' + (nDel != null ? '（' + nDel + ' 行）' : ''), 'ok');
					state.dirty = {};
					state.selected = {};
					loadData({ preserveSort: true, preserveColFilters: true });
				}).catch(function (err) {
					setMsg('删除失败: ' + errMsg(err), 'err');
					uiError('删除失败: ' + errMsg(err));
				});
			});
		}

		/** 拉取结构 JSON */
		function fetchStructure() {
			return SqlmngerApi.post('api/table_structure.php', {
				database: database,
				table: table
			});
		}

		/** 显示结构：紧凑只读（仿 Adminer） */
		function loadStructView() {
			destroyGrid();
			body.innerHTML = '';
			var box = document.createElement('div');
			box.className = 'sqlmnger-struct sqlmnger-struct-view';
			box.textContent = '加载结构…';
			body.appendChild(box);
			setMsg('加载结构…', 'info');

			fetchStructure().then(function (env) {
				if (state.destroyed) return;
				renderStructView(box, env.data || {});
				setMsg('结构已加载', 'ok');
			}).catch(function (err) {
				box.textContent = '加载失败: ' + errMsg(err);
				setMsg(errMsg(err), 'err');
			});
		}

		/** 修改表：可编辑列 / 索引 */
		function loadStructAlter() {
			destroyGrid();
			body.innerHTML = '';
			var box = document.createElement('div');
			box.className = 'sqlmnger-struct sqlmnger-struct-alter';
			box.textContent = '加载结构…';
			body.appendChild(box);
			setMsg('加载结构…', 'info');

			fetchStructure().then(function (env) {
				if (state.destroyed) return;
				renderStructAlter(box, env.data || {});
				setMsg('可修改列与索引', 'ok');
			}).catch(function (err) {
				box.textContent = '加载失败: ' + errMsg(err);
				setMsg(errMsg(err), 'err');
			});
		}

		function formatTypeExtra(c) {
			var t = String(c.type || '');
			var extra = String(c.extra || '').toLowerCase();
			var bits = [];
			if (extra.indexOf('auto_increment') >= 0 || extra.indexOf('identity') >= 0) {
				bits.push(extra.indexOf('identity') >= 0 ? 'IDENTITY' : '自动增量');
			}
			if (!c.nullable) bits.push('非空');
			if (!bits.length) return esc(t);
			return esc(t) + ' <span class="sqlmnger-type-extra">' + esc(bits.join(' · ')) + '</span>';
		}

		/** 结构页展示默认值（字符串带引号，与改表一致） */
		function formatDefaultDisplay(c) {
			if (!c) return '';
			var d = c.default;
			if (d === null || d === undefined || d === '') return '';
			var s = String(d);
			if (s.toUpperCase() === 'NULL') return 'NULL';
			if (/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return s;
			if (/^[A-Za-z_][A-Za-z0-9_]*(\(\))?$/.test(s)) return s;
			if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s;
			return "'" + s.replace(/'/g, "''") + "'";
		}

		function fallbackCopy(text) {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			try {
				document.execCommand('copy');
				setMsg('已复制表定义', 'ok');
			} catch (e) {
				setMsg('复制失败', 'err');
			}
			try { document.body.removeChild(ta); } catch (e2) { /* */ }
		}

		/** 打开 SQL 命令 Tab 并预填 CREATE 定义（注释形式，避免误执行） */
		function openCreateInSql(createSql) {
			var sql = '-- ' + database + '.' + table + ' definition\n' + String(createSql || '') + '\n';
			if (window.SqlmngerApp && typeof SqlmngerApp.openSqlConsole === 'function') {
				try {
					SqlmngerApp.openSqlConsole(sql);
					setMsg('已在 SQL 命令中打开表定义', 'ok');
					return;
				} catch (e) { /* fallthrough */ }
			}
			// 回退：复制
			fallbackCopy(sql);
			setMsg('已复制表定义（无法打开 SQL 页）', 'info');
		}

		/**
		 * 索引类型：主键 / 唯一索引 / 普通；非索引为空
		 * @returns {{ yes:boolean, label:string }}
		 */
		function indexInfoForColumn(c, indexedCols) {
			if (!c) return { yes: false, label: '' };
			if (c.is_primary || c.key === 'PRI') {
				return { yes: true, label: '主键' };
			}
			if (c.key === 'UNI') {
				return { yes: true, label: '唯一索引' };
			}
			if (c.key === 'MUL') {
				return { yes: true, label: '普通' };
			}
			var nm = String(c.name || '');
			if (indexedCols && indexedCols[nm]) {
				if (indexedCols[nm] === 'primary') return { yes: true, label: '主键' };
				if (indexedCols[nm] === 'unique') return { yes: true, label: '唯一索引' };
				return { yes: true, label: '普通' };
			}
			return { yes: false, label: '' };
		}

		function buildIndexedColMap(indexes) {
			var map = {}, i, ix, j, col, kind;
			indexes = indexes || [];
			for (i = 0; i < indexes.length; i++) {
				ix = indexes[i];
				if (!ix || !ix.columns) continue;
				kind = ix.primary ? 'primary' : (ix.unique ? 'unique' : 'index');
				for (j = 0; j < ix.columns.length; j++) {
					col = String(ix.columns[j] || '');
					if (!col) continue;
					// primary > unique > index
					if (kind === 'primary' || !map[col] || (kind === 'unique' && map[col] === 'index')) {
						map[col] = kind;
					}
				}
			}
			return map;
		}

		function renderStructView(box, st) {
			box.innerHTML = '';
			// 页头：表名（模式切换用顶部工具栏）
			var hd = document.createElement('div');
			hd.className = 'sqlmnger-struct-hd';
			hd.innerHTML = '<h2 class="sqlmnger-struct-title">表: <b></b></h2>';
			hd.querySelector('b').textContent = table;
			box.appendChild(hd);

			// 列 — 列 | 类型 | 默认值 | 索引 | 注释
			var h2 = document.createElement('h3');
			h2.className = 'sqlmnger-struct-sec';
			h2.textContent = '列';
			box.appendChild(h2);

			var indexes = st.indexes || [];
			var indexedCols = buildIndexedColMap(indexes);

			var tbl = document.createElement('table');
			tbl.className = 'sqlmnger-struct-table sqlmnger-struct-compact';
			tbl.innerHTML =
				'<thead><tr>' +
				'<th class="c-name">列</th>' +
				'<th class="c-type">类型</th>' +
				'<th class="c-def">默认值</th>' +
				'<th class="c-idx-flag">索引</th>' +
				'<th class="c-cmt">注释</th>' +
				'</tr></thead>';
			var tb = document.createElement('tbody');
			var cols = st.columns || [];
			var i, c, tr, typeHtml, nameCell, defDisp, idxInfo, idxHtml;
			for (i = 0; i < cols.length; i++) {
				c = cols[i];
				tr = document.createElement('tr');
				if (c.is_primary) tr.className = 'is-pk';
				nameCell = '<td class="c-name"><b>' + esc(c.name) + '</b>';
				if (c.is_primary) nameCell += ' <span class="pk">PK</span>';
				nameCell += '</td>';
				typeHtml = formatTypeExtra(c);
				defDisp = formatDefaultDisplay(c);
				idxInfo = indexInfoForColumn(c, indexedCols);
				if (idxInfo.yes && idxInfo.label) {
					idxHtml = '<span class="sqlmnger-idx-yes">' + esc(idxInfo.label) + '</span>';
				} else {
					idxHtml = '';
				}
				tr.innerHTML =
					nameCell +
					'<td class="c-type">' + typeHtml + '</td>' +
					'<td class="c-def muted">' + esc(defDisp) + '</td>' +
					'<td class="c-idx-flag c-center">' + idxHtml + '</td>' +
					'<td class="c-cmt muted">' + esc(c.comment || '') + '</td>';
				tb.appendChild(tr);
			}
			if (!cols.length) {
				tr = document.createElement('tr');
				tr.innerHTML = '<td colspan="5" class="muted">无列</td>';
				tb.appendChild(tr);
			}
			tbl.appendChild(tb);
			box.appendChild(tbl);

			// 索引 — 紧凑：名称 + 列
			var h3 = document.createElement('h3');
			h3.className = 'sqlmnger-struct-sec';
			h3.textContent = '索引';
			box.appendChild(h3);

			if (!indexes.length) {
				var empty = document.createElement('div');
				empty.className = 'sqlmnger-struct-note';
				empty.textContent = '无索引';
				box.appendChild(empty);
			} else {
				var itbl = document.createElement('table');
				itbl.className = 'sqlmnger-struct-table sqlmnger-struct-compact sqlmnger-struct-idx';
				itbl.innerHTML =
					'<thead><tr><th>索引</th><th>列</th><th>类型</th></tr></thead>';
				var itb = document.createElement('tbody');
				for (i = 0; i < indexes.length; i++) {
					(function (ix) {
						var r = document.createElement('tr');
						var lab = esc(ix.name || '');
						if (ix.primary) lab = '<span class="pk-idx">PRIMARY</span>';
						else if (ix.unique) lab = '<b>' + lab + '</b> <span class="sqlmnger-badge">UNIQUE</span>';
						r.innerHTML =
							'<td class="c-name">' + lab + '</td>' +
							'<td><i>' + esc((ix.columns || []).join(', ')) + '</i></td>' +
							'<td class="muted">' + esc(ix.type || (ix.primary ? 'PRIMARY' : (ix.unique ? 'UNIQUE' : 'INDEX'))) + '</td>';
						itb.appendChild(r);
					})(indexes[i]);
				}
				itbl.appendChild(itb);
				box.appendChild(itbl);
			}

			// CREATE TABLE / DDL（MySQL: SHOW CREATE TABLE；SQLite: sqlite_master；SQL Server 尽力）
			var createSql = st.create_sql || st.createSql || '';
			if (createSql) {
				var hDdl = document.createElement('h3');
				hDdl.className = 'sqlmnger-struct-sec';
				hDdl.innerHTML = '<i class="fa-solid fa-code"></i> 表定义 '
					+ '<span class="sqlmnger-struct-note">SHOW CREATE / DDL</span>';
				box.appendChild(hDdl);
				var ddlWrap = document.createElement('div');
				ddlWrap.className = 'sqlmnger-struct-ddl';
				ddlWrap.innerHTML =
					'<div class="sqlmnger-struct-ddl-bar">' +
						'<button type="button" class="sqlmnger-tp-btn" data-ddl="copy" title="复制">' +
							'<i class="fa-solid fa-copy"></i> 复制</button>' +
						'<button type="button" class="sqlmnger-tp-btn" data-ddl="sql" title="在 SQL 命令中打开">' +
							'<i class="fa-solid fa-terminal"></i> 打开 SQL</button>' +
					'</div>' +
					'<pre class="sqlmnger-struct-ddl-pre"></pre>';
				ddlWrap.querySelector('.sqlmnger-struct-ddl-pre').textContent = createSql;
				ddlWrap.onclick = function (e) {
					var t = e.target;
					while (t && t !== ddlWrap && !(t.getAttribute && t.getAttribute('data-ddl'))) {
						t = t.parentNode;
					}
					if (!t || !t.getAttribute) return;
					var act = t.getAttribute('data-ddl');
					if (act === 'copy') {
						try {
							if (navigator.clipboard && navigator.clipboard.writeText) {
								navigator.clipboard.writeText(createSql).then(function () {
									setMsg('已复制表定义', 'ok');
								}).catch(function () {
									fallbackCopy(createSql);
								});
							} else {
								fallbackCopy(createSql);
							}
						} catch (ex) {
							fallbackCopy(createSql);
						}
					} else if (act === 'sql') {
						openCreateInSql(createSql);
					}
				};
				box.appendChild(ddlWrap);
			}

			// 底部操作
			var foot = document.createElement('div');
			foot.className = 'sqlmnger-struct-foot';
			if (!readonly) {
				foot.innerHTML =
					'<button type="button" class="sqlmnger-link-btn" data-go="alter"><i class="fa-solid fa-pen-to-square"></i> 修改表</button>';
				foot.onclick = function (e) {
					var t = e.target;
					while (t && t !== foot && !t.getAttribute('data-go')) t = t.parentNode;
					if (t && t.getAttribute && t.getAttribute('data-go') === 'alter') setMode('alter');
				};
			}
			box.appendChild(foot);
		}

		/**
		 * 修改表：本地草稿（增删改 + 拖拽排序），点「提交结构」一次性写库
		 */
		function renderStructAlter(box, st) {
			box.innerHTML = '';
			var hd = document.createElement('div');
			hd.className = 'sqlmnger-struct-hd';
			hd.innerHTML = '<h2 class="sqlmnger-struct-title">修改表: <b></b></h2>';
			hd.querySelector('b').textContent = table;
			box.appendChild(hd);

			// ── 本地草稿 ──
			var uidSeq = 1;
			var draft = {
				// base* 为加载时基准，用于行级「已修改」标记
				// { uid, origName, name, type, nullable, default, comment, key, extra, isPrimary, isNew, baseName, baseType, ... }
				cols: [],
				drops: [],
				origSnap: '',
				// 原列顺序（origName 列表，用于顺序变更标记）
				origOrder: []
			};
			/**
			 * 默认值 UI 约定（与 NULL / 函数区分）：
			 * - 字符串：带单引号，如 '1970-01-01 00:00:00'
			 * - 数字 / 函数 / NULL：不带引号
			 * 库返回的是裸值，展示时转成带引号；提交时再剥掉引号交给后端加 DEFAULT。
			 */
			function isDefaultNumber(s) {
				return /^-?[0-9]+(\.[0-9]+)?$/.test(s);
			}
			function isDefaultFunction(s) {
				// CURRENT_TIMESTAMP / NOW() / GETDATE() 等
				return /^[A-Za-z_][A-Za-z0-9_]*(\(\))?$/.test(s);
			}
			function formatDefaultForUi(raw) {
				if (raw == null || raw === '') return '';
				var s = String(raw);
				if (s.toUpperCase() === 'NULL') return 'NULL';
				if (isDefaultNumber(s) || isDefaultFunction(s)) return s;
				// 已是 '...' 形式
				if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") return s;
				return "'" + s.replace(/'/g, "''") + "'";
			}
			/** UI 值 → 交给 API 的裸值（字符串去掉外层引号） */
			function parseDefaultFromUi(ui) {
				if (ui == null) return '';
				var s = String(ui).trim();
				if (s === '' || s === '(空)') return '';
				if (s.toUpperCase() === 'NULL') return 'NULL';
				if (isDefaultNumber(s) || isDefaultFunction(s)) return s;
				if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
					return s.slice(1, -1).replace(/''/g, "'");
				}
				// 用户手输未加引号的字符串：仍当字符串内容
				return s;
			}

			var srcCols = st.columns || [];
			var i, c;
			for (i = 0; i < srcCols.length; i++) {
				c = srcCols[i];
				draft.cols.push(makeColDraft({
					origName: c.name,
					name: c.name,
					type: c.type || '',
					nullable: !!c.nullable,
					default: formatDefaultForUi(c.default != null ? String(c.default) : ''),
					comment: c.comment || '',
					key: c.key || '',
					extra: c.extra || '',
					isPrimary: !!c.is_primary,
					isNew: false
				}));
				draft.origOrder.push(c.name);
			}
			draft.origSnap = snapDraft();

			function makeColDraft(o) {
				var name = o.name || '';
				var type = o.type || 'varchar(50)';
				var nullable = o.nullable !== false;
				// 新建默认空；已有列传入的 default 应为 UI 形态
				var def = o.default != null ? String(o.default) : '';
				var comment = o.comment || '';
				return {
					uid: 'c' + (uidSeq++),
					origName: o.origName || '',
					name: name,
					type: type,
					nullable: nullable,
					default: def,
					comment: comment,
					key: o.key || '',
					extra: o.extra || '',
					isPrimary: !!o.isPrimary,
					isNew: !!o.isNew,
					// 基准（新建列以空基准，始终算「新」）
					baseName: o.isNew ? null : name,
					baseType: o.isNew ? null : type,
					baseNullable: o.isNew ? null : nullable,
					baseDefault: o.isNew ? null : def,
					baseComment: o.isNew ? null : comment
				};
			}

			function snapDraft() {
				return JSON.stringify({
					cols: draft.cols.map(function (x) {
						return {
							origName: x.origName, name: x.name, type: x.type,
							nullable: x.nullable, default: x.default, comment: x.comment, isNew: x.isNew
						};
					}),
					drops: draft.drops.slice()
				});
			}
			function draftDirty() {
				return snapDraft() !== draft.origSnap;
			}

			/** 字段内容是否相对加载时有改（不含顺序） */
			function colFieldDirty(item) {
				if (!item) return false;
				if (item.isNew) return true;
				return String(item.name) !== String(item.baseName)
					|| String(item.type) !== String(item.baseType)
					|| !!item.nullable !== !!item.baseNullable
					|| String(item.default == null ? '' : item.default) !== String(item.baseDefault == null ? '' : item.baseDefault)
					|| String(item.comment || '') !== String(item.baseComment || '');
			}

			/** 相对原表顺序是否挪动（仅已有列） */
			function colOrderDirty(item, curIdx) {
				if (!item || item.isNew || !item.origName) return false;
				// 当前草稿中，排在前面的「原列」序列，与 origOrder 前缀比较
				var before = [], k;
				for (k = 0; k < curIdx; k++) {
					if (!draft.cols[k].isNew && draft.cols[k].origName) {
						before.push(draft.cols[k].origName);
					}
				}
				var oi = draft.origOrder.indexOf(item.origName);
				if (oi < 0) return true;
				var expectedBefore = [];
				for (k = 0; k < oi; k++) {
					// 原顺序中仍保留在草稿里的列
					if (hasOrigInDraft(draft.origOrder[k])) {
						expectedBefore.push(draft.origOrder[k]);
					}
				}
				if (before.length !== expectedBefore.length) return true;
				for (k = 0; k < before.length; k++) {
					if (before[k] !== expectedBefore[k]) return true;
				}
				return false;
			}
			function hasOrigInDraft(origName) {
				var k;
				for (k = 0; k < draft.cols.length; k++) {
					if (!draft.cols[k].isNew && draft.cols[k].origName === origName) return true;
				}
				return false;
			}

			function markBar() {
				var dirty = draftDirty();
				if (submitBtn) submitBtn.disabled = !dirty;
				if (previewBtn) previewBtn.disabled = !dirty;
				if (discardBtn) discardBtn.disabled = !dirty;
				if (dirtyTip) {
					dirtyTip.textContent = dirty
						? _('table.hasChange')
						: _('table.noChange');
					dirtyTip.className = 'sqlmnger-alter-dirty' + (dirty ? ' is-dirty' : '');
				}
			}

			/** 从 DOM 同步草稿，并组装 apply/preview 用 payload；失败返回 null */
			function collectAlterPayload() {
				var rows = tb.querySelectorAll('tr[data-uid]');
				var r, uid, item, j, nm;
				for (r = 0; r < rows.length; r++) {
					uid = rows[r].getAttribute('data-uid');
					item = findByUid(uid);
					if (!item) continue;
					item.name = (rows[r].querySelector('.col-name').value || '').trim();
					item.type = readRowType(rows[r]);
					item.nullable = !!rows[r].querySelector('.col-null').checked;
					item.default = readRowDefault(rows[r]);
					item.comment = rows[r].querySelector('.col-cmt').value;
				}
				var seen = {};
				for (j = 0; j < draft.cols.length; j++) {
					nm = draft.cols[j].name;
					if (!nm || !draft.cols[j].type) {
						setMsg('第 ' + (j + 1) + ' 行列名/类型不完整', 'err');
						return null;
					}
					if (seen[nm]) {
						setMsg('列名重复: ' + nm, 'err');
						return null;
					}
					seen[nm] = 1;
				}
				var payloadCols = [];
				for (j = 0; j < draft.cols.length; j++) {
					item = draft.cols[j];
					payloadCols.push({
						orig_name: item.isNew ? '' : item.origName,
						name: item.name,
						type: item.type,
						nullable: item.nullable,
						default: parseDefaultFromUi(item.default),
						comment: item.comment,
						extra: item.extra || '',
						is_new: !!item.isNew
					});
				}
				return {
					database: database,
					table: table,
					drops: draft.drops.slice(),
					columns: payloadCols
				};
			}

			function showAlterSqlPreview(sqlText, meta) {
				if (typeof X === 'undefined' || !X.WinMgr) {
					uiAlert(sqlText || '（空）', '预览 SQL');
					return;
				}
				var wrap = document.createElement('div');
				wrap.className = 'sqlmnger-export-preview';
				var metaEl = document.createElement('div');
				metaEl.className = 'sqlmnger-export-preview-meta';
				metaEl.textContent = meta || (database + ' . ' + table + ' · 改表 SQL 预览');
				wrap.appendChild(metaEl);
				var pre = document.createElement('pre');
				pre.className = 'sqlmnger-export-preview-pre';
				pre.textContent = sqlText || '（无语句）';
				wrap.appendChild(pre);

				var win = X.WinMgr.create({
					xtype: 'window',
					title: '预览 SQL · ' + database + '.' + table,
					width: Math.min(920, Math.max(480, (window.innerWidth || 900) - 80)),
					height: Math.min(640, Math.max(360, (window.innerHeight || 700) - 80)),
					modal: true,
					resizable: true,
					bbar: [
						{
							xtype: 'button',
							text: '复制全部',
							handler: function () {
								copyTextToClipboard(sqlText || '').then(function (ok) {
									if (ok) uiToast('已复制到剪贴板', 'ok');
									else uiAlert('复制失败，请手动选择文本复制', '提示');
								});
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

			/** 格式化 PK/FK 依赖处理方案步骤 */
			function formatDepPlanLines(plan) {
				var lines = [];
				var i, step, op, detail, n;
				if (!plan || !plan.length) return lines;
				for (i = 0; i < plan.length; i++) {
					step = plan[i] || {};
					op = step.op || '';
					n = (i + 1) + '. ';
					if (op === 'drop_fk') {
						detail = _('table.depStepDropFk')
							.replace('{name}', step.name || '')
							.replace('{table}', step.table || '');
					} else if (op === 'drop_pk') {
						detail = _('table.depStepDropPk')
							.replace('{name}', step.name || '')
							.replace('{cols}', (step.columns || []).join(', '));
					} else if (op === 'alter_columns') {
						detail = _('table.depStepAlter')
							.replace('{cols}', (step.columns || []).join(', '));
					} else if (op === 'add_pk') {
						detail = _('table.depStepAddPk')
							.replace('{name}', step.name || '')
							.replace('{cols}', (step.columns || []).join(', '));
					} else if (op === 'add_fk') {
						detail = _('table.depStepAddFk')
							.replace('{name}', step.name || '')
							.replace('{table}', step.table || '');
					} else {
						detail = JSON.stringify(step);
					}
					lines.push(n + detail);
				}
				return lines;
			}

			/**
			 * 主键依赖阻断：说明方案 +「自动处理」
			 * @param {object} data API blocked 响应
			 * @param {object} baseBody collectAlterPayload 结果
			 * @param {'preview'|'apply'} mode
			 */
			function showPkDepDialog(data, baseBody, mode) {
				var msg = (data && data.message) ? String(data.message) : _('table.depPkMsg');
				var planLines = formatDepPlanLines(data.plan);
				var autoSql = (data.auto_sql != null) ? String(data.auto_sql) : '';
				var canAuto = !!(data && data.can_auto_handle);
				var aff = (data.affected_columns || []).join(', ');

				function runAuto() {
					var body = {};
					var k;
					for (k in baseBody) {
						if (Object.prototype.hasOwnProperty.call(baseBody, k)) {
							body[k] = baseBody[k];
						}
					}
					body.auto_handle_deps = true;
					if (mode === 'preview') {
						body.action = 'preview';
						setMsg(_('table.genPreview'), 'info');
						if (previewBtn) previewBtn.disabled = true;
						SqlmngerApi.post('api/table_column.php', body).then(function (env) {
							var d = env.data || {};
							var sql = d.sql != null ? String(d.sql) : autoSql;
							var n = d.statement_count != null ? d.statement_count
								: (sql ? sql.split(/\n/).filter(function (x) { return x.trim(); }).length : 0);
							if (!sql.trim()) {
								setMsg(_('table.noSql'), 'info');
								return;
							}
							showAlterSqlPreview(sql, database + ' . ' + table + ' · ' + _('table.depAutoPreviewMeta').replace('{n}', String(n)));
							setMsg(_('table.previewOpened').replace('{n}', String(n)), 'ok');
						}).catch(function (err) {
							setMsg(_('table.previewFail').replace('{msg}', errMsg(err)), 'err');
							uiError(_('table.previewFail').replace('{msg}', errMsg(err)));
						}).then(function () { markBar(); });
						return;
					}
					// apply
					uiConfirm(_('table.depAutoConfirm'), _('table.depAutoHandle')).then(function (ok) {
						if (!ok) return;
						body.action = 'apply';
						setMsg(_('table.submitting'), 'info');
						submitBtn.disabled = true;
						if (previewBtn) previewBtn.disabled = true;
						SqlmngerApi.post('api/table_column.php', body).then(function (env) {
							var d = env.data || {};
							if (d.blocked) {
								setMsg(d.message || _('table.depPkMsg'), 'err');
								uiError(d.message || _('table.depPkMsg'));
								markBar();
								return;
							}
							var ap = d.applied || {};
							var summary = _('table.saved')
								.replace('{drops}', String(ap.drops || 0))
								.replace('{adds}', String(ap.adds || 0))
								.replace('{mods}', String(ap.modifies || 0));
							if (ap.auto_handle_deps) {
								summary += ' · ' + _('table.depAutoDone');
							}
							setMsg(summary, 'ok');
							uiToast(summary, 'ok');
							loadStructAlter();
						}).catch(function (err) {
							setMsg(_('table.submitFail').replace('{msg}', errMsg(err)), 'err');
							uiError(_('table.submitFail').replace('{msg}', errMsg(err)));
							markBar();
						});
					});
				}

				if (typeof X === 'undefined' || !X.WinMgr) {
					var plain = msg + '\n\n' + _('table.depPlanTitle') + '\n' + planLines.join('\n');
					if (canAuto && autoSql) {
						plain += '\n\n' + autoSql;
					}
					uiConfirm(plain + '\n\n' + _('table.depAutoAsk'), _('table.depPkTitle')).then(function (ok) {
						if (ok && canAuto) runAuto();
					});
					return;
				}

				var wrap = document.createElement('div');
				wrap.className = 'sqlmnger-export-preview sqlmnger-dep-dialog';
				var head = document.createElement('div');
				head.className = 'sqlmnger-export-preview-meta';
				head.textContent = msg + (aff ? ('\n' + _('table.depAffected').replace('{cols}', aff)) : '');
				head.style.whiteSpace = 'pre-wrap';
				wrap.appendChild(head);

				var planTitle = document.createElement('div');
				planTitle.className = 'sqlmnger-dep-plan-title';
				planTitle.textContent = _('table.depPlanTitle');
				wrap.appendChild(planTitle);

				var ol = document.createElement('ol');
				ol.className = 'sqlmnger-dep-plan-list';
				var li, p;
				for (p = 0; p < planLines.length; p++) {
					li = document.createElement('li');
					// planLines 已带 "1. "，列表用纯文案
					li.textContent = planLines[p].replace(/^\d+\.\s*/, '');
					ol.appendChild(li);
				}
				if (!planLines.length) {
					li = document.createElement('li');
					li.textContent = _('table.depPlanFallback');
					ol.appendChild(li);
				}
				wrap.appendChild(ol);

				if (autoSql.trim()) {
					var sqlLab = document.createElement('div');
					sqlLab.className = 'sqlmnger-dep-plan-title';
					sqlLab.textContent = _('table.depAutoSqlTitle');
					wrap.appendChild(sqlLab);
					var pre = document.createElement('pre');
					pre.className = 'sqlmnger-export-preview-pre';
					pre.textContent = autoSql;
					wrap.appendChild(pre);
				}

				var bbar = [
					{
						xtype: 'button',
						text: _('common.cancel'),
						handler: function () {
							try { win.close(); } catch (e0) { /* */ }
							markBar();
						}
					}
				];
				if (canAuto) {
					bbar.unshift({
						xtype: 'button',
						text: _('table.depAutoHandle'),
						cls: 'x-btn-primary',
						handler: function () {
							try { win.close(); } catch (e1) { /* */ }
							runAuto();
						}
					});
				}
				if (autoSql.trim()) {
					bbar.splice(canAuto ? 1 : 0, 0, {
						xtype: 'button',
						text: _('common.copyAll'),
						handler: function () {
							copyTextToClipboard(autoSql).then(function (ok) {
								if (ok) uiToast(_('common.copyOk'), 'ok');
								else uiAlert(_('common.copyFail'), _('common.tip'));
							});
						}
					});
				}

				var win = X.WinMgr.create({
					xtype: 'window',
					title: _('table.depPkTitle') + ' · ' + database + '.' + table,
					width: Math.min(900, Math.max(480, (window.innerWidth || 900) - 80)),
					height: Math.min(620, Math.max(360, (window.innerHeight || 700) - 80)),
					modal: true,
					resizable: true,
					bbar: bbar
				});
				if (win.el) win.el.classList.add('sqlmnger-export-win');
				var bd = win._bd || (win.el && win.el.querySelector('.xwin-bd'));
				if (bd) {
					bd.innerHTML = '';
					bd.appendChild(wrap);
					bd.style.overflow = 'auto';
					bd.style.padding = '12px';
					bd.style.display = 'flex';
					bd.style.flexDirection = 'column';
					bd.style.minHeight = '0';
				}
				if (win._bbr) win._bbr.classList.add('sqlmnger-export-win-bbr');
				setMsg(_('table.depPkNeedHandle'), 'info');
			}

			function previewAlterSql() {
				if (!draftDirty()) {
					setMsg(_('table.noPreview'), 'info');
					return;
				}
				var body = collectAlterPayload();
				if (!body) return;
				body.action = 'preview';
				if (previewBtn) previewBtn.disabled = true;
				setMsg(_('table.genPreview'), 'info');
				SqlmngerApi.post('api/table_column.php', body).then(function (env) {
					var data = env.data || {};
					if (data.blocked) {
						showPkDepDialog(data, body, 'preview');
						return;
					}
					var sql = data.sql != null ? String(data.sql) : '';
					var pv = data.preview || {};
					var n = data.statement_count != null ? data.statement_count
						: (pv.statements ? pv.statements.length : 0);
					var skipPart = pv.skipped != null
						? _('table.skipPart').replace('{n}', String(pv.skipped))
						: '';
					var meta = _('table.previewSqlMeta')
						.replace('{db}', database)
						.replace('{table}', table)
						.replace('{drops}', String(pv.drops || 0))
						.replace('{adds}', String(pv.adds || 0))
						.replace('{mods}', String(pv.modifies || 0))
						.replace('{skip}', skipPart)
						.replace('{n}', String(n));
					if (!sql.trim()) {
						setMsg(_('table.noSql'), 'info');
						return;
					}
					showAlterSqlPreview(sql, meta);
					setMsg(_('table.previewOpened').replace('{n}', String(n)), 'ok');
				}).catch(function (err) {
					setMsg(_('table.previewFail').replace('{msg}', errMsg(err)), 'err');
					uiError(_('table.previewFail').replace('{msg}', errMsg(err)));
				}).then(function () {
					markBar();
				});
			}

			/** 刷新行 UI 脏标记（不整表重绘） */
			function refreshRowMarks() {
				var rows = tb.querySelectorAll('tr[data-uid]');
				var r, uid, item, idx, fieldD, orderD, badge;
				for (r = 0; r < rows.length; r++) {
					uid = rows[r].getAttribute('data-uid');
					item = findByUid(uid);
					idx = indexOfUid(uid);
					if (!item) continue;
					fieldD = colFieldDirty(item);
					orderD = colOrderDirty(item, idx);
					rows[r].classList.toggle('is-new', !!item.isNew);
					rows[r].classList.toggle('is-mod', !item.isNew && fieldD);
					rows[r].classList.toggle('is-moved', !item.isNew && orderD && !fieldD);
					rows[r].classList.toggle('is-changed', !!(item.isNew || fieldD || orderD));
					badge = rows[r].querySelector('.col-status-badge');
					if (badge) {
						if (item.isNew) {
							badge.textContent = '新';
							badge.className = 'col-status-badge is-new';
							badge.title = '新增列';
						} else if (fieldD) {
							badge.textContent = '改';
							badge.className = 'col-status-badge is-mod';
							badge.title = '字段已修改';
						} else if (orderD) {
							badge.textContent = '序';
							badge.className = 'col-status-badge is-moved';
							badge.title = '顺序已调整';
						} else {
							badge.textContent = '';
							badge.className = 'col-status-badge';
							badge.title = '';
						}
					}
					// 单元格级高亮
					markCell(rows[r], '.col-name', !item.isNew && String(item.name) !== String(item.baseName));
					markCell(rows[r], '.col-type-host', !item.isNew && String(item.type) !== String(item.baseType));
					markCell(rows[r], '.col-null', !item.isNew && !!item.nullable !== !!item.baseNullable);
					markCell(rows[r], '.col-def-host', !item.isNew && String(item.default || '') !== String(item.baseDefault || ''));
					markCell(rows[r], '.col-cmt', !item.isNew && String(item.comment || '') !== String(item.baseComment || ''));
				}
			}
			function markCell(tr, sel, on) {
				var el = tr.querySelector(sel);
				if (!el) return;
				var cell = el.closest ? el.closest('td') : el.parentNode;
				if (cell && cell.tagName === 'TD') {
					if (on) cell.classList.add('cell-dirty');
					else cell.classList.remove('cell-dirty');
				}
			}

			// 工具条：提交 / 预览 / 放弃 / 末尾加列
			var bar = document.createElement('div');
			bar.className = 'sqlmnger-alter-bar';
			bar.innerHTML =
				'<button type="button" class="sqlmnger-tp-btn primary alter-submit" disabled>' +
					'<i class="fa-solid fa-floppy-disk"></i> ' + esc(_('table.submitStruct')) + '</button>' +
				'<button type="button" class="sqlmnger-tp-btn alter-preview" disabled title="' + escAttr(_('table.previewSql')) + '">' +
					'<i class="fa-solid fa-code"></i> ' + esc(_('table.previewSql')) + '</button>' +
				'<button type="button" class="sqlmnger-tp-btn alter-discard" disabled>' +
					'<i class="fa-solid fa-rotate-left"></i> ' + esc(_('table.discardChanges')) + '</button>' +
				'<button type="button" class="sqlmnger-tp-btn alter-add-end">' +
					'<i class="fa-solid fa-plus"></i> ' + esc(_('table.addColumn')) + '</button>' +
				'<span class="sqlmnger-alter-dirty"></span>' +
				'<span class="sqlmnger-alter-legend">' +
					'<span class="lg is-new">' + esc(_('table.legendNew')) + '</span> ' + esc(_('table.legendNewTip')) + ' ' +
					'<span class="lg is-mod">' + esc(_('table.legendMod')) + '</span> ' + esc(_('table.legendModTip')) + ' ' +
					'<span class="lg is-moved">' + esc(_('table.legendOrder')) + '</span> ' + esc(_('table.legendOrderTip')) +
				'</span>';
			box.appendChild(bar);
			var submitBtn = bar.querySelector('.alter-submit');
			var previewBtn = bar.querySelector('.alter-preview');
			var discardBtn = bar.querySelector('.alter-discard');
			var dirtyTip = bar.querySelector('.sqlmnger-alter-dirty');
			var addEndBtn = bar.querySelector('.alter-add-end');

			submitBtn.onclick = function () { applyDraft(); };
			previewBtn.onclick = function () { previewAlterSql(); };
			discardBtn.onclick = function () {
				if (!draftDirty()) return;
				uiConfirm('放弃所有未提交的结构修改？', '确认').then(function (ok) {
					if (ok) loadStructAlter();
				});
			};
			addEndBtn.onclick = function () {
				insertColAt(draft.cols.length);
			};

			var h2 = document.createElement('h3');
			h2.className = 'sqlmnger-struct-sec';
			h2.innerHTML = '<i class="fa-solid fa-columns"></i> ' + esc(_('table.colName')) +
				' <span class="sqlmnger-struct-note">' + esc(_('table.colsNote')) + '</span>';
			box.appendChild(h2);

			var tbl = document.createElement('table');
			tbl.className = 'sqlmnger-struct-table sqlmnger-struct-edit sqlmnger-alter-cols';
			tbl.innerHTML =
				'<thead><tr>' +
				'<th class="c-drag" title="' + escAttr(_('table.dragSort')) + '"></th>' +
				'<th class="c-idx">#</th>' +
				'<th class="c-name-col">' + esc(_('table.colName')) + '</th>' +
				'<th class="c-type-col">' + esc(_('table.colType')) + '</th>' +
				'<th class="c-null-col" title="NULL">' + esc(_('table.colNull')) + '</th>' +
				'<th class="c-def-col">' + esc(_('table.colDefault')) + '</th>' +
				'<th class="c-cmt-col">' + esc(_('table.colComment')) + '</th>' +
				'<th class="c-key" title="' + escAttr(_('table.colKey')) + '">' + esc(_('table.colKey')) + '</th>' +
				'<th class="c-act-col">' + esc(_('table.colOps')) + '</th>' +
				'</tr></thead>';
			var tb = document.createElement('tbody');
			tbl.appendChild(tb);
			box.appendChild(tbl);

			// 类型下拉选项（参考 Adminer MySQL types，可手输自定义如 varchar(360)）
			var COLUMN_TYPE_ITEMS = [
				'tinyint', 'tinyint(1)', 'tinyint(3) unsigned', 'smallint', 'mediumint',
				'int', 'int(11)', 'int(11) unsigned', 'bigint', 'bigint(20)',
				'decimal', 'decimal(10,2)', 'float', 'double',
				'date', 'datetime', 'timestamp', 'time', 'year',
				'char', 'char(1)', 'varchar', 'varchar(50)', 'varchar(255)',
				'tinytext', 'text', 'mediumtext', 'longtext', 'json',
				'enum', 'set',
				'bit', 'bit(1)', 'binary', 'varbinary', 'varbinary(255)',
				'tinyblob', 'blob', 'mediumblob', 'longblob',
				'geometry', 'point', 'linestring', 'polygon'
			];

			function typeItemsFor(curType) {
				var list = COLUMN_TYPE_ITEMS.slice();
				var t = (curType || '').trim();
				if (t) {
					var found = false, i;
					for (i = 0; i < list.length; i++) {
						if (list[i].toLowerCase() === t.toLowerCase()) { found = true; break; }
					}
					if (!found) list.unshift(t);
				}
				return list;
			}

			function formatKeyHtml(d) {
				// PK 合并到「键」列；其余显示 MUL/UNI 等
				if (d.isPrimary || String(d.key || '').toUpperCase() === 'PRI') {
					return '<span class="pk" title="主键">PK</span>';
				}
				var k = d.key || '';
				return k ? esc(k) : '';
			}

			function readRowType(tr) {
				// 优先读 combo 输入框当前文本（支持自定义类型）
				var tinp = tr.querySelector('.col-type-host .sqlmnger-combo-input');
				if (tinp) return (tinp.value || '').trim();
				var el = tr.querySelector('.col-type');
				return el ? (el.value || '').trim() : '';
			}

			// 默认值常用选项：'' 空串；0；日期；函数/NULL；(空)=不写 DEFAULT
			var COLUMN_DEFAULT_ITEMS = [
				{ value: '', label: _('table.defaultEmpty') },
				{ value: "''", label: "''" },
				'0',
				'NOW()',
				'GETDATE()',
				'CURRENT_TIMESTAMP',
				"'1970-01-01'",
				"'1970-01-01 00:00:00'",
				'NULL'
			];

			function defaultItemsFor(curDef) {
				var list = COLUMN_DEFAULT_ITEMS.slice();
				var t = curDef == null ? '' : String(curDef);
				if (t === '') return list;
				var found = false, i, it, v;
				for (i = 0; i < list.length; i++) {
					it = list[i];
					v = typeof it === 'object' ? String(it.value) : String(it);
					if (v === t) { found = true; break; }
				}
				if (!found) list.unshift(t);
				return list;
			}

			/** 按类型建议默认：字符串 ''，数值 0，日期 '1970-01-01' */
			function suggestedDefaultForType(type) {
				var t = String(type || '').toLowerCase().replace(/\s+/g, ' ').trim();
				if (!t) return '';
				if (
					/\b(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|money|smallmoney|year|serial|boolean|bool)\b/.test(t)
					|| /^(tiny|small|medium|big)?int(\(|$)/.test(t)
				) {
					return '0';
				}
				if (/\b(date|datetime|datetime2|smalldatetime|timestamp|time)\b/.test(t)) {
					return "'1970-01-01'";
				}
				if (
					/\b(char|varchar|nchar|nvarchar|text|ntext|tinytext|mediumtext|longtext|blob|tinyblob|mediumblob|longblob|binary|varbinary|enum|set|json|xml|clob|uuid|uniqueidentifier)\b/.test(t)
					|| t === 'text' || t === 'blob'
				) {
					return "''";
				}
				return '';
			}

			function applySuggestedDefault(tr, type, uid) {
				if (!tr) return;
				var item = uid != null ? findByUid(uid) : null;
				// 主键 / 自增列不强写
				if (item && item.isPrimary) return;
				var sug = suggestedDefaultForType(type);
				if (sug === '') return;
				if (tr._defCombo && typeof tr._defCombo.setItems === 'function') {
					tr._defCombo.setItems(defaultItemsFor(sug));
					if (typeof tr._defCombo.setValue === 'function') {
						tr._defCombo.setValue(sug, true);
					}
				} else {
					var dinp = tr.querySelector('.col-def-host .sqlmnger-combo-input')
						|| tr.querySelector('.col-def');
					if (dinp) dinp.value = sug;
				}
				if (item) item.default = sug;
			}

			function readRowDefault(tr) {
				var dinp = tr.querySelector('.col-def-host .sqlmnger-combo-input');
				if (dinp) return dinp.value; // 保留原样（含空串）
				var el = tr.querySelector('.col-def');
				return el ? el.value : '';
			}

			/** 在 index 位置插入新列（index = length 表示末尾） */
			function insertColAt(index) {
				var n = 1;
				var base = 'col';
				var tryName = base + n;
				while (nameExists(tryName)) {
					n++;
					tryName = base + n;
				}
				var item = makeColDraft({
					origName: '',
					name: tryName,
					type: 'varchar(50)',
					nullable: true,
					default: '',
					comment: '',
					isNew: true
				});
				if (index < 0) index = 0;
				if (index > draft.cols.length) index = draft.cols.length;
				draft.cols.splice(index, 0, item);
				renderColRows();
				// 聚焦新行列名
				setTimeout(function () {
					var tr = tb.querySelector('tr[data-uid="' + item.uid + '"]');
					var inp = tr && tr.querySelector('.col-name');
					if (inp) {
						try { inp.focus(); inp.select(); } catch (ex) { /* */ }
					}
				}, 30);
				setMsg('已添加本地新列（提交后写库）', 'info');
			}
			function nameExists(nm) {
				var k;
				for (k = 0; k < draft.cols.length; k++) {
					if (String(draft.cols[k].name).toLowerCase() === String(nm).toLowerCase()) return true;
				}
				return false;
			}
			function indexOfUid(uid) {
				var k;
				for (k = 0; k < draft.cols.length; k++) {
					if (draft.cols[k].uid === uid) return k;
				}
				return -1;
			}

			function renderColRows() {
				tb.innerHTML = '';
				var j, row, d, stLabel, stCls, stTitle;
				for (j = 0; j < draft.cols.length; j++) {
					d = draft.cols[j];
					row = document.createElement('tr');
					row.setAttribute('data-uid', d.uid);
					row.draggable = false;
					if (d.isPrimary) row.classList.add('is-pk');
					stLabel = '';
					stCls = 'col-status-badge';
					stTitle = '';
					if (d.isNew) {
						stLabel = '新';
						stCls += ' is-new';
						stTitle = '新增列';
					} else if (colFieldDirty(d)) {
						stLabel = '改';
						stCls += ' is-mod';
						stTitle = '字段已修改';
					} else if (colOrderDirty(d, j)) {
						stLabel = '序';
						stCls += ' is-moved';
						stTitle = '顺序已调整';
					}
					// c-drag 整格可拖（含新增列）；勿把 draggable 只放在 span 上以免失效
					row.innerHTML =
						'<td class="c-drag" draggable="true" title="拖动排序（含新增列）">' +
							'<span class="sqlmnger-drag-handle">' +
							'<i class="fa-solid fa-grip-vertical"></i></span></td>' +
						'<td class="c-idx">' + (j + 1) + '</td>' +
						'<td class="c-name-cell">' +
							'<input class="sqlmnger-input col-name" value="' + escAttr(d.name) + '" />' +
							'<span class="' + stCls + '" title="' + escAttr(stTitle) + '">' + esc(stLabel) + '</span>' +
						'</td>' +
						'<td class="c-type-cell"><span class="col-type-host"></span></td>' +
						'<td class="c-center c-null-cell"><input type="checkbox" class="col-null" ' + (d.nullable ? 'checked' : '') + ' /></td>' +
						'<td class="c-def-cell"><span class="col-def-host"></span></td>' +
						'<td class="c-cmt-cell"><input class="sqlmnger-input col-cmt" value="' + escAttr(d.comment) + '" /></td>' +
						'<td class="c-key muted">' + formatKeyHtml(d) + '</td>' +
						'<td class="c-act"></td>';
					(function (uid, tr, colType, colDef) {
						function pull() {
							var item = findByUid(uid);
							if (!item) return;
							item.name = (tr.querySelector('.col-name').value || '').trim();
							item.type = readRowType(tr);
							item.nullable = !!tr.querySelector('.col-null').checked;
							item.default = readRowDefault(tr);
							item.comment = tr.querySelector('.col-cmt').value;
							refreshRowMarks();
							markBar();
						}
						// 类型：可输入过滤的 combobox（参考 Adminer）
						var typeHost = tr.querySelector('.col-type-host');
						if (typeHost && typeof SqlmngerCombo !== 'undefined' && SqlmngerCombo.mount) {
							tr._typeCombo = SqlmngerCombo.mount({
								el: typeHost,
								items: typeItemsFor(colType),
								value: colType || '',
								placeholder: '类型…',
								allowCustom: true,
								onChange: function (v) {
									// 选类型时自动填默认值（'' / 0 / '1970-01-01'）
									applySuggestedDefault(tr, v, uid);
									pull();
								}
							});
						} else if (typeHost) {
							typeHost.innerHTML = '<input class="sqlmnger-input col-type" value="' + escAttr(colType) + '" />';
							var typeInp0 = typeHost.querySelector('.col-type');
							if (typeInp0) {
								typeInp0.onchange = function () {
									applySuggestedDefault(tr, typeInp0.value, uid);
									pull();
								};
							}
						}
						// 默认值：常用下拉 + 可手输
						var defHost = tr.querySelector('.col-def-host');
						if (defHost && typeof SqlmngerCombo !== 'undefined' && SqlmngerCombo.mount) {
							tr._defCombo = SqlmngerCombo.mount({
								el: defHost,
								items: defaultItemsFor(colDef),
								value: colDef == null ? '' : String(colDef),
								placeholder: '默认…',
								allowCustom: true,
								onChange: function () { pull(); }
							});
						} else if (defHost) {
							defHost.innerHTML = '<input class="sqlmnger-input col-def" value="' + escAttr(colDef) + '" />';
						}
						var inputs = tr.querySelectorAll('input');
						var ii;
						for (ii = 0; ii < inputs.length; ii++) {
							// 勿覆盖 combo 的 oninput（会丢掉过滤/高亮）；草稿由 combo onChange + 下方 addEventListener 同步
							if (inputs[ii].classList.contains('sqlmnger-combo-input')) {
								inputs[ii].addEventListener('input', pull);
								continue;
							}
							inputs[ii].oninput = pull;
							inputs[ii].onchange = pull;
							// 文本框 Enter → 提交全部结构修改（下拉 Enter 由 combo 自己处理）
							if (inputs[ii].type !== 'checkbox') {
								inputs[ii].onkeydown = function (e) {
									var key = e.key || e.keyCode;
									if (key === 'Enter' || key === 13) {
										e.preventDefault();
										e.stopPropagation();
										pull();
										applyDraft();
									}
								};
							}
						}
						var act = tr.querySelector('.c-act');
						// 在上方插入
						var addBelow = document.createElement('button');
						addBelow.type = 'button';
						addBelow.className = 'sqlmnger-tp-btn alter-add-below';
						addBelow.innerHTML = '<i class="fa-solid fa-plus"></i>';
						addBelow.title = '在上方添加列';
						addBelow.onclick = function () {
							var idx = indexOfUid(uid);
							// 在当前行上方插入
							insertColAt(idx < 0 ? draft.cols.length : idx);
						};
						// 删除
						var del = document.createElement('button');
						del.type = 'button';
						del.className = 'sqlmnger-tp-btn danger';
						del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
						del.title = '删除列（提交后生效）';
						del.onclick = function () {
							var item = findByUid(uid);
							if (!item) return;
							if (item.isPrimary) {
								uiAlert('主键列请勿直接删除', '提示');
								return;
							}
							// 仅本地草稿移除，真正写库在「提交结构」时确认
							if (!item.isNew && item.origName) {
								if (draft.drops.indexOf(item.origName) < 0) draft.drops.push(item.origName);
							}
							var k;
							for (k = 0; k < draft.cols.length; k++) {
								if (draft.cols[k].uid === uid) {
									draft.cols.splice(k, 1);
									break;
								}
							}
							renderColRows();
							markBar();
						};
						act.appendChild(addBelow);
						act.appendChild(document.createTextNode(' '));
						act.appendChild(del);
					})(d.uid, row, d.type || '', d.default == null ? '' : String(d.default));
					tb.appendChild(row);
				}
				bindDrag(tb);
				refreshRowMarks();
				markBar();
			}

			function findByUid(uid) {
				var k;
				for (k = 0; k < draft.cols.length; k++) {
					if (draft.cols[k].uid === uid) return draft.cols[k];
				}
				return null;
			}

			function bindDrag(tbodyEl) {
				var dragUid = null;

				function rowFromEvent(el) {
					while (el && el !== tbodyEl && el.tagName !== 'TR') el = el.parentNode;
					return (el && el.tagName === 'TR') ? el : null;
				}
				function isDragSource(el) {
					// 手柄格 / 手柄图标均可（新旧列一视同仁）
					while (el && el !== tbodyEl) {
						if (el.classList) {
							if (el.classList.contains('c-drag') || el.classList.contains('sqlmnger-drag-handle')) {
								return true;
							}
						}
						// 禁止从 input/button 发起拖拽
						if (el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'A') {
							return false;
						}
						el = el.parentNode;
					}
					return false;
				}

				tbodyEl.ondragstart = function (e) {
					if (!isDragSource(e.target)) {
						e.preventDefault();
						return false;
					}
					var tr = rowFromEvent(e.target);
					if (!tr) {
						e.preventDefault();
						return false;
					}
					dragUid = tr.getAttribute('data-uid');
					if (!dragUid) {
						e.preventDefault();
						return false;
					}
					// 新旧列均可拖
					e.dataTransfer.effectAllowed = 'move';
					try {
						e.dataTransfer.setData('text/plain', dragUid);
						e.dataTransfer.setData('application/x-sqlmnger-col', dragUid);
					} catch (ex) { /* IE */ }
					tr.classList.add('is-dragging');
					// 半透明反馈
					try {
						if (e.dataTransfer.setDragImage) {
							e.dataTransfer.setDragImage(tr, 24, 12);
						}
					} catch (ex2) { /* */ }
				};
				tbodyEl.ondragend = function () {
					var all = tbodyEl.querySelectorAll('tr.is-dragging, tr.drag-over');
					var j;
					for (j = 0; j < all.length; j++) {
						all[j].classList.remove('is-dragging');
						all[j].classList.remove('drag-over');
					}
					dragUid = null;
				};
				tbodyEl.ondragover = function (e) {
					if (!dragUid) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					var tr = rowFromEvent(e.target);
					if (!tr) return;
					var rows = tbodyEl.querySelectorAll('tr');
					var j;
					for (j = 0; j < rows.length; j++) rows[j].classList.remove('drag-over');
					if (tr.getAttribute('data-uid') !== dragUid) {
						tr.classList.add('drag-over');
					}
				};
				tbodyEl.ondrop = function (e) {
					e.preventDefault();
					var tr = rowFromEvent(e.target);
					var srcUid = dragUid;
					try {
						srcUid = e.dataTransfer.getData('application/x-sqlmnger-col')
							|| e.dataTransfer.getData('text/plain')
							|| dragUid;
					} catch (ex) { /* */ }
					if (!tr || !srcUid) return;
					var targetUid = tr.getAttribute('data-uid');
					if (!targetUid || targetUid === srcUid) return;
					var from = -1, to = -1, k, item;
					for (k = 0; k < draft.cols.length; k++) {
						if (draft.cols[k].uid === srcUid) from = k;
						if (draft.cols[k].uid === targetUid) to = k;
					}
					if (from < 0 || to < 0) return;
					item = draft.cols.splice(from, 1)[0];
					draft.cols.splice(to, 0, item);
					renderColRows();
					markBar();
				};
			}

			renderColRows();

			// 索引仍即时操作（可选后续再批量化）
			var h3 = document.createElement('h3');
			h3.className = 'sqlmnger-struct-sec';
			h3.innerHTML = '<i class="fa-solid fa-key"></i> 索引 <span class="sqlmnger-struct-note">索引操作仍即时写库</span>';
			box.appendChild(h3);
			var itbl = document.createElement('table');
			itbl.className = 'sqlmnger-struct-table sqlmnger-struct-edit';
			itbl.innerHTML = '<thead><tr><th>名称</th><th>唯一</th><th>主键</th><th>列</th><th>类型</th><th></th></tr></thead>';
			var itb = document.createElement('tbody');
			var indexes = st.indexes || [];
			for (i = 0; i < indexes.length; i++) {
				(function (ix) {
					var r = document.createElement('tr');
					var tdAct = document.createElement('td');
					if (!ix.primary && ix.name && String(ix.name).toUpperCase() !== 'PRIMARY') {
						var btn = document.createElement('button');
						btn.type = 'button';
						btn.className = 'sqlmnger-tp-btn danger';
						btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> 删除';
						btn.onclick = function () {
							var runDrop = function () {
								uiConfirm('删除索引 ' + ix.name + ' ?', '确认删除').then(function (ok2) {
									if (!ok2) return;
									SqlmngerApi.post('api/table_index.php', {
										action: 'drop', database: database, table: table, name: ix.name
									}).then(function () {
										setMsg('已删除索引', 'ok');
										uiToast('索引已删除', 'ok');
										loadStructAlter();
									}).catch(function (err) {
										setMsg(errMsg(err), 'err');
										uiError(errMsg(err));
									});
								});
							};
							if (draftDirty()) {
								uiConfirm('有未提交的列修改。删除索引会立即写库，确定？', '确认').then(function (ok) {
									if (ok) runDrop();
								});
							} else {
								runDrop();
							}
						};
						tdAct.appendChild(btn);
					}
					r.innerHTML =
						'<td>' + esc(ix.name) + '</td>' +
						'<td>' + (ix.unique ? 'YES' : '') + '</td>' +
						'<td>' + (ix.primary ? 'YES' : '') + '</td>' +
						'<td>' + esc((ix.columns || []).join(', ')) + '</td>' +
						'<td>' + esc(ix.type) + '</td>';
					r.appendChild(tdAct);
					itb.appendChild(r);
				})(indexes[i]);
			}
			itbl.appendChild(itb);
			box.appendChild(itbl);

			var form = document.createElement('div');
			form.className = 'sqlmnger-idx-form';
			form.innerHTML =
				'<h3 class="sqlmnger-struct-sec"><i class="fa-solid fa-plus"></i> 创建索引（即时）</h3>' +
				'<label>名称 <input type="text" class="idx-name sqlmnger-input" /></label> ' +
				'<label>列 <input type="text" class="idx-cols sqlmnger-input" placeholder="col1,col2" /></label> ' +
				'<label><input type="checkbox" class="idx-uniq" /> 唯一</label> ' +
				'<button type="button" class="sqlmnger-tp-btn idx-go"><i class="fa-solid fa-plus"></i> 创建</button>';
			box.appendChild(form);
			form.querySelector('.idx-go').onclick = function () {
				var runCreate = function () {
					var parts = form.querySelector('.idx-cols').value.split(',');
					var colsArr = [], k, p;
					for (k = 0; k < parts.length; k++) {
						p = parts[k].replace(/^\s+|\s+$/g, '');
						if (p) colsArr.push(p);
					}
					SqlmngerApi.post('api/table_index.php', {
						action: 'create',
						database: database,
						table: table,
						name: form.querySelector('.idx-name').value,
						columns: colsArr,
						unique: form.querySelector('.idx-uniq').checked
					}).then(function () {
						setMsg('已创建索引', 'ok');
						uiToast('索引已创建', 'ok');
						loadStructAlter();
					}).catch(function (err) {
						setMsg(errMsg(err), 'err');
						uiError(errMsg(err));
					});
				};
				if (draftDirty()) {
					uiConfirm('有未提交的列修改。创建索引会立即写库，确定？', '确认').then(function (ok) {
						if (ok) runCreate();
					});
				} else {
					runCreate();
				}
			};

			function applyDraft() {
				var body = collectAlterPayload();
				if (!body) return;
				if (!draftDirty()) {
					setMsg(_('table.noSubmit'), 'info');
					markBar();
					return;
				}
				var tip = _('table.confirmSubmit');
				if (draft.drops && draft.drops.length) {
					tip += '\n' + _('table.willDrop').replace('{cols}', draft.drops.join(', '));
				}
				uiConfirm(tip, _('common.confirm')).then(function (ok) {
					if (!ok) return;
					body.action = 'apply';
					setMsg(_('table.submitting'), 'info');
					submitBtn.disabled = true;
					if (previewBtn) previewBtn.disabled = true;
					SqlmngerApi.post('api/table_column.php', body).then(function (env) {
						var data = env.data || {};
						if (data.blocked) {
							showPkDepDialog(data, body, 'apply');
							markBar();
							return;
						}
						var ap = data.applied || {};
						var summary = _('table.saved')
							.replace('{drops}', String(ap.drops || 0))
							.replace('{adds}', String(ap.adds || 0))
							.replace('{mods}', String(ap.modifies || 0));
						setMsg(summary, 'ok');
						uiToast(summary, 'ok');
						loadStructAlter();
					}).catch(function (err) {
						setMsg(_('table.submitFail').replace('{msg}', errMsg(err)), 'err');
						uiError(_('table.submitFail').replace('{msg}', errMsg(err)));
						markBar();
					});
				});
			}

			markBar();
		}

		function esc(s) {
			if (s === null || s === undefined) return '';
			return String(s)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		}
		function escAttr(s) {
			if (s === null || s === undefined) return '';
			return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
		}
		function errMsg(err) {
			if (err && err.error && err.error.message) {
				var m = err.error.message;
				if (err.error.detail) m += ' — ' + err.error.detail;
				return m;
			}
			return String(err);
		}

		// 只读连接：无修改入口
		if (readonly) {
			btnEdit.style.display = 'none';
			btnAdd.style.display = 'none';
			if (btnCopy) btnCopy.style.display = 'none';
			btnDelete.style.display = 'none';
			btnSubmit.style.display = 'none';
			btnCancelEdit.style.display = 'none';
			var btnAlter0 = toolbar.querySelector('[data-act=alter]');
			if (btnAlter0) btnAlter0.style.display = 'none';
		}

		// 初始模式（右键「结构 / 修改结构」等）
		if (initial.mode === 'struct' || initial.mode === 'alter') {
			setMode(initial.mode);
		} else {
			loadData();
		}

		return Promise.resolve({
			el: el,
			getState: getViewState,
			setMode: setMode,
			/** 外部刷新数据（如表树「清空表」后） */
			reload: function () {
				if (state.destroyed) return;
				if (state.mode === 'data') {
					loadData({ preserveSort: true, preserveColFilters: true });
				} else if (state.mode === 'struct') {
					loadStructView();
				} else {
					loadStructAlter();
				}
			},
			destroy: function () {
				state.destroyed = true;
				document.removeEventListener('keydown', onKeyDown);
				destroyGrid();
			}
		});
	}
})();
