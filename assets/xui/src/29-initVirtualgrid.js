/* XUI component: initVirtualgrid — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initVirtualgrid(){
		/** 可选接入 SqlmngerI18n；无则用 fallback */
		function vgT(key, fallback, vars) {
			if (typeof window !== 'undefined' && window.SqlmngerI18n && typeof window.SqlmngerI18n.t === 'function') {
				var s = window.SqlmngerI18n.t(key, vars);
				if (s != null && s !== key) return s;
			}
			if (vars && typeof fallback === 'string') {
				return String(fallback).replace(/\{(\w+)\}/g, function (_, k) {
					return vars[k] != null ? String(vars[k]) : '';
				});
			}
			return fallback != null ? fallback : key;
		}

		X.Grid = function Grid(opts){
			// ══════════ 配置 ══════════
			var dataArr = opts.data || [];
			var TOTAL = opts.total != null ? opts.total : dataArr.length; // 视图行数（筛选后可变）
			if (TOTAL > dataArr.length) TOTAL = dataArr.length;
			var ROW_H = opts.rowHeight || 28;
			var BUFFER = opts.buffer || 15;

			var cols = opts.columns || [];
			var editable = opts.editable !== false;
			var sortable = opts.sortable !== false;
			// serverSort：表头排序只改指示器 + 触发 onSortChange，不在客户端重排数据（由服务端 ORDER BY）
			var serverSort = opts.serverSort === true;
			var enableFilterRow = opts.filterRow === true; // 表头下筛选行（客户端）
			// 筛选行默认隐藏，点状态栏「筛选」才显示（filterRowVisible:true 可初始展开）
			var filterRowVisible = opts.filterRowVisible === true;
			var filterToggleBtn = null;
			var clicksToEdit = opts.clicksToEdit != null ? opts.clicksToEdit : 1;

			var getCell = function(r, c) { var f = cols[c].field; return dataArr[r] ? dataArr[r][f != null ? f : c] : ''; };
			var setCell = function(r, c, v) { if (dataArr[r]) { var f = cols[c].field; dataArr[r][f != null ? f : c] = v; if (api.onCellValueChange) api.onCellValueChange(r, c, v); } };
			var getCellStyle = opts.getCellStyle || function(r, c, v) { return ''; };
			var getCellClass = opts.getCellClass || function(r, c, v) { return ''; };
			var getRowClass = opts.getRowClass || function(r) { return ''; };

			var compareRows = opts.compareRows || null;
			var contextMenuItems = opts.contextMenu || null;
			var onContextMenuItem = opts.onContextMenu || null;

			var showToolbar = opts.toolbar !== false;
			var showStatusBar = opts.statusBar !== false;
			var toolbarText = opts.toolbarText || '';
			var statusBarText = opts.statusBarText || '';
			// 查询用时（ms）；null/undefined 不显示
			var elapsedMs = (opts.elapsedMs != null && opts.elapsedMs !== '')
				? opts.elapsedMs
				: (opts.elapsed_ms != null ? opts.elapsed_ms : null);
			var container = opts.container || null;

			// 多列排序：[{ col, dir, field }]；sortFld/sortDir 为兼容字段（首关键字）
			// sortIdx：视图位置 -> dataIdx；筛选和/或排序时启用
			var sortIdx = null, sortFld = -1, sortDir = 1;
			var sortKeys = [];
			var dataToVirtual = null; // dataIdx -> visual position
			var colFilterVals = []; // 每列筛选字符串
			// 列宽拖拽柄 mousedown 后抑制随后一次表头 click 排序（即使未拖动）
			var _suppressHeaderSortClick = false;
			var filterInps = []; // 筛选行 input 元素
			var filterRowEl = null;
			var _filterTimer = null;
			var globalSearch = ''; // 底部全列搜索
			var globalSearchInp = null;
			var selAnchor = null, selActive = null;
			var editState = null, _pendingEdit = null;
			// Tab/方向键跳格时：commit 会销毁 input 触发 blur，需抑制，否则会立刻提交新格
			var _suppressEditBlur = false;
			var iInitF;
			for (iInitF = 0; iInitF < cols.length; iInitF++) colFilterVals[iInitF] = '';

			// ─── 辅助函数 ───
			function getDisplayVal(dataIdx, colIdx) {
				var raw = getCell(dataIdx, colIdx);
				return cols[colIdx].fmt ? cols[colIdx].fmt(raw) : raw;
			}

			function _syncLegacySort() {
				if (sortKeys.length) {
					sortFld = sortKeys[0].col;
					sortDir = sortKeys[0].dir;
				} else {
					sortFld = -1;
					sortDir = 1;
				}
			}

			function _colField(colIdx) {
				if (colIdx < 0 || colIdx >= cols.length) return colIdx;
				var c = cols[colIdx];
				return c.field != null ? c.field : colIdx;
			}

			function _findSortKeyIdx(colIdx) {
				for (var i = 0; i < sortKeys.length; i++) {
					if (sortKeys[i].col === colIdx) return i;
				}
				return -1;
			}

			function _isSortableCol(colIdx) {
				if (colIdx < 0 || colIdx >= cols.length) return false;
				var c = cols[colIdx];
				if (!c) return false;
				if (c.sortable === false) return false;
				if (c.is_select || c.field === '__sel__') return false;
				return true;
			}

			/** 比较两行在指定列上的值；返回负/零/正（未乘方向） */
			function _cmpCells(a, b, f) {
				if (compareRows) return compareRows(a, b, f);
				var va = getCell(a, f), vb = getCell(b, f);
				if (va == null && vb == null) return 0;
				if (va == null || va === '') return 1;
				if (vb == null || vb === '') return -1;
				if (typeof va === 'number' && typeof vb === 'number') return va - vb;
				// 两端都像数字时按数值比
				var na = typeof va === 'number' ? va : parseFloat(va);
				var nb = typeof vb === 'number' ? vb : parseFloat(vb);
				if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== ''
					&& /^-?\d+(\.\d+)?$/.test(String(va).trim()) && /^-?\d+(\.\d+)?$/.test(String(vb).trim())) {
					return na - nb;
				}
				return String(va).localeCompare(String(vb), 'zh');
			}

			/**
			 * 点击列头改排序。
			 * multi=false：单列排序（同列则切换正/倒序）
			 * multi=true（Ctrl/Meta）：在现有关键字上追加，或切换该列正/倒序
			 */
			function applyHeaderSort(colIdx, multi) {
				if (!sortable || !_isSortableCol(colIdx)) return false;
				var found = _findSortKeyIdx(colIdx);
				if (multi) {
					if (found >= 0) {
						sortKeys[found].dir = sortKeys[found].dir === 1 ? -1 : 1;
					} else {
						sortKeys.push({ col: colIdx, dir: 1, field: _colField(colIdx) });
					}
				} else {
					if (found >= 0 && sortKeys.length === 1) {
						sortKeys[0].dir = sortKeys[0].dir === 1 ? -1 : 1;
					} else {
						sortKeys = [{ col: colIdx, dir: 1, field: _colField(colIdx) }];
					}
				}
				_syncLegacySort();
				return true;
			}

			function clearSort() {
				sortKeys = [];
				_syncLegacySort();
				// 保留列筛选：重算视图
				updateSort();
			}

			function fireSortChange() {
				if (typeof opts.onSortChange === 'function') {
					try {
						var sortNow = null;
						if (typeof api !== 'undefined' && api && typeof api.getSort === 'function') {
							sortNow = api.getSort();
						} else if (!sortKeys.length) {
							sortNow = null;
						}
						// 第二个参数 isEmpty 便于外层明确「已取消排序」
						opts.onSortChange(sortNow, !sortKeys.length);
					} catch (eFire) { /* */ }
				}
			}

			/** 列重排后按 field 回写 col 下标 */
			function remapSortKeys() {
				if (!sortKeys.length) { _syncLegacySort(); return; }
				var next = [], i, j, k, idx, col;
				for (i = 0; i < sortKeys.length; i++) {
					k = sortKeys[i];
					idx = -1;
					for (j = 0; j < cols.length; j++) {
						col = cols[j];
						if (k.field != null && (col.field === k.field || col.name === k.field)) { idx = j; break; }
					}
					if (idx < 0 && k.col >= 0 && k.col < cols.length) idx = k.col;
					if (idx >= 0 && _isSortableCol(idx)) {
						next.push({ col: idx, dir: k.dir === -1 ? -1 : 1, field: _colField(idx) });
					}
				}
				sortKeys = next;
				_syncLegacySort();
			}

			function hasActiveColFilter() {
				var i, v;
				for (i = 0; i < colFilterVals.length; i++) {
					v = colFilterVals[i];
					if (v != null && String(v).trim() !== '') return true;
				}
				if (globalSearch != null && String(globalSearch).trim() !== '') return true;
				return false;
			}

			/** 解析列筛选表达式 → { neg, mode:'has'|'eq', q } 或 null */
			function parseFilterExpr(fv) {
				if (fv == null) return null;
				var q = String(fv).trim();
				if (!q) return null;
				var neg = false, mode = 'has';
				if (q.charAt(0) === '!' || (q.length >= 2 && q.charAt(0) === '<' && q.charAt(1) === '>')) {
					neg = true;
					q = q.charAt(0) === '!' ? q.slice(1).trim() : q.slice(2).trim();
				}
				if (q.charAt(0) === '=') {
					mode = 'eq';
					q = q.slice(1);
				}
				if (!q && mode !== 'eq') return null;
				return { neg: neg, mode: mode, q: q };
			}

			function cellMatchesExpr(s, expr) {
				if (!expr) return true;
				var hit;
				if (expr.mode === 'eq') hit = s.toLowerCase() === expr.q.toLowerCase();
				else hit = s.toLowerCase().indexOf(expr.q.toLowerCase()) >= 0;
				return expr.neg ? !hit : hit;
			}

			/**
			 * 列筛选 + 全列搜索匹配（客户端，不提交）：
			 * - 空：不过滤
			 * - 默认：包含（忽略大小写）
			 * - 以 = 开头：精确相等
			 * - 以 ! 或 <> 开头：不包含 / 不等于
			 * - 全列搜索：任一侧业务列包含关键字
			 */
			function rowMatchesColFilter(dataIdx) {
				var c, fv, raw, s, expr;
				for (c = 0; c < cols.length; c++) {
					fv = colFilterVals[c];
					expr = parseFilterExpr(fv);
					if (!expr) continue;
					if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
					raw = getCell(dataIdx, c);
					s = raw == null ? '' : String(raw);
					if (!cellMatchesExpr(s, expr)) return false;
				}
				// 全列搜索：任一业务列包含
				var gq = globalSearch != null ? String(globalSearch).trim() : '';
				if (gq) {
					var gLower = gq.toLowerCase(), any = false;
					for (c = 0; c < cols.length; c++) {
						if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
						raw = getCell(dataIdx, c);
						s = raw == null ? '' : String(raw);
						if (s.toLowerCase().indexOf(gLower) >= 0) { any = true; break; }
					}
					if (!any) return false;
				}
				return true;
			}

			/** 唯一值列表；达到 limit 个则返回 null（表示太多，不提供下拉） */
			function collectUniqueIfFew(colIdx, limit) {
				var seen = {}, list = [], r, v, s, n = dataArr.length;
				for (r = 0; r < n; r++) {
					v = getCell(r, colIdx);
					if (v == null || v === '') continue;
					s = String(v);
					if (seen[s]) continue;
					seen[s] = 1;
					list.push(s);
					if (list.length >= limit) return null;
				}
				return list;
			}

			function escHtml(s) {
				return String(s == null ? '' : s)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
			}

			/** 收集某列应高亮的关键词（正向匹配才高亮） */
			function highlightTermsForCol(colIdx) {
				var terms = [], expr, gq;
				if (colIdx >= 0 && colIdx < colFilterVals.length) {
					expr = parseFilterExpr(colFilterVals[colIdx]);
					if (expr && !expr.neg && expr.q) terms.push(expr.q);
				}
				gq = globalSearch != null ? String(globalSearch).trim() : '';
				if (gq) terms.push(gq);
				return terms;
			}

			/** 在纯文本中高亮多个关键词（忽略大小写），返回 HTML */
			function highlightTextHtml(text, terms) {
				var s = text == null ? '' : String(text);
				if (!terms || !terms.length || s === '') return escHtml(s);
				// 合并去重，按长度降序避免短词抢先
				var uniq = [], seen = {}, i, t, reParts = [], re, out, last, m;
				for (i = 0; i < terms.length; i++) {
					t = String(terms[i]);
					if (!t || seen[t.toLowerCase()]) continue;
					seen[t.toLowerCase()] = 1;
					uniq.push(t);
				}
				if (!uniq.length) return escHtml(s);
				uniq.sort(function(a, b) { return b.length - a.length; });
				for (i = 0; i < uniq.length; i++) {
					reParts.push(uniq[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
				}
				try {
					re = new RegExp('(' + reParts.join('|') + ')', 'gi');
				} catch (err) {
					return escHtml(s);
				}
				out = '';
				last = 0;
				while ((m = re.exec(s)) !== null) {
					out += escHtml(s.slice(last, m.index));
					out += '<mark class="xvr-hl">' + escHtml(m[0]) + '</mark>';
					last = m.index + m[0].length;
					if (m[0].length === 0) { re.lastIndex++; if (re.lastIndex > s.length) break; }
				}
				out += escHtml(s.slice(last));
				return out;
			}

			function fillCellDisplay(span, dataIdx, colIdx) {
				var col = cols[colIdx];
				var val = getCell(dataIdx, colIdx);
				if (col.render) {
					var node = col.render(val, dataArr[dataIdx], null);
					if (node && node.nodeType) span.appendChild(node);
					return;
				}
				var text = getDisplayVal(dataIdx, colIdx);
				// 自定义 fmt 可能已是 HTML，不做高亮
				if (col.fmt) {
					span.innerHTML = text == null ? '' : String(text);
					return;
				}
				var terms = highlightTermsForCol(colIdx);
				if (terms.length && hasActiveColFilter()) {
					span.innerHTML = highlightTextHtml(text, terms);
				} else {
					span.textContent = text == null ? '' : String(text);
				}
			}

			function updateSort() {
				_syncLegacySort();
				var srcLen = dataArr.length;
				var hasF = hasActiveColFilter();
				// serverSort 时数据顺序由服务端保证，客户端只做列筛选
				var hasS = !!(sortable && sortKeys.length && !serverSort);
				var base = [];
				var i;
				for (i = 0; i < srcLen; i++) {
					if (!hasF || rowMatchesColFilter(i)) base.push(i);
				}
				if (hasS) {
					var keys = sortKeys;
					base.sort(function(a, b) {
						var k, cmp, d;
						for (k = 0; k < keys.length; k++) {
							d = keys[k].dir;
							cmp = _cmpCells(a, b, keys[k].col);
							if (cmp !== 0) return d * cmp;
						}
						return a - b;
					});
				}
				if (!hasS && !hasF) {
					sortIdx = null;
					dataToVirtual = null;
					TOTAL = srcLen;
				} else {
					sortIdx = base;
					TOTAL = base.length;
					dataToVirtual = new Array(srcLen);
					for (var j = 0; j < base.length; j++) dataToVirtual[base[j]] = j;
				}
				// 虚拟滚动高度
				if (typeof body !== 'undefined' && body && body.style) {
					body.style.height = (TOTAL * ROW_H) + 'px';
				}
			}

			function runSortUI() {
				updateHeaderSort();
				// 服务端排序：立即通知外层拉数，本地仅保留表头标记与列筛选视图
				if (serverSort) {
					updateSort(); // 仅列筛选，不按 sortKeys 排数据
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
					return;
				}
				if (typeof showLoading === 'function') showLoading();
				setTimeout(function() {
					updateSort();
					if (typeof hideLoading === 'function') hideLoading();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
				}, 10);
			}

			function applyColFiltersFromInputs(immediate) {
				function go() {
					var i;
					for (i = 0; i < filterInps.length; i++) {
						if (filterInps[i] && filterInps[i].tagName === 'INPUT') {
							colFilterVals[i] = filterInps[i].value;
						}
					}
					updateSort();
					_lastST = -2;
					render();
					updateStatus();
					if (filterRowEl) {
						if (hasActiveColFilter()) filterRowEl.classList.add('has-filter');
						else filterRowEl.classList.remove('has-filter');
					}
					if (typeof syncFilterToggleBtn === 'function') syncFilterToggleBtn();
				}
				if (immediate) {
					if (_filterTimer) { clearTimeout(_filterTimer); _filterTimer = null; }
					go();
				} else {
					if (_filterTimer) clearTimeout(_filterTimer);
					_filterTimer = setTimeout(function() { _filterTimer = null; go(); }, 120);
				}
			}

			function clearAllColFilters() {
				var i;
				for (i = 0; i < colFilterVals.length; i++) colFilterVals[i] = '';
				for (i = 0; i < filterInps.length; i++) {
					if (filterInps[i] && filterInps[i].tagName === 'INPUT') filterInps[i].value = '';
				}
				// 清除列筛选时一并清除底部全表搜索
				globalSearch = '';
				if (globalSearchInp) globalSearchInp.value = '';
				applyColFiltersFromInputs(true);
			}

			function setGlobalSearch(q, immediate) {
				globalSearch = q == null ? '' : String(q);
				if (globalSearchInp && globalSearchInp.value !== globalSearch) {
					globalSearchInp.value = globalSearch;
				}
				if (immediate === false) {
					if (_filterTimer) clearTimeout(_filterTimer);
					_filterTimer = setTimeout(function() {
						_filterTimer = null;
						updateSort();
						_lastST = -2;
						render();
						updateStatus();
					}, 120);
				} else {
					if (_filterTimer) { clearTimeout(_filterTimer); _filterTimer = null; }
					updateSort();
					_lastST = -2;
					render();
					updateStatus();
				}
			}

			function clearGlobalSearch() {
				setGlobalSearch('', true);
			}

			function getDataIdx(vPos) { return sortIdx ? sortIdx[vPos] : vPos; }

			function getVirtualPos(dataIdx) {
				if (!sortIdx) return dataIdx;
				if (dataToVirtual && dataIdx >= 0 && dataIdx < dataToVirtual.length) {
					var vp = dataToVirtual[dataIdx];
					return vp != null ? vp : -1;
				}
				// 回退线性查找
				for (var i = 0; i < TOTAL; i++) {
					if (sortIdx[i] === dataIdx) return i;
				}
				return -1;
			}

			function inSelection(d, c) {
				if (!selAnchor || !selActive) return false;
				// 按屏幕行序判断选区矩形（排序后 dataIdx 大小与视觉上下无关）
				var vpA = getVirtualPos(selAnchor.d), vpB = getVirtualPos(selActive.d);
				if (vpA < 0) vpA = selAnchor.d;
				if (vpB < 0) vpB = selActive.d;
				var minVP = Math.min(vpA, vpB), maxVP = Math.max(vpA, vpB);
				var vp = getVirtualPos(d);
				if (vp < 0) vp = d;
				var minC = Math.min(selAnchor.c, selActive.c);
				var maxC = Math.max(selAnchor.c, selActive.c);
				return vp >= minVP && vp <= maxVP && c >= minC && c <= maxC;
			}

			function isActiveCell(d, c) { return selActive && selActive.d === d && selActive.c === c; }

			function moveSelection(rowDir, colDir, extend) {
				if (editState) return;
				if (!selActive) {
					selAnchor = { d: 0, c: _firstEditableCol() };
					selActive = { d: 0, c: _firstEditableCol() };
					_ensureVisible(0); render(); return;
				}
				var vPos = getVirtualPos(selActive.d);
				var newD = selActive.d, newC = selActive.c + colDir;
				if (colDir !== 0) {
					if (newC >= cols.length) {
						var nvp = vPos + 1;
						if (nvp >= TOTAL) return;
						newD = getDataIdx(nvp);
						newC = 1;
					} else if (newC < 0) {
						var nvp = vPos - 1;
						if (nvp < 0) return;
						newD = getDataIdx(nvp);
						newC = cols.length - 1;
					} else if (newC <= 0) {
						newC = 1;
					}
				} else {
					newC = selActive.c;
					var newVP = vPos + rowDir;
					if (newVP < 0 || newVP >= TOTAL) return;
					newD = getDataIdx(newVP);
				}
				if (extend) { selActive = { d: newD, c: newC }; }
				else { selAnchor = { d: newD, c: newC }; selActive = { d: newD, c: newC }; }
				_ensureVisible(getVirtualPos(newD));
				_renderSelection();
			}

			function _firstEditableCol() {
				for (var i = 1; i < cols.length; i++) { if (cols[i].editable !== false) return i; }
				return cols.length - 1;
			}

			function _ensureVisible(vPos) {
				var st = sc.scrollTop, vh = sc.clientHeight, top = vPos * ROW_H;
				if (top < st || top + ROW_H > st + vh) { sc.scrollTop = top - Math.floor(vh / 4); }
			}

			// ─── DOM 构建 ───
			var el = document.createElement('div');
			el.className = 'xvr-root';
			el.style.cssText = 'overflow:hidden;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;width:100%;';
			var _totalColW = 0;
			for (var _tw = 0; _tw < cols.length; _tw++) _totalColW += (cols[_tw].w || 80);
			if (_totalColW < 100) _totalColW = 100;

			// ─── 工具栏 ───
			if (showToolbar) {
				var tbar = document.createElement('div');
				tbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 10px;background:var(--x-panel-hd-bg);border-bottom:1px solid var(--x-border);flex-shrink:0;';
				tbar.innerHTML = toolbarText ||
					'<span style="font-weight:bold;color:var(--x-text);font-size:var(--x-font-size)">▦ 虚拟滚动表格</span>' +
					'<span style="color:var(--x-text-muted);font-size:var(--x-font-size-sm)">总行数: ' + TOTAL.toLocaleString() + ' | 行高: ' + ROW_H + 'px</span>' +
					'<span style="margin-left:auto;font-size:var(--x-font-size-sm);color:var(--x-text-muted)">' +
					'拖动选区 | 点击编辑 | Ctrl+C/V 复制粘贴 | ←↑→↓ 导航</span>';
				el.appendChild(tbar);
			}

			// ─── 表头 ───
			var hdr = document.createElement('div');
			hdr.className = 'xvr-hdr';
			hdr.style.cssText = 'display:flex;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;';
			var hdrWrap = document.createElement('div');
			hdrWrap.className = 'xvr-hdr-wrap';
			hdrWrap.style.cssText = 'width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;will-change:transform;';
			var colEls = [];

			for (var ci = 0; ci < cols.length; ci++) {
				var col = cols[ci];
				var d = document.createElement('div');
				d._col = col;
				d.className = 'xvr-th' + (_isSortableCol(ci) ? ' is-sortable' : '');
				// overflow 交给内部 label；悬停操作钮需可见
				d.style.cssText = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left') + ';flex-shrink:0;padding:4px 6px;cursor:pointer;font-weight:bold;font-size:var(--x-font-size);border-right:1px solid var(--x-border);user-select:none;overflow:visible;white-space:nowrap;line-height:' + (ROW_H - 8) + 'px;';
				(function(el) {
					function getColIdx() {
						return colEls.indexOf(el);
					}
					d.onmouseenter = function () {
						var idx = getColIdx();
						showHeaderFloatActs(idx, el);
					};
					d.onmouseleave = function () {
						scheduleHideHeaderFloatActs();
					};
					d.onclick = function(e) {
						// 列宽拖拽柄：即使未拖动也不排序
						if (_suppressHeaderSortClick) {
							_suppressHeaderSortClick = false;
							return;
						}
						if (_dragWasDragged) { _dragWasDragged = false; return; }
						// 点在 resizer / Adminer 风格操作钮上忽略整格排序
						var tg = e && e.target;
						if (tg && tg.classList && tg.classList.contains('xvr-col-resizer')) return;
						if (tg && tg.closest && tg.closest('.xvr-col-resizer')) return;
						if (tg && tg.classList && tg.classList.contains('xvr-th-act')) return;
						if (tg && tg.closest && tg.closest('.xvr-th-act')) return;
						if (editState) commitEdit();
						if (!sortable) return;
						var idx = getColIdx();
						if (idx < 0) return;
						// Ctrl/Meta+点击：追加/切换该列；普通点击：单列排序
						var multi = !!(e && (e.ctrlKey || e.metaKey));
						if (multi) e.preventDefault();
						if (!applyHeaderSort(idx, multi)) return;
						runSortUI();
					};
					d.oncontextmenu = function(e) {
						e.preventDefault();
						if (!sortable) return;
						var idx = getColIdx();
						if (idx < 0 || !_isSortableCol(idx)) return;
						var sk = _findSortKeyIdx(idx);
						var curDir = sk >= 0 ? sortKeys[sk].dir : 0;
						var menu = X.mk({xtype:'menu',contextMenu:true,menu:[
							{text:'\u6B63\u5E8F \u25B2',act:curDir===1,handler:function(){
								if (editState) commitEdit();
								sortKeys = [{ col: idx, dir: 1, field: _colField(idx) }];
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u5012\u5E8F \u25BC',act:curDir===-1,handler:function(){
								if (editState) commitEdit();
								sortKeys = [{ col: idx, dir: -1, field: _colField(idx) }];
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u8FFD\u52A0\u6B63\u5E8F (Ctrl)',handler:function(){
								if (editState) commitEdit();
								var f=_findSortKeyIdx(idx);
								if(f>=0){ sortKeys[f].dir=1; } else { sortKeys.push({col:idx,dir:1,field:_colField(idx)}); }
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u8FFD\u52A0\u5012\u5E8F (Ctrl)',handler:function(){
								if (editState) commitEdit();
								var f=_findSortKeyIdx(idx);
								if(f>=0){ sortKeys[f].dir=-1; } else { sortKeys.push({col:idx,dir:-1,field:_colField(idx)}); }
								_syncLegacySort();
								runSortUI();
							}},
							'-',
							{text:'\u53D6\u6D88\u6392\u5E8F',handler:function(){
								if (editState) commitEdit();
								// 走 api.clearSort，保证 UI + fireSortChange 一致
								if (typeof api !== 'undefined' && api && typeof api.clearSort === 'function') {
									api.clearSort();
								} else {
									clearSort();
									updateHeaderSort();
									_lastST = -2; render(); updateStatus();
									fireSortChange();
								}
							}},
							{text:'\u6E05\u9664\u5217\u7B5B\u9009',handler:function(){
								if (editState) commitEdit();
								clearAllColFilters();
							}},
						]});
						menu.showAt(e.clientX, e.clientY);
					};
				})(d);
				hdr.appendChild(d);
				colEls.push(d);
				// 列宽拖拽柄（列间边缘）；点击/拖拽均不得触发表头排序
				(function(cellEl, colIndex){
					cellEl.style.position = 'relative';
					var hz = document.createElement('div');
					hz.className = 'xvr-col-resizer';
					hz.title = '拖拽调整列宽';
					hz.onmousedown = function(e){
						e.preventDefault();
						e.stopPropagation();
						// 标记：随后 mouseup/click 即使未拖动也不排序
						_suppressHeaderSortClick = true;
						var startX = e.clientX;
						var startW = cols[colIndex].w || 80;
						document.body.style.cursor = 'col-resize';
						document.body.style.userSelect = 'none';
						function onMove(ev){
							var nw = startW + (ev.clientX - startX);
							if (nw < 40) nw = 40;
							if (nw > 480) nw = 480;
							setColumnWidth(colIndex, nw);
						}
						function onUp(){
							document.removeEventListener('mousemove', onMove);
							document.removeEventListener('mouseup', onUp);
							document.body.style.cursor = '';
							document.body.style.userSelect = '';
							// 无 click 时（移出后松开）延迟清标记，避免误伤下一次真实排序点击
							setTimeout(function () {
								_suppressHeaderSortClick = false;
							}, 80);
						}
						document.addEventListener('mousemove', onMove);
						document.addEventListener('mouseup', onUp);
					};
					// 阻止 resizer 上的 click 冒泡到表头
					hz.onclick = function (e) {
						e.preventDefault();
						e.stopPropagation();
						_suppressHeaderSortClick = false;
					};
					// 双击等也不要冒泡
					hz.ondblclick = function (e) {
						e.preventDefault();
						e.stopPropagation();
					};
					cellEl.appendChild(hz);
				})(d, ci);
			}
			hdrWrap.appendChild(hdr);

			// ─── 列筛选行（客户端即时过滤，不提交服务端） ───
			if (enableFilterRow) {
				filterRowEl = document.createElement('div');
				filterRowEl.className = 'xvr-filter-row';
				filterRowEl.style.cssText = 'display:flex;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;background:var(--x-panel-hd-bg,#f8fafc);border-bottom:1px solid var(--x-border,#e2e8f0);';
				for (var fi = 0; fi < cols.length; fi++) {
					(function(colIdx) {
						var cell = document.createElement('div');
						cell.className = 'xvr-filter-cell';
						cell.style.cssText = 'width:' + (cols[colIdx].w || 80) + 'px;min-width:' + (cols[colIdx].w || 80) + 'px;flex-shrink:0;box-sizing:border-box;padding:2px 3px;border-right:1px solid var(--x-border,#e2e8f0);';
						if (cols[colIdx] && (cols[colIdx].is_select || cols[colIdx].field === '__sel__')) {
							var clr = document.createElement('button');
							clr.type = 'button';
							clr.className = 'xvr-filter-clear';
							clr.title = vgT('grid.colFilterClear', '清除全部列筛选');
							clr.innerHTML = '<i class="fa-solid fa-filter-circle-xmark"></i>';
							clr.onclick = function(e) {
								if (e) { e.preventDefault(); e.stopPropagation(); }
								clearAllColFilters();
							};
							cell.appendChild(clr);
							filterInps[colIdx] = clr;
						} else {
							var inp = document.createElement('input');
							inp.type = 'text';
							inp.className = 'xvr-filter-inp';
							inp.placeholder = vgT('grid.colFilterPh', '筛选…');
							inp.title = vgT('grid.colFilterPh', '筛选…');
							inp.autocomplete = 'off';
							inp.spellcheck = false;
							inp.onmousedown = function(e) { e.stopPropagation(); };
							inp.onclick = function(e) { e.stopPropagation(); };
							inp.onkeydown = function(e) {
								e.stopPropagation();
								if (e.key === 'Escape') {
									inp.value = '';
									applyColFiltersFromInputs(true);
									inp.blur();
								} else if (e.key === 'Enter') {
									applyColFiltersFromInputs(true);
								} else if (e.ctrlKey && (e.key === 'Backspace' || e.keyCode === 8)) {
									e.preventDefault();
									inp.value = '';
									applyColFiltersFromInputs(true);
								}
							};
							inp.oninput = function() { applyColFiltersFromInputs(false); };
							// 下拉仅当唯一值少于 10 个
							var uniques = collectUniqueIfFew(colIdx, 10);
							if (uniques && uniques.length > 0) {
								var listId = 'xvr-fl-' + colIdx + '-' + Math.random().toString(36).slice(2, 8);
								inp.setAttribute('list', listId);
								var dl = document.createElement('datalist');
								dl.id = listId;
								var ui, opt;
								for (ui = 0; ui < uniques.length; ui++) {
									opt = document.createElement('option');
									opt.value = uniques[ui];
									dl.appendChild(opt);
								}
								cell.appendChild(inp);
								cell.appendChild(dl);
							} else {
								cell.appendChild(inp);
							}
							filterInps[colIdx] = inp;
						}
						filterRowEl.appendChild(cell);
					})(fi);
				}
				// 默认折叠筛选行
				filterRowEl.style.display = filterRowVisible ? 'flex' : 'none';
				hdrWrap.appendChild(filterRowEl);
			}

			function syncFilterToggleBtn() {
				if (!filterToggleBtn) return;
				if (filterRowVisible) filterToggleBtn.classList.add('is-on');
				else filterToggleBtn.classList.remove('is-on');
				var hasF = hasActiveColFilter();
				filterToggleBtn.title = filterRowVisible
					? (hasF ? vgT('grid.filterHideActive', '隐藏筛选行（当前有筛选条件）')
						: vgT('grid.filterHide', '隐藏筛选行'))
					: (hasF ? vgT('grid.filterShowActive', '显示筛选行（当前有筛选条件）')
						: vgT('grid.filterShow', '显示筛选行'));
				if (hasF) filterToggleBtn.classList.add('has-filter');
				else filterToggleBtn.classList.remove('has-filter');
			}

			/** 仅清除列筛选（不影响底栏全列搜索） */
			function clearColFiltersOnly() {
				var i;
				for (i = 0; i < colFilterVals.length; i++) colFilterVals[i] = '';
				for (i = 0; i < filterInps.length; i++) {
					if (filterInps[i] && filterInps[i].tagName === 'INPUT') filterInps[i].value = '';
				}
				applyColFiltersFromInputs(true);
			}

			function setFilterRowVisible(on) {
				var next = !!on;
				var wasOn = filterRowVisible;
				filterRowVisible = next;
				if (filterRowEl) {
					filterRowEl.style.display = filterRowVisible ? 'flex' : 'none';
				}
				// 关闭筛选行时取消所有列筛选
				if (wasOn && !filterRowVisible) {
					clearColFiltersOnly();
				} else {
					syncFilterToggleBtn();
				}
				// 展开后同步列宽
				if (filterRowVisible && filterRowEl) {
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
			}

			// 表头区域（含筛选行）挂到 root；body 滚动与 translateX 同步
			// （原逻辑曾直接 append hdrWrap，现统一走 clip）

			// ─── 列头拖拽排序 ───
			var _dragCol = null, _dragStartX = 0, _dragStartY = 0, _dragStartIdx = -1, _dragIndicator = null, _dragProxy = null, _dragWasDragged = false;
			function _initColDrag(){
				if(_dragIndicator)return;
				_dragIndicator=document.createElement('div');
				_dragIndicator.style.cssText='position:absolute;top:0;bottom:0;width:1px;background:#1a73e8;z-index:999;display:none;pointer-events:none;';
				hdrWrap.appendChild(_dragIndicator);
				_dragProxy=document.createElement('div');
				_dragProxy.style.cssText='position:fixed;display:none;pointer-events:none;z-index:10000;background:var(--x-menu-bg,#fff);border:1px solid var(--x-border,#ccc);border-radius:4px;padding:4px 10px;font-size:var(--x-font-size,13px);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.15);align-items:center;gap:6px;';
				document.body.appendChild(_dragProxy);
			}
			function _getInsertIdx(x){
				for(var i=0;i<colEls.length;i++){
					if (_dragCol && colEls[i] === _dragCol) continue;
					var r=colEls[i].getBoundingClientRect();
					if(x<r.left+r.width/2)return i;
				}
				return colEls.length;
			}
			function _isInHdr(y){
				var r=hdrWrap.getBoundingClientRect();
				return y>=r.top&&y<r.bottom;
			}
			function _showIndicator(x){
				var idx=_getInsertIdx(x);
				if(idx>=colEls.length){
					var last=colEls[colEls.length-1].getBoundingClientRect();
					_dragIndicator.style.left=(last.right-hdrWrap.getBoundingClientRect().left)+'px';
				}else{
					_dragIndicator.style.left=(colEls[idx].getBoundingClientRect().left-hdrWrap.getBoundingClientRect().left)+'px';
				}
				_dragIndicator.style.display='block';
			}
			function _syncColOrder() {
				var newCols = [];
				var newColEls = [];
				var oldCols = cols.slice();
				var oldFilterVals = colFilterVals.slice();
				var oldFilterInps = filterInps.slice();
				var i, el, oldIdx, newFilterInps = [], newFilterVals = [];
				for (i = 0; i < hdr.children.length; i++) {
					el = hdr.children[i];
					if (el && el._col) {
						newCols.push(el._col);
						newColEls.push(el);
						oldIdx = oldCols.indexOf(el._col);
						if (oldIdx < 0) oldIdx = i;
						newFilterVals.push(oldFilterVals[oldIdx] != null ? oldFilterVals[oldIdx] : '');
						newFilterInps.push(oldFilterInps[oldIdx] || null);
					}
				}
				cols = newCols;
				colEls = newColEls;
				colFilterVals = newFilterVals;
				filterInps = newFilterInps;
				// 同步筛选行 DOM 顺序
				if (filterRowEl) {
					for (i = 0; i < filterInps.length; i++) {
						if (filterInps[i] && filterInps[i].parentNode) {
							filterRowEl.appendChild(filterInps[i].parentNode);
						}
					}
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
			}
			_initColDrag();
			for(var ci=0;ci<colEls.length;ci++){
				(function(el){
					function getColIdx() {
						return colEls.indexOf(el);
					}
					el.addEventListener('mousedown',function(e){
						if(e.button!==0)return;
						_dragWasDragged=false;
						_dragCol=el;
						_dragStartX=e.clientX;
						_dragStartY=e.clientY;
						_dragStartIdx=getColIdx();
						document.addEventListener('mousemove',_onColDragMove);
						document.addEventListener('mouseup',_onColDragUp);
					});
				})(colEls[ci]);
			}
			function _onColDragMove(e){
				if(Math.abs(e.clientX-_dragStartX)<8)return;
				_dragWasDragged=true;
				if(!_dragCol.classList.contains('xvr-hdr-dragging')){
					_dragCol.classList.add('xvr-hdr-dragging');
					_dragCol.style.opacity='0.5';
				}
				_dragProxy.style.display='flex';
				_dragProxy.style.left=(e.clientX+12)+'px';
				_dragProxy.style.top=(e.clientY+12)+'px';
				if(_isInHdr(e.clientY)){
					_dragProxy.innerHTML='<i class="fa-solid fa-check" style="color:#107c10"></i><span>'+cols[_dragStartIdx].t+'</span>';
					_showIndicator(e.clientX);
				}else{
					_dragProxy.innerHTML='<i class="fa-solid fa-xmark" style="color:#e81123"></i><span>'+cols[_dragStartIdx].t+'</span>';
					_dragIndicator.style.display='none';
				}
			}
			function _onColDragUp(e){
				document.removeEventListener('mousemove',_onColDragMove);
				document.removeEventListener('mouseup',_onColDragUp);
				if(_dragIndicator)_dragIndicator.style.display='none';
				if(_dragProxy)_dragProxy.style.display='none';
				if(_dragCol){
					_dragCol.classList.remove('xvr-hdr-dragging');
					_dragCol.style.opacity='';
				}
				if(_dragWasDragged&&_isInHdr(e.clientY)&&Math.abs(e.clientX-_dragStartX)>=8){
					var toIdx=_getInsertIdx(e.clientX);
					if(toIdx!==_dragStartIdx){
						var col=cols[_dragStartIdx];
						var cel=colEls[_dragStartIdx];
						hdr.insertBefore(cel, hdr.children[toIdx] || null);
						_syncColOrder();
						remapSortKeys();
						updateSort();
						_lastST=-2;render();
						updateStatus();
					}
				}
				_dragCol=null;
			}

			// Adminer 风格列头操作：fixed 浮层挂到 body，避免被 overflow:hidden 裁切
			var floatActs = null;
			var floatActsCol = -1;
			var floatActsCell = null;
			var floatHideTimer = null;

			function hideHeaderFloatActs() {
				if (floatHideTimer) {
					clearTimeout(floatHideTimer);
					floatHideTimer = null;
				}
				if (floatActs) floatActs.style.display = 'none';
				floatActsCol = -1;
				floatActsCell = null;
			}

			function scheduleHideHeaderFloatActs() {
				if (floatHideTimer) clearTimeout(floatHideTimer);
				floatHideTimer = setTimeout(hideHeaderFloatActs, 120);
			}

			function ensureHeaderFloatActs() {
				if (floatActs) return floatActs;
				floatActs = document.createElement('span');
				floatActs.className = 'xvr-th-acts xvr-th-acts-float';
				floatActs.style.display = 'none';
				var aDesc = document.createElement('a');
				aDesc.href = 'javascript:void(0)';
				aDesc.className = 'xvr-th-act xvr-th-act-desc';
				aDesc.title = vgT('table.headerSortDesc', '倒序');
				aDesc.textContent = '\u2193';
				aDesc.onclick = function (ev) {
					if (ev) {
						ev.preventDefault();
						ev.stopPropagation();
					}
					var idx = floatActsCol;
					hideHeaderFloatActs();
					if (editState) commitEdit();
					if (!sortable || idx < 0 || !_isSortableCol(idx)) return;
					sortKeys = [{ col: idx, dir: -1, field: _colField(idx) }];
					_syncLegacySort();
					runSortUI();
				};
				var aWhere = document.createElement('a');
				aWhere.href = 'javascript:void(0)';
				aWhere.className = 'xvr-th-act xvr-th-act-where';
				aWhere.title = vgT('table.headerWhere', '筛选到 WHERE');
				aWhere.textContent = '=';
				aWhere.onclick = function (ev) {
					if (ev) {
						ev.preventDefault();
						ev.stopPropagation();
					}
					var idx = floatActsCol;
					hideHeaderFloatActs();
					if (idx < 0) return;
					if (typeof opts.onHeaderWhere === 'function') {
						opts.onHeaderWhere(idx, cols[idx]);
					}
				};
				floatActs.appendChild(aDesc);
				floatActs.appendChild(aWhere);
				floatActs.onmouseenter = function () {
					if (floatHideTimer) {
						clearTimeout(floatHideTimer);
						floatHideTimer = null;
					}
				};
				floatActs.onmouseleave = function () {
					scheduleHideHeaderFloatActs();
				};
				document.body.appendChild(floatActs);
				return floatActs;
			}

			function positionHeaderFloatActs() {
				if (!floatActs || !floatActsCell || floatActs.style.display === 'none') return;
				var rect = floatActsCell.getBoundingClientRect();
				floatActs.style.left = (rect.left + rect.width / 2) + 'px';
				floatActs.style.top = rect.top + 'px';
			}

			function showHeaderFloatActs(colIdx, cellEl) {
				if (floatHideTimer) {
					clearTimeout(floatHideTimer);
					floatHideTimer = null;
				}
				if (!sortable || !_isSortableCol(colIdx) || !cellEl) {
					hideHeaderFloatActs();
					return;
				}
				ensureHeaderFloatActs();
				floatActsCol = colIdx;
				floatActsCell = cellEl;
				floatActs.style.display = 'inline-block';
				positionHeaderFloatActs();
			}

			function updateHeaderSort() {
				var i, j, cell, resizer, ch, next, mark, sk, titleBase, nameEl, markEl, labelEl, canAct;
				for (i = 0; i < colEls.length; i++) {
					mark = '';
					for (j = 0; j < sortKeys.length; j++) {
						if (sortKeys[j].col === i) {
							// 多列时加优先级序号：▲1 ▼2
							sk = sortKeys[j].dir === 1 ? ' ▲' : ' ▼';
							if (sortKeys.length > 1) sk += String(j + 1);
							mark = sk;
							break;
						}
					}
					titleBase = cols[i].t != null ? String(cols[i].t) : '';
					canAct = sortable && _isSortableCol(i);
					if (canAct) {
						if (mark) {
							colEls[i].title = titleBase + ' · 排序优先级 ' + (j + 1)
								+ (sortKeys[j].dir === 1 ? ' 正序' : ' 倒序')
								+ '（点击切换；悬停：倒序 / 筛选）';
						} else {
							colEls[i].title = titleBase + ' · 点击排序；悬停可倒序或填入 WHERE';
						}
					} else {
						colEls[i].title = titleBase;
					}
					cell = colEls[i];
					if (canAct) cell.classList.add('is-sortable');
					else cell.classList.remove('is-sortable');
					resizer = cell.querySelector('.xvr-col-resizer');
					ch = cell.firstChild;
					while (ch) {
						next = ch.nextSibling;
						if (!(ch.nodeType === 1 && ch.classList && ch.classList.contains('xvr-col-resizer'))) {
							cell.removeChild(ch);
						}
						ch = next;
					}
					labelEl = document.createElement('span');
					labelEl.className = 'xvr-th-label';
					nameEl = document.createElement('span');
					nameEl.className = 'xvr-th-name';
					nameEl.textContent = titleBase;
					labelEl.appendChild(nameEl);
					if (mark) {
						markEl = document.createElement('span');
						markEl.className = 'xvr-th-mark';
						markEl.textContent = mark;
						labelEl.appendChild(markEl);
					}
					if (resizer) cell.insertBefore(labelEl, resizer);
					else cell.appendChild(labelEl);
				}
				// 排序刷新后若浮层仍开着，跟住列头
				positionHeaderFloatActs();
			}
			_syncColOrder();
			updateHeaderSort();

			// ─── 表头裁剪层 + 表体滚动；横向 translateX 同步 ───
			var hdrClip = document.createElement('div');
			hdrClip.className = 'xvr-hdr-clip';
			hdrClip.style.cssText = 'flex-shrink:0;overflow:hidden;position:relative;width:100%;';
			hdrClip.appendChild(hdrWrap);
			el.appendChild(hdrClip);

			var sc = document.createElement('div');
			sc.className = 'xvr-sc';
			sc.tabIndex = -1;
			sc.style.cssText = 'flex:1;min-height:0;overflow:auto;position:relative;width:100%;';
			el.appendChild(sc);

			var body = document.createElement('div');
			body.className = 'xvr-body';
			body.style.cssText = 'position:relative;height:' + (TOTAL * ROW_H) + 'px;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;';
			sc.appendChild(body);

			var surface = document.createElement('div');
			surface.style.cssText = 'position:absolute;left:0;top:0;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;will-change:top;';
			body.appendChild(surface);

			function _syncHdrScroll() {
				hideHeaderFloatActs();
				hdrWrap.style.transform = 'translateX(' + (-sc.scrollLeft) + 'px)';
				var sbw = sc.offsetWidth - sc.clientWidth;
				if (sbw < 0) sbw = 0;
				hdrClip.style.paddingRight = sbw + 'px';
			}
			sc.addEventListener('scroll', _syncHdrScroll, false);
			setTimeout(_syncHdrScroll, 0);

			function setColumnWidth(idx, w) {
				if (idx < 0 || idx >= cols.length) return;
				w = Math.round(w);
				if (w < 40) w = 40;
				if (w > 480) w = 480;
				cols[idx].w = w;
				_totalColW = 0;
				var i;
				for (i = 0; i < cols.length; i++) _totalColW += (cols[i].w || 80);
				if (_totalColW < 100) _totalColW = 100;
				// 更新表头
				if (colEls[idx]) {
					colEls[idx].style.width = w + 'px';
					colEls[idx].style.minWidth = w + 'px';
				}
				// 更新筛选格
				if (filterInps[idx] && filterInps[idx].parentNode) {
					filterInps[idx].parentNode.style.width = w + 'px';
					filterInps[idx].parentNode.style.minWidth = w + 'px';
				}
				hdr.style.width = _totalColW + 'px';
				hdr.style.minWidth = _totalColW + 'px';
				hdrWrap.style.width = _totalColW + 'px';
				hdrWrap.style.minWidth = _totalColW + 'px';
				if (filterRowEl) {
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
				if (typeof body !== 'undefined' && body) {
					body.style.width = _totalColW + 'px';
					body.style.minWidth = _totalColW + 'px';
				}
				surface.style.width = _totalColW + 'px';
				surface.style.minWidth = _totalColW + 'px';
				_lastST = -2;
				render();
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			}


			var loadingEl = document.createElement('div');
			loadingEl.className = 'xvr-load';
			loadingEl.textContent = '排序中...';
			sc.appendChild(loadingEl);

			function showLoading() { loadingEl.style.display = 'flex'; }
			function hideLoading() { loadingEl.style.display = 'none'; }

			// ─── 右键菜单 ───
			var ctxMenu = null;
			if (contextMenuItems && contextMenuItems.length) {
				function _wrapCtxItems(items){
					var out=[];
					for(var ci=0;ci<items.length;ci++){
						var it=items[ci];
						if(it==='-'){
							out.push('-');
						}else if(typeof it==='string'){
							(function(txt){
								out.push({text:txt,handler:function(v,dom){
									if(onContextMenuItem) onContextMenuItem(v,dom);
								}});
							})(it);
						}else if(it.menu){
							out.push({text:it.text,icon:it.icon,menu:_wrapCtxItems(it.menu)});
						}else{
							out.push(it);
						}
					}
					return out;
				}
				ctxMenu = X.mk({xtype:'menu',contextMenu:true,menu:_wrapCtxItems(contextMenuItems)});
				el.appendChild(ctxMenu.el);
				sc.oncontextmenu = function(e) { e.preventDefault(); };
			}

			// ─── 状态栏：左统计（共N行+显示行+用时…）→ 全列搜索 →（弹性空白）→ 扩展槽/导出 ───
			var sb = null, sbL = null, sbTextEl = null, sbR = null, sbSearch = null, sbExtra = null;
			if (showStatusBar) {
				sb = document.createElement('div');
				sb.className = 'xvr-sb';
				sbL = document.createElement('span');
				sbL.className = 'xvr-sb-l';
				// 左下：筛选开关（仅 filterRow 启用时）—— 与统计文本分元素，避免 textContent 冲掉按钮
				if (enableFilterRow) {
					filterToggleBtn = document.createElement('button');
					filterToggleBtn.type = 'button';
					filterToggleBtn.className = 'xvr-filter-toggle' + (filterRowVisible ? ' is-on' : '');
					filterToggleBtn.innerHTML = '<i class="fa-solid fa-filter"></i><span>'
						+ vgT('grid.filter', '筛选') + '</span>';
					filterToggleBtn.onclick = function(e) {
						if (e) { e.preventDefault(); e.stopPropagation(); }
						setFilterRowVisible(!filterRowVisible);
						if (filterRowVisible) {
							// 聚焦第一个筛选输入
							var fi0, el0;
							for (fi0 = 0; fi0 < filterInps.length; fi0++) {
								el0 = filterInps[fi0];
								if (el0 && el0.tagName === 'INPUT') {
									try { el0.focus(); } catch (exF) { /* */ }
									break;
								}
							}
						}
					};
					sbL.appendChild(filterToggleBtn);
					syncFilterToggleBtn();
				}
				sbTextEl = document.createElement('span');
				sbTextEl.className = 'xvr-sb-text';
				sbL.appendChild(sbTextEl);
				// 紧挨统计右侧：全列搜索
				sbSearch = document.createElement('span');
				sbSearch.className = 'xvr-sb-search';
				sbSearch.innerHTML =
					'<label class="xvr-gsearch-label">' + vgT('grid.search', '搜索:') + '</label>' +
					'<input type="text" class="xvr-gsearch-inp" placeholder="'
						+ String(vgT('grid.searchPh', '全列关键字…')).replace(/"/g, '&quot;')
						+ '" autocomplete="off" spellcheck="false" />' +
					'<button type="button" class="xvr-gsearch-clear">'
						+ vgT('grid.searchCancel', '取消') + '</button>';
				globalSearchInp = sbSearch.querySelector('.xvr-gsearch-inp');
				var gClearBtn = sbSearch.querySelector('.xvr-gsearch-clear');
				globalSearchInp.oninput = function() {
					setGlobalSearch(globalSearchInp.value, false);
				};
				globalSearchInp.onkeydown = function(e) {
					e.stopPropagation();
					if (e.key === 'Escape') {
						e.preventDefault();
						clearGlobalSearch();
						globalSearchInp.blur();
					} else if (e.key === 'Enter') {
						e.preventDefault();
						setGlobalSearch(globalSearchInp.value, true);
					}
				};
				gClearBtn.onclick = function(e) {
					if (e) { e.preventDefault(); e.stopPropagation(); }
					clearGlobalSearch();
					try { globalSearchInp.focus(); } catch (ex) { /* */ }
				};
				// 扩展槽：宿主可挂导出等控件（靠右）
				sbExtra = document.createElement('span');
				sbExtra.className = 'xvr-sb-extra';
				// 可选右侧自定义文案（共 N 行已并入左侧统计，不再默认占用）
				sbR = document.createElement('span');
				sbR.className = 'xvr-sb-r';
				if (statusBarText) sbR.textContent = statusBarText;
				sb.appendChild(sbL);
				sb.appendChild(sbSearch);
				sb.appendChild(sbExtra);
				sb.appendChild(sbR);
				el.appendChild(sb);
			}

			// ══════════ 行内编辑 ══════════
			function startEdit(span, colIdx, dataIdx) {
				if (!editable) return;
				if (colIdx < 0 || colIdx >= cols.length) return;
				if (cols[colIdx].editable === false) return;
				if (editState) commitEdit();
				editState = { colIdx: colIdx, dataIdx: dataIdx };
				_attachInput(span, colIdx, dataIdx, true);
			}

			function setEditable(on) {
				editable = !!on;
				if (!editable && editState) {
					try { cancelEdit(); } catch (eEd) { /* */ }
				}
			}

			/** 统一识别编辑导航键（兼容 key / keyCode） */
			function _editNavKey(e) {
				var k = e.key, c = e.keyCode || e.which;
				if (k === 'Tab' || c === 9) return e.shiftKey ? 'ShiftTab' : 'Tab';
				if (k === 'Enter' || c === 13) return 'Enter';
				if (k === 'Escape' || c === 27) return 'Escape';
				if (k === 'ArrowUp' || c === 38) return 'Up';
				if (k === 'ArrowDown' || c === 40) return 'Down';
				if (k === 'ArrowLeft' || c === 37) return 'Left';
				if (k === 'ArrowRight' || c === 39) return 'Right';
				return null;
			}

			/** 列是否可进入编辑 */
			function _colEditable(cidx) {
				if (cidx < 0 || cidx >= cols.length) return false;
				var c = cols[cidx];
				if (!c) return false;
				if (c.editable === false) return false;
				if (c.is_select || c.field === '__sel__') return false;
				return true;
			}

			/**
			 * 从 (dataIdx, colIdx) 起沿 colDir(+1/-1) 找下一个可编辑列；
			 * 跨行时 wrap；找不到返回 null
			 */
			function _findNextEditCell(dataIdx, colIdx, colDir) {
				var vp = getVirtualPos(dataIdx);
				if (vp < 0) vp = dataIdx;
				var c = colIdx + colDir;
				var guard = 0, maxG = (TOTAL + 1) * (cols.length + 1);
				while (guard++ < maxG) {
					if (c >= cols.length) {
						vp++;
						if (vp >= TOTAL) return null;
						dataIdx = getDataIdx(vp);
						c = 0;
						continue;
					}
					if (c < 0) {
						vp--;
						if (vp < 0) return null;
						dataIdx = getDataIdx(vp);
						c = cols.length - 1;
						continue;
					}
					if (_colEditable(c)) {
						return { d: dataIdx, c: c };
					}
					c += colDir;
				}
				return null;
			}

			function _attachInput(span, colIdx, dataIdx, doFocus) {
				var col = cols[colIdx], raw = getCell(dataIdx, colIdx);
				span.textContent = '';
				span.className = 'xvr-ced';
				span.style.cssText = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left') + ';padding:0;overflow:visible;border-right:1px solid var(--x-border);';

				function bindEditNav(eInp, isCombo, ed, comboOrig) {
					eInp.onkeydown = function(e) {
						var nav = _editNavKey(e);
						if (!nav) {
							if (isCombo && comboOrig) comboOrig.call(ed, e);
							return;
						}
						// combo 下拉打开时：上下键先交给列表
						if (isCombo && ed && ed._opened && (nav === 'Up' || nav === 'Down')) {
							var oldHl = ed._highlight;
							if (comboOrig) comboOrig.call(ed, e);
							if (ed._highlight === oldHl) {
								e.preventDefault();
								e.stopPropagation();
								moveFromEdit(nav === 'Down' ? 1 : -1, 0);
							}
							return;
						}
						if (nav === 'Escape') {
							e.preventDefault();
							e.stopPropagation();
							if (isCombo && ed && ed._opened) { ed.collapse(); }
							if (editState) cancelEdit();
							return;
						}
						if (nav === 'Enter') {
							e.preventDefault();
							e.stopPropagation();
							if (isCombo && comboOrig) comboOrig.call(ed, e);
							// 提交并跳到下一可编辑格
							if (editState) moveFromEdit(0, 1);
							return;
						}
						if (nav === 'Tab' || nav === 'ShiftTab') {
							e.preventDefault();
							e.stopPropagation();
							if (editState) moveFromEdit(0, nav === 'ShiftTab' ? -1 : 1);
							return;
						}
						if (nav === 'Up') {
							e.preventDefault();
							e.stopPropagation();
							moveFromEdit(-1, 0);
							return;
						}
						if (nav === 'Down') {
							e.preventDefault();
							e.stopPropagation();
							moveFromEdit(1, 0);
							return;
						}
						// 左右：光标在边缘或全文选中时跳格，否则原生移动光标
						if (nav === 'Left' || nav === 'Right') {
							var ss = eInp.selectionStart, se = eInp.selectionEnd, len = (eInp.value || '').length;
							var allSel = (ss === 0 && se === len && len > 0);
							var atEdge = nav === 'Left'
								? (ss === 0 && se === 0) || allSel
								: (ss === len && se === len) || allSel;
							if (atEdge) {
								e.preventDefault();
								e.stopPropagation();
								moveFromEdit(0, nav === 'Left' ? -1 : 1);
							}
							return;
						}
					};
				}

				if (col.editor) {
					var ed = col.editor.xtype ? X.mk(col.editor) : col.editor;
					if (ed.setValue) ed.setValue(raw);
					span.appendChild(ed.el);
					editState._editor = ed;
					var eInp = ed.el.querySelector('input,textarea,select');
					if (!eInp) { eInp = ed.el; }
					if (doFocus) { setTimeout(function() { if (eInp) eInp.focus(); if (eInp && eInp.select) eInp.select(); if (ed.open) ed.open(); }, 0); }
					eInp.onblur = function(e) {
						if (_rendering || _suppressEditBlur) return;
						var rt = e.relatedTarget || document.activeElement;
						if (rt && ed.el.contains(rt)) return;
						// 编辑器中带有弹出层（如下拉框）时，点击滚动条或触发按钮不应停止编辑
						if (ed._opened) return;
						commitEdit();
					};
					var isCombo = (ed._allItems !== undefined);
					var comboOrig = isCombo ? eInp.onkeydown : null;
					bindEditNav(eInp, isCombo, ed, comboOrig);
				} else {
					var inp = document.createElement('input');
					inp.value = raw == null ? '' : String(raw);
					inp.style.cssText = 'width:100%;height:100%;border:none;padding:0 4px;font:inherit;background:var(--x-input-bg);outline:none;display:block;';
					span.appendChild(inp);
					if (doFocus) { inp.focus(); inp.select(); }
					inp.onblur = function() {
						if (_rendering || _suppressEditBlur) return;
						commitEdit();
					};
					bindEditNav(inp, false, null, null);
				}
			}

			function moveFromEdit(rowDir, colDir) {
				if (!editState) return;
				var curD = editState.dataIdx, curC = editState.colIdx;
				var target = null;

				if (colDir !== 0) {
					target = _findNextEditCell(curD, curC, colDir);
				} else if (rowDir !== 0) {
					var vp = getVirtualPos(curD), nvp = vp + rowDir;
					if (nvp < 0 || nvp >= TOTAL) return;
					var newD = getDataIdx(nvp);
					// 同行同列；若不可编辑则向右/左找
					if (_colEditable(curC)) {
						target = { d: newD, c: curC };
					} else {
						target = _findNextEditCell(newD, curC - 1, 1)
							|| _findNextEditCell(newD, curC + 1, -1);
					}
				}
				if (!target) return;

				_suppressEditBlur = true;
				try {
					commitEdit();
				} catch (exM) { /* */ }
				selAnchor = { d: target.d, c: target.c };
				selActive = { d: target.d, c: target.c };
				_ensureVisible(getVirtualPos(target.d));
				_pendingEdit = { d: target.d, c: target.c };
				_lastST = -2;
				render();
				// 下一帧再允许 blur，避免旧 input 的 blur 提交新格
				setTimeout(function () {
					_suppressEditBlur = false;
					// 若 render 时单元格尚未挂上，再试一次进编辑
					if (!editState && _pendingEdit == null && selActive) {
						var pec = surface.querySelector(
							'span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]'
						);
						if (pec && editable) startEdit(pec, selActive.c, selActive.d);
					}
				}, 0);
			}

			function commitEdit() {
				if (!editState) return;
				var didx = editState.dataIdx, cidx = editState.colIdx, col = cols[cidx];
				var raw = getCell(didx, cidx), newVal;
				if (editState._editor) {
					newVal = editState._editor.getValue ? editState._editor.getValue() : raw;
				} else {
					var cell = surface.querySelector('span[data-didx="' + didx + '"][data-col="' + cidx + '"]');
					var inp = cell ? cell.querySelector('input') : null;
					newVal = inp ? inp.value : raw;
				}
				if (col.parse) newVal = col.parse(newVal, raw);
				setCell(didx, cidx, newVal);
				editState = null;
				_restoreCell(didx, cidx);
			}

			function cancelEdit() {
				if (!editState) return;
				var didx = editState.dataIdx, cidx = editState.colIdx;
				editState = null;
				_ensureVisible(getVirtualPos(didx));
				_restoreCell(didx, cidx);
				_updateSelectionClasses();
				updateStatus();
			}

			function _restoreCell(dataIdx, colIdx) {
			var cell = surface.querySelector('span[data-didx="' + dataIdx + '"][data-col="' + colIdx + '"]');
			if (!cell) return;
			var col = cols[colIdx];
			var val = getCell(dataIdx, colIdx);
			var extraStyle = getCellStyle(dataIdx, colIdx, val);
			var extraCls = getCellClass(dataIdx, colIdx, val) || '';
			var cCls = extraCls;
			if (inSelection(dataIdx, colIdx)) cCls = (cCls ? cCls + ' ' : '') + 'xvr-sel';
			if (isActiveCell(dataIdx, colIdx)) cCls += ' xvr-act';
			cell.className = (cCls || '').replace(/^\s+/, '');
			cell.innerHTML = '';
			var stl = 'width:' + (col.w||80) + 'px;min-width:' + (col.w||80) + 'px;text-align:' + (col.a || 'left');
			if (extraStyle) stl += ';' + extraStyle;
			cell.style.cssText = stl;
			fillCellDisplay(cell, dataIdx, colIdx);
			}

			// ══════════ 文档级键盘/粘贴 ══════════
			// 仅当焦点在本表格内且不在筛选/搜索等普通输入框时接管，
			// 避免抢走 SQL 编辑器、WHERE 框、其它页签输入框的 Ctrl+V / 方向键等。
			function isNativeEditable(node) {
				if (!node || !node.tagName) return false;
				var tag = node.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
				if (node.isContentEditable) return true;
				return false;
			}
			/** 本表格是否应接管当前文档级快捷键/粘贴 */
			function shouldCaptureDocEvent() {
				if (!surface.isConnected) return false;
				var ae = document.activeElement;
				if (!ae || !el.contains(ae)) return false;
				// 单元格编辑中：粘贴需走块粘贴逻辑；keydown 在 onDocKeyDown 开头已 early-return
				if (editState) return true;
				// 表头筛选、底部搜索等 input：交给原生
				if (isNativeEditable(ae)) return false;
				return true;
			}
			function onDocKeyDown(e) {
				if (!surface.isConnected) return;
				if (editState) return;
				if (!shouldCaptureDocEvent()) return;
				if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
					if (selAnchor && selActive) { e.preventDefault(); copyBlock(); }
					return;
				}
				if (e.key === 'F2') {
					e.preventDefault();
					if (selActive) {
						var cell = surface.querySelector('span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]');
						if (cell) startEdit(cell, selActive.c, selActive.d);
					}
					return;
				}
				if (e.key === 'Tab') { e.preventDefault(); if (selActive) moveSelection(0, e.shiftKey ? -1 : 1); return; }
				if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelection(-1, 0, e.shiftKey); }
				if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelection(1, 0, e.shiftKey); }
				if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelection(0, -1, e.shiftKey); }
				if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1, e.shiftKey); }
				if (e.key === 'Enter') {
					e.preventDefault();
					if (selActive) {
						var cell = surface.querySelector('span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]');
						if (cell) startEdit(cell, selActive.c, selActive.d);
					}
				}
			}
			document.addEventListener('keydown', onDocKeyDown);

			// ══════════ 鼠标拖拽选区 ══════════
			function _cellFromPoint(clientX, clientY) {
				var el = document.elementFromPoint(clientX, clientY);
				if (el && el.tagName === 'SPAN' && el.dataset.didx !== undefined) {
					return { d: parseInt(el.dataset.didx, 10), c: parseInt(el.dataset.col, 10) };
				}
				// 回退：按坐标换算（需计入横向 scrollLeft，否则水平滚动后列命中偏左）
				var rect = sc.getBoundingClientRect();
				var y = clientY - rect.top + sc.scrollTop;
				var x = clientX - rect.left + sc.scrollLeft;
				if (y < 0 || y >= TOTAL * ROW_H || x < 0) return null;
				var vPos = Math.floor(y / ROW_H);
				if (vPos < 0 || vPos >= TOTAL) return null;
				var accX = 0, c = -1;
				for (var i = 0; i < cols.length; i++) {
					accX += (cols[i].w || 80);
					if (x < accX) { c = i; break; }
				}
				if (c === -1) return null;
				return { d: getDataIdx(vPos), c: c };
			}

			var _autoScrollTimer = null, _autoScrollDir = 0, _dragState = null;

			function _stopAutoScroll() {
				if (_autoScrollTimer) { clearInterval(_autoScrollTimer); _autoScrollTimer = null; }
				_autoScrollDir = 0;
			}
			function _startAutoScroll() {
				if (_autoScrollTimer) return;
				_autoScrollTimer = setInterval(function() {
					if (!_dragState || !_dragState.moved || _autoScrollDir === 0) return;
					sc.scrollTop += _autoScrollDir;
					var cell = _cellFromPoint(_dragState.lastX, _dragState.lastY);
					if (cell) {
						selAnchor = { d: _dragState.startD, c: _dragState.startC };
						selActive = { d: cell.d, c: cell.c };
						_renderSelection();
					}
				}, 16);
			}

			function onDocMouseMove(e) {
				if (!_dragState) return;
				_dragState.lastX = e.clientX; _dragState.lastY = e.clientY;
				var dx = e.clientX - _dragState.startX, dy = e.clientY - _dragState.startY;
				if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragState.moved = true;
				if (!_dragState.moved) return;
				var rect = sc.getBoundingClientRect(), margin = 30;
				if (e.clientY < rect.top + margin) { _autoScrollDir = -Math.ceil((rect.top + margin - e.clientY) / 3); _startAutoScroll(); }
				else if (e.clientY > rect.bottom - margin) { _autoScrollDir = Math.ceil((e.clientY - (rect.bottom - margin)) / 3); _startAutoScroll(); }
				else { _stopAutoScroll(); }
				var cell = _cellFromPoint(e.clientX, e.clientY);
				if (cell) { selAnchor = { d: _dragState.startD, c: _dragState.startC }; selActive = { d: cell.d, c: cell.c }; }
				_renderSelection();
			}

			function onDocMouseUp(e) {
				if (!_dragState) return;
				_stopAutoScroll();
				var st = _dragState; _dragState = null;
				if (!st.moved && !st.shiftKey) {
					var col0 = cols[st.startC];
					if (col0 && (col0.is_select || col0.field === '__sel__')) return;
					if (col0 && col0.editable === false && col0.xtype !== 'checkbox') return;
					// Ctrl/Cmd+点击：通知宿主进入修改模式后直接编辑该单元格
					var ctrlEdit = !!(st.ctrlKey || st.metaKey);
					if (ctrlEdit && typeof opts.onCtrlClickEdit === 'function') {
						try { opts.onCtrlClickEdit(st.startD, st.startC); } catch (exCtrl) { /* */ }
					}
					if (ctrlEdit || clicksToEdit === 1) {
						var cell = surface.querySelector('span[data-didx="' + st.startD + '"][data-col="' + st.startC + '"]');
						if (cell) startEdit(cell, st.startC, st.startD);
					}
				}
			}
			document.addEventListener('mousemove', onDocMouseMove);
			document.addEventListener('mouseup', onDocMouseUp);

			// ══════════ 块复制/粘贴 ══════════
			// 复制：按屏幕可见顺序（排序后的虚拟行序）从上到下、从左到右
			function copyBlock() {
				if (!selAnchor || !selActive) return;
				var vpA = getVirtualPos(selAnchor.d), vpB = getVirtualPos(selActive.d);
				if (vpA < 0) vpA = selAnchor.d;
				if (vpB < 0) vpB = selActive.d;
				var minVP = Math.min(vpA, vpB), maxVP = Math.max(vpA, vpB);
				var minC = Math.min(selAnchor.c, selActive.c), maxC = Math.max(selAnchor.c, selActive.c);
				var lines = [];
				for (var vp = minVP; vp <= maxVP; vp++) {
					var d = getDataIdx(vp);
					var parts = [];
					for (var c = minC; c <= maxC; c++) {
						// 跳过选择列（checkbox），避免把勾选状态写进剪贴板
						if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
						var raw = getCell(d, c);
						parts.push(raw == null ? '' : String(raw));
					}
					lines.push(parts.join('\t'));
				}
				var text = lines.join('\n');
				var ta = document.createElement('textarea');
				ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
				document.body.appendChild(ta); ta.focus(); ta.select();
				try { document.execCommand('copy'); } catch (err) {}
				document.body.removeChild(ta); sc.focus();
			}

			// 粘贴：从「当前活动单元格」起，向右、向下（按屏幕行序）写入
			// 不再用选区左上角 Math.min，避免从下方往上拖选后粘贴起点跑到顶部
			function _doPaste(text) {
				if (!text || !selActive) return;
				var rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
				if (rows.length && rows[rows.length - 1] === '') rows.pop();
				if (!rows.length) return;

				var startC = selActive.c;
				// 落在多选列上则改到第一个业务列
				if (cols[startC] && (cols[startC].is_select || cols[startC].field === '__sel__')) {
					startC = _firstEditableCol();
				}
				if (startC < 0) startC = Math.min(1, cols.length - 1);
				if (startC < 0) startC = 0;

				var startVP = getVirtualPos(selActive.d);
				if (startVP < 0) startVP = selActive.d;

				var endD = selActive.d, endC = startC;
				var firstD = getDataIdx(startVP);

				for (var r = 0; r < rows.length; r++) {
					var vp = startVP + r;
					if (vp >= TOTAL) break;
					var td = getDataIdx(vp);
					var cells = rows[r].split('\t');
					for (var c = 0; c < cells.length; c++) {
						var tc = startC + c;
						if (tc >= cols.length) break;
						// 列位置对齐：不可写列跳过写入，但剪贴板列下标仍与列一一对应
						if (cols[tc].editable === false && cols[tc].xtype !== 'checkbox') continue;
						var v = cells[c];
						if (cols[tc].xtype === 'checkbox') { v = (v !== '' && v !== '0' && v !== 'false') ? 1 : 0; }
						else if (cols[tc].parse) v = cols[tc].parse(v, getCell(td, tc));
						setCell(td, tc, v);
						endD = td;
						endC = tc;
					}
				}
				selAnchor = { d: firstD, c: startC };
				selActive = { d: endD, c: endC };
				_lastST = -2; render();
			}

			function onDocPaste(e) {
				if (!surface.isConnected) return;
				// 焦点在 SQL 编辑器等外部输入、或本表筛选/搜索框：不拦截
				if (!shouldCaptureDocEvent()) return;
				var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
				if (!text) return;
				// 编辑中：多行/多列块粘贴时退出编辑，按活动格向下粘贴；单行无 tab 则交给 input
				if (editState) {
					if (text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
						e.preventDefault();
						// 丢弃未提交的编辑内容，以活动格为原点块粘贴
						var ad = editState.dataIdx, ac = editState.colIdx;
						cancelEdit();
						selAnchor = { d: ad, c: ac };
						selActive = { d: ad, c: ac };
						_doPaste(text);
					}
					return;
				}
				if (!selActive) return;
				e.preventDefault();
				_doPaste(text);
			}
			document.addEventListener('paste', onDocPaste);

			// ══════════ 核心渲染 ══════════
			var _rafPending = false, _lastST = -1, _rendering = false, _selRender = false;

			function render() {
				// 仅选择变化时跳过 DOM 重建
				if (_selRender) {
					_selRender = false;
					_updateSelectionClasses();
					updateStatus();
					return;
				}
				var editStillVisible = false;
				if (editState) {
					var st0 = sc.scrollTop, vh0 = sc.clientHeight;
					var fr0 = Math.floor(st0 / ROW_H), vr0 = Math.ceil(vh0 / ROW_H) + 1;
					var s0 = Math.max(0, fr0 - BUFFER), e0 = Math.min(TOTAL, fr0 + vr0 + BUFFER);
					if (sortIdx) { for (var t = s0; t < e0; t++) { if (sortIdx[t] === editState.dataIdx) { editStillVisible = true; break; } } }
					else { editStillVisible = (editState.dataIdx >= s0 && editState.dataIdx < e0); }
				}
				var st = sc.scrollTop;
				if (st === _lastST) { _rafPending = false; return; }
				_lastST = st;
				var vh = sc.clientHeight;
				if (vh === 0) { _rafPending = false; return; }
				var firstRow = Math.floor(st / ROW_H);
				var visibleRows = Math.ceil(vh / ROW_H) + 1;
				var start = Math.max(0, firstRow - BUFFER);
				var end = Math.min(TOTAL, firstRow + visibleRows + BUFFER);
				var count = end - start;

				var savedEditValue = null;
				if (editStillVisible && editState) {
					var oe = surface.querySelector('span[data-didx="' + editState.dataIdx + '"][data-col="' + editState.colIdx + '"]');
					if (oe) { var oi = oe.querySelector('input'); if (oi) savedEditValue = oi.value; }
				}

				surface.style.top = (start * ROW_H) + 'px';
				var frag = document.createDocumentFragment();

				for (var i = 0; i < count; i++) {
					var ri = start + i, dataIdx = getDataIdx(ri);
					var row = document.createElement('div');
					var rowCls = 'xvr-row', extCls = getRowClass(dataIdx, ri);
					if (extCls) rowCls += ' ' + extCls;
					row.className = rowCls; row.dataset.didx = dataIdx;
					for (var j = 0; j < cols.length; j++) {
						var col = cols[j], val = getCell(dataIdx, j);
						var cCls = '', extraStyle = getCellStyle(dataIdx, j, val), extraCls = getCellClass(dataIdx, j, val);
						var stl = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left');
						if (extraStyle) stl += ';' + extraStyle;
						if (inSelection(dataIdx, j)) cCls = 'xvr-sel';
						if (isActiveCell(dataIdx, j)) cCls += ' xvr-act';
						if (extraCls) cCls += ' ' + extraCls;
						var span = document.createElement('span');
						span.className = cCls;
						span.dataset.ri = ri;
						span.dataset.col = j;
						span.dataset.didx = dataIdx;
						span.style.cssText = stl;
						fillCellDisplay(span, dataIdx, j);
						row.appendChild(span);
					}
					var chkInps = row.querySelectorAll('input[type=checkbox]');
					for (var ci = 0; ci < chkInps.length; ci++) {
						(function(inp) {
							inp.onchange = function(e) {
								e.stopPropagation();
								var sp = inp.closest('span');
								if (!sp) return;
								var d = parseInt(sp.dataset.didx), c = parseInt(sp.dataset.col);
								setCell(d, c, inp.checked ? 1 : 0);
								selAnchor = { d: d, c: c }; selActive = { d: d, c: c };
								_lastST = -2; render();
							};
						})(chkInps[ci]);
					}
					var spans = row.querySelectorAll('span');
					for (var j = 0; j < spans.length; j++) {
						(function(sp) {
							sp.onmousedown = function(e) {
								if (e.button !== 0) return;
								if (e.target.tagName === 'INPUT') return;
								// Click inside the active editor (combo popup, scrollbar, etc.) — let the editor handle it, do not commit
								if (editState && editState._editor && editState._editor.el && editState._editor.el.contains(e.target)) return;
								e.preventDefault(); sc.focus();
								if (editState) commitEdit();
								var c = parseInt(sp.dataset.col), d = parseInt(sp.dataset.didx);
								if (e.shiftKey && selAnchor) { selActive = { d: d, c: c }; }
								else { selAnchor = { d: d, c: c }; selActive = { d: d, c: c }; }
								_dragState = {
									startX: e.clientX, startY: e.clientY,
									startD: d, startC: c,
									moved: false,
									shiftKey: e.shiftKey,
									ctrlKey: !!e.ctrlKey,
									metaKey: !!e.metaKey,
									lastX: e.clientX, lastY: e.clientY
								};
								_renderSelection();
							};
							if (ctxMenu) {
								sp.oncontextmenu = function(e) {
									e.preventDefault();
									if (e.target.tagName === 'INPUT') return;
									sc.focus(); if (editState) commitEdit();
									var c = parseInt(sp.dataset.col), d = parseInt(sp.dataset.didx);
									selAnchor = { d: d, c: c }; selActive = { d: d, c: c };
									_dragState = null; _renderSelection();
									ctxMenu.showAt(e.clientX, e.clientY);
								};
							}
						})(spans[j]);
						if(clicksToEdit===2){
							(function(sp){
								sp.ondblclick=function(e){
									e.preventDefault();
									if(e.target.tagName==='INPUT')return;
									if(editState&&editState._editor&&editState._editor.el&&editState._editor.el.contains(e.target))return;
									sc.focus();if(editState)commitEdit();
									var c=parseInt(sp.dataset.col),d=parseInt(sp.dataset.didx);
									selAnchor={d:d,c:c};selActive={d:d,c:c};
									_dragState=null;_renderSelection();
									startEdit(sp,c,d);
								};
							})(spans[j]);
						}
					}
					frag.appendChild(row);
				}

				_rendering = true;
				var savedST = sc.scrollTop;
				surface.innerHTML = '';
				surface.appendChild(frag);

				if (editStillVisible && editState) {
					var nc = surface.querySelector('span[data-didx="' + editState.dataIdx + '"][data-col="' + editState.colIdx + '"]');
					if (nc) {
						if (savedEditValue !== null) setCell(editState.dataIdx, editState.colIdx, savedEditValue);
						_attachInput(nc, editState.colIdx, editState.dataIdx, false);
					} else { editState = null; }
				} else if (editState && !editStillVisible) { commitEdit(); }

				if (_pendingEdit) {
					var pe = _pendingEdit; _pendingEdit = null;
					if (!editState) {
						var pec = surface.querySelector('span[data-didx="' + pe.d + '"][data-col="' + pe.c + '"]');
						if (pec) {
							startEdit(pec, pe.c, pe.d);
						} else {
							// 虚拟滚动尚未画出目标格：保留一次重试
							_pendingEdit = pe;
							setTimeout(function () {
								if (editState || !_pendingEdit) return;
								var pe2 = _pendingEdit; _pendingEdit = null;
								var pec2 = surface.querySelector('span[data-didx="' + pe2.d + '"][data-col="' + pe2.c + '"]');
								if (pec2 && editable) startEdit(pec2, pe2.c, pe2.d);
							}, 30);
						}
					}
				}
				_rendering = false;
				sc.scrollTop = savedST;
				_rafPending = false;
				updateStatus();
			}

			function formatElapsedMs(ms) {
				if (ms == null || ms === '') return '';
				var n = Number(ms);
				if (isNaN(n) || n < 0) return '';
				// 整数 ms；≥1000 可带一位小数秒感，仍统一 ms 便于对照 SQL 页
				var s = (Math.round(n) === n) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1);
				return vgT('grid.elapsed', '用时 {ms} ms', { ms: s });
			}

			function updateStatus() {
				if (!sb || !sbL) return;
				var st = sc.scrollTop;
				var first = TOTAL > 0 ? Math.min(TOTAL, Math.floor(st / ROW_H) + 1) : 0;
				var last = TOTAL > 0 ? Math.min(TOTAL, Math.ceil((st + sc.clientHeight) / ROW_H)) : 0;
				// 共 N 行 + 显示行合并到左侧
				var sbText = vgT('grid.rows', '共 {n} 行', { n: TOTAL.toLocaleString() })
					+ ' | ' + vgT('grid.displayRows', '显示行: {first} - {last}', {
						first: first.toLocaleString(),
						last: last.toLocaleString()
					});
				var elTxt = formatElapsedMs(elapsedMs);
				if (elTxt) sbText += ' | ' + elTxt;
				if (selActive && selActive.c >= 0 && selActive.c < cols.length) {
					var vpSa = getVirtualPos(selAnchor.d), vpSb = getVirtualPos(selActive.d);
					if (vpSa < 0) vpSa = selAnchor.d;
					if (vpSb < 0) vpSb = selActive.d;
					var minVP = Math.min(vpSa, vpSb), maxVP = Math.max(vpSa, vpSb);
					var minC = Math.min(selAnchor.c, selActive.c);
					var maxC = Math.max(selAnchor.c, selActive.c);
					var rowCount = maxVP - minVP + 1;
					var colCount = maxC - minC + 1;
					sbText += ' | ' + vgT('grid.select', '选择: {r}x{c}', { r: rowCount, c: colCount });
					var allNumeric = true;
					var sum = 0;
					var numericCount = 0;
					for (var svp = minVP; svp <= maxVP; svp++) {
						var sd = getDataIdx(svp);
						for (var sc2 = minC; sc2 <= maxC; sc2++) {
							var cv = getCell(sd, sc2);
							var cs = cv != null ? String(cv).trim() : '';
							if (cs !== '') {
								var cn = parseFloat(cs);
								if (isNaN(cn)) {
									allNumeric = false;
								} else {
									sum += cn;
									numericCount++;
								}
							}
						}
					}
					if (allNumeric && numericCount > 0) {
						var avg = sum / numericCount;
						var sumStr = (Math.abs(sum - Math.floor(sum)) < 1e-10 ? Math.floor(sum).toLocaleString() : sum.toLocaleString());
						var avgStr = (Math.abs(avg - Math.round(avg * 100) / 100) < 1e-10 ? avg.toLocaleString() : avg.toFixed(2).replace(/\.?0+$/, ''));
						sbText += ' \u00A0\u00A0' + vgT('grid.sum', '合计: {n}', { n: sumStr })
							+ ' \u00A0\u00A0' + vgT('grid.avg', '平均: {n}', { n: avgStr });
					}
				}
				if (editState) sbText += ' | ' + vgT('grid.editing', '编辑中');
				if (hasActiveColFilter()) {
					sbText += ' | ' + vgT('grid.filterStat', '筛选: {shown}/{total} 行', {
						shown: TOTAL.toLocaleString(),
						total: dataArr.length.toLocaleString()
					});
					if (globalSearch && String(globalSearch).trim()) {
						sbText += ' · ' + vgT('grid.globalQ', '全列:"{q}"', { q: String(globalSearch).trim() });
					}
				}
				if (sbSearch) {
					if (globalSearch && String(globalSearch).trim()) sbSearch.classList.add('is-on');
					else sbSearch.classList.remove('is-on');
				}
				if (sortKeys.length) {
					var sp = [], si;
					for (si = 0; si < sortKeys.length; si++) {
						var scCol = cols[sortKeys[si].col];
						sp.push((scCol && scCol.t != null ? scCol.t : ('#' + sortKeys[si].col))
							+ (sortKeys[si].dir === 1 ? '↑' : '↓'));
					}
					sbText += ' | ' + vgT('grid.sort', '排序: {list}', { list: sp.join(', ') });
				}
				if (sbTextEl) sbTextEl.textContent = sbText;
				else if (sbL) sbL.textContent = sbText;
				// 右侧仅保留自定义 statusBarText；空则隐藏
				if (sbR && !statusBarText) {
					sbR.textContent = '';
				}
			}

			// 仅更新选中类名（不重建 DOM）
			function _updateSelectionClasses() {
				var spans = surface.querySelectorAll('span[data-didx]');
				for (var i = 0; i < spans.length; i++) {
					var sp = spans[i];
					var d = parseInt(sp.dataset.didx), c = parseInt(sp.dataset.col);
					var sel = inSelection(d, c);
					var act = isActiveCell(d, c);
					if (sel) sp.classList.add('xvr-sel');
					else sp.classList.remove('xvr-sel');
					if (act) sp.classList.add('xvr-act');
					else sp.classList.remove('xvr-act');
				}
			}

			// 仅选择变化时调用（轻量更新）
			function _renderSelection() {
				_selRender = true;
				render();
			}

			// 滚动事件（rAF 节流）
			sc.onscroll = function() { if (!_rafPending) { _rafPending = true; requestAnimationFrame(render); } };

			// ══════════ 窗口自适应 ══════════
			var _resizeTimer = null;
			function onResize() {
				hideHeaderFloatActs();
				if (_resizeTimer) clearTimeout(_resizeTimer);
				_resizeTimer = setTimeout(function() { _lastST = -2; render(); }, 200);
			}
			window.addEventListener('resize', onResize);

			// ══════════ 初始渲染 ══════════
			function initRender() {
				var vh = sc.clientHeight;
				if (vh > 0) { render(); updateStatus(); }
				else { setTimeout(initRender, 16); }
			}
			setTimeout(initRender, 16);

			// ══════════ 自动插入容器 ══════════
			if (container) container.appendChild(el);

			// ══════════ 返回 API ══════════

			var api = {
				data: dataArr,
				onCellValueChange: opts.onCellValueChange || null,
				el: el,
				destroy: function() {
					hideHeaderFloatActs();
					if (floatActs && floatActs.parentNode) {
						floatActs.parentNode.removeChild(floatActs);
						floatActs = null;
					}
					_stopAutoScroll();
					window.removeEventListener('resize', onResize);
					if (_resizeTimer) clearTimeout(_resizeTimer);
					document.removeEventListener('keydown', onDocKeyDown);
					document.removeEventListener('mousemove', onDocMouseMove);
					document.removeEventListener('mouseup', onDocMouseUp);
					document.removeEventListener('paste', onDocPaste);
					document.removeEventListener('mousemove', _onColDragMove);
					document.removeEventListener('mouseup', _onColDragUp);
					if(_dragProxy&&_dragProxy.parentNode)_dragProxy.parentNode.removeChild(_dragProxy);
				},
				refresh: function(preserveScroll) {
				var _ks = sc.scrollLeft, _kt = sc.scrollTop;
				_lastST = -2;
				render();
				if (preserveScroll) { sc.scrollLeft = _ks; sc.scrollTop = _kt; }
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			},
			forceRender: function() {
				var _ks = sc.scrollLeft, _kt = sc.scrollTop;
				_lastST = -2;
				render();
				sc.scrollLeft = _ks; sc.scrollTop = _kt;
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			},
			setColumnWidth: setColumnWidth,
				getSelection: function() {
					if (!selActive) return null;
					return { anchor: selAnchor ? { row: selAnchor.d, col: selAnchor.c } : null, active: { row: selActive.d, col: selActive.c } };
				},
				setSelection: function(row, col) {
					selAnchor = { d: row, c: col }; selActive = { d: row, c: col };
					_ensureVisible(getVirtualPos(row)); _renderSelection();
				},
				clearSelection: function() { selAnchor = null; selActive = null; _renderSelection(); },
				scrollTo: function(row) { var vp = getVirtualPos(row); if (vp >= 0) sc.scrollTop = vp * ROW_H; },
				/** 当前排序；无排序 null。含 keys[] 多列；并保留首关键字 col/field/name/dir 兼容 */
				getSort: function() {
					if (!sortKeys.length) return null;
					var keys = [], i, c, k;
					for (i = 0; i < sortKeys.length; i++) {
						k = sortKeys[i];
						c = cols[k.col];
						keys.push({
							col: k.col,
							field: c && c.field != null ? c.field : k.col,
							name: c ? (c.name != null ? c.name : c.t) : null,
							dir: k.dir
						});
					}
					return {
						keys: keys,
						col: keys[0].col,
						field: keys[0].field,
						name: keys[0].name,
						dir: keys[0].dir
					};
				},
				/**
				 * 恢复排序。
				 * - 多列：{ keys:[{field|name|col, dir}, ...] }
				 * - 单列：{ col?, field?, name?, dir }
				 */
				setSort: function(spec) {
					if (!spec || !sortable) return false;
					function resolveCol(item) {
						var idx = -1, i, col, fStr, nStr;
						if (!item) return -1;
						if (item.field != null || item.name != null) {
							fStr = item.field != null ? String(item.field) : null;
							nStr = item.name != null ? String(item.name) : null;
							for (i = 0; i < cols.length; i++) {
								col = cols[i];
								if (col.is_select || col.field === '__sel__') continue;
								// field 可能是数字下标，name/t 为列名
								if (fStr != null) {
									if (String(col.field) === fStr || String(col.name) === fStr || String(col.t) === fStr) {
										idx = i; break;
									}
								}
								if (nStr != null) {
									if (String(col.name) === nStr || String(col.t) === nStr || String(col.field) === nStr) {
										idx = i; break;
									}
								}
							}
						}
						if (idx < 0 && item.col != null && item.col >= 0 && item.col < cols.length) idx = item.col;
						return idx;
					}
					var next = [], list, li, idx, dir;
					if (spec.keys && spec.keys.length) {
						list = spec.keys;
					} else {
						list = [spec];
					}
					for (li = 0; li < list.length; li++) {
						idx = resolveCol(list[li]);
						if (idx < 0 || !_isSortableCol(idx)) continue;
						// 去重：同列只保留最后一次
						for (var di = next.length - 1; di >= 0; di--) {
							if (next[di].col === idx) next.splice(di, 1);
						}
						dir = list[li].dir === -1 ? -1 : 1;
						next.push({ col: idx, dir: dir, field: _colField(idx) });
					}
					if (!next.length) return false;
					sortKeys = next;
					_syncLegacySort();
					updateSort();
					if (typeof updateHeaderSort === 'function') updateHeaderSort();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
					return true;
				},
				clearSort: function() {
					clearSort();
					if (typeof updateHeaderSort === 'function') updateHeaderSort();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
				},
				commitEdit: commitEdit,
				cancelEdit: cancelEdit,
				setEditable: setEditable,
				/** 列内筛选值：{ field|col: string } */
				getColFilters: function() {
					var out = {}, i, col, key;
					for (i = 0; i < cols.length; i++) {
						if (!colFilterVals[i] || String(colFilterVals[i]).trim() === '') continue;
						col = cols[i];
						if (col && (col.is_select || col.field === '__sel__')) continue;
						key = col && col.name != null ? col.name : (col && col.field != null ? col.field : i);
						out[String(key)] = String(colFilterVals[i]);
					}
					return out;
				},
				setColFilters: function(map) {
					if (!map || typeof map !== 'object') return false;
					var i, col, key, val, hit;
					for (i = 0; i < cols.length; i++) {
						col = cols[i];
						if (col && (col.is_select || col.field === '__sel__')) continue;
						val = '';
						hit = false;
						if (col && col.name != null && map[col.name] != null) { val = map[col.name]; hit = true; }
						else if (col && col.field != null && map[col.field] != null) { val = map[col.field]; hit = true; }
						else if (col && col.t != null && map[col.t] != null) { val = map[col.t]; hit = true; }
						else if (map[String(i)] != null) { val = map[String(i)]; hit = true; }
						if (!hit) continue;
						colFilterVals[i] = val == null ? '' : String(val);
						if (filterInps[i] && filterInps[i].tagName === 'INPUT') {
							filterInps[i].value = colFilterVals[i];
						}
					}
					applyColFiltersFromInputs(true);
					return true;
				},
				clearColFilters: clearAllColFilters,
				setFilterRowVisible: setFilterRowVisible,
				isFilterRowVisible: function() { return !!filterRowVisible; },
				getGlobalSearch: function() { return globalSearch; },
				setGlobalSearch: function(q) { setGlobalSearch(q, true); },
				clearGlobalSearch: clearGlobalSearch,
				/** 状态栏右侧扩展槽（导出等），无状态栏时为 null */
				getStatusBarExtra: function() { return sbExtra; },
				/** 设置查询用时（ms），null 清除；立即刷新底栏 */
				setElapsedMs: function(ms) {
					if (ms == null || ms === '') elapsedMs = null;
					else {
						var n = Number(ms);
						elapsedMs = isNaN(n) ? null : n;
					}
					updateStatus();
				},
				getElapsedMs: function() { return elapsedMs; }
			};
			return api;
		};
	}

	// ─── X.mbox / X.confirm / X.prompt ─── 常用消息弹窗
