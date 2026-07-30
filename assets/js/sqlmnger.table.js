/**
 * sqlmnger 表格数据协议 + VirtualGrid 封装（IIFE）
 *
 * - columns[] + rows[][]
 * - 加载时按内容自动列宽（有上下限，避免省略号 / 超宽）
 * - 列头可拖拽调宽（依赖 X.Grid setColumnWidth）
 */
window.SqlmngerTable = (function () {
	var t = {
		normalizePayload: normalizePayload,
		autoFitColumns: autoFitColumns,
		bindGrid: bindGrid,
		loadAndBind: loadAndBind,
		destroyGrid: destroyGrid,
		// 默认列宽策略
		defaults: {
			minColWidth: 48,
			maxColWidth: 280,
			pad: 28,
			sampleRows: 120,
			selectColWidth: 40,
			font: ''
		}
	};
	return t;

	function normalizePayload(data) {
		var columns = (data && data.columns) ? data.columns : [];
		var rows = (data && data.rows) ? data.rows : [];
		var total = data && data.total != null ? data.total : rows.length;
		var i, c;
		for (i = 0; i < columns.length; i++) {
			c = columns[i];
			if (c.field == null) c.field = i;
			if (c.t == null && c.title != null) c.t = c.title;
			if (c.t == null && c.text != null) c.t = c.text;
		}
		return { columns: columns, rows: rows, total: total };
	}

	/**
	 * 按表头 + 采样单元格内容测算列宽，限制在 [min, max]
	 * @param {Array} columns
	 * @param {Array} rows
	 * @param {object} [opt]
	 */
	function autoFitColumns(columns, rows, opt) {
		opt = opt || {};
		var minW = opt.minColWidth != null ? opt.minColWidth : t.defaults.minColWidth;
		var maxW = opt.maxColWidth != null ? opt.maxColWidth : t.defaults.maxColWidth;
		var pad = opt.pad != null ? opt.pad : t.defaults.pad;
		var sampleN = opt.sampleRows != null ? opt.sampleRows : t.defaults.sampleRows;
		var selW = opt.selectColWidth != null ? opt.selectColWidth : t.defaults.selectColWidth;

		var measure = createMeasurer(opt.font);
		var i, j, col, f, w, text, n, v, row;

		n = Math.min(rows ? rows.length : 0, sampleN);
		for (i = 0; i < columns.length; i++) {
			col = columns[i];
			// 多选列固定宽
			if (col.is_select || col.field === '__sel__') {
				col.w = selW;
				continue;
			}
			// 用户已锁定宽度
			if (col.fixedWidth) {
				col.w = clamp(parseInt(col.w, 10) || minW, minW, maxW);
				continue;
			}

			text = col.t != null ? String(col.t) : (col.name != null ? String(col.name) : '');
			w = measure(text) + pad + 12; // 表头多留排序箭头/拖拽区

			f = col.field != null ? col.field : i;
			for (j = 0; j < n; j++) {
				row = rows[j];
				if (!row) continue;
				v = row[f];
				if (v == null) continue;
				if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
					text = String(v);
				} else {
					try { text = JSON.stringify(v); } catch (e) { text = String(v); }
				}
				// 过长只测前 80 字符（性能）
				if (text.length > 80) text = text.slice(0, 80);
				w = Math.max(w, measure(text) + pad);
			}

			// 类型启发：整型略收窄下限
			if (col.type && /int|bool|bit/i.test(String(col.type))) {
				w = Math.min(w, Math.max(minW, 90));
			}

			col.w = clamp(Math.ceil(w), minW, maxW);
		}
		return columns;
	}

	function createMeasurer(fontSpec) {
		var font = fontSpec || t.defaults.font;
		if (!font) {
			try {
				var cs = window.getComputedStyle(document.body);
				font = (cs.fontSize || '13px') + ' ' + (cs.fontFamily || 'sans-serif');
			} catch (e) {
				font = '13px sans-serif';
			}
		}
		// canvas 测量（快）
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext && canvas.getContext('2d');
		if (ctx) {
			ctx.font = font;
			return function (str) {
				if (str == null || str === '') return 0;
				return ctx.measureText(String(str)).width;
			};
		}
		// 回退：近似字符宽度
		return function (str) {
			if (str == null || str === '') return 0;
			var s = String(str);
			var w = 0, k, ch;
			for (k = 0; k < s.length; k++) {
				ch = s.charCodeAt(k);
				w += ch > 255 ? 13 : 7.5;
			}
			return w;
		};
	}

	function clamp(v, a, b) {
		if (v < a) return a;
		if (v > b) return b;
		return v;
	}

	/**
	 * @param {HTMLElement} container
	 * @param {{columns:Array, rows:Array, total:number}} payload
	 * @param {object} [opts]
	 *   autoFit: true|false (default true)
	 *   minColWidth, maxColWidth, sampleRows
	 */
	function bindGrid(container, payload, opts) {
		opts = opts || {};
		var n = normalizePayload(payload);
		var cols = n.columns.slice();
		var rows = n.rows;

		var doFit = opts.autoFit !== false;
		if (doFit) {
			autoFitColumns(cols, rows, {
				minColWidth: opts.minColWidth,
				maxColWidth: opts.maxColWidth,
				sampleRows: opts.sampleRows,
				pad: opts.pad,
				selectColWidth: opts.selectColWidth
			});
		} else {
			var ci, col;
			for (ci = 0; ci < cols.length; ci++) {
				col = cols[ci];
				col.w = parseInt(col.w, 10);
				if (!col.w || col.w < 40) col.w = 100;
			}
		}

		var cfg = {
			container: container,
			columns: cols,
			data: rows,
			total: n.total,
			rowHeight: 28,
			buffer: 15,
			editable: false,
			sortable: true,
			toolbar: true,
			statusBar: true,
			toolbarText: (window.SqlmngerI18n && SqlmngerI18n.t)
				? SqlmngerI18n.t('grid.rows', { n: n.total })
				: ('共 ' + n.total + ' 行'),
			getRowClass: function (r, vp) {
				return (vp & 1) === 1 ? 'alt' : '';
			}
		};
		var k;
		for (k in opts) {
			if (!Object.prototype.hasOwnProperty.call(opts, k)) continue;
			// 这些仅用于 autoFit，不传给 Grid
			if (k === 'autoFit' || k === 'minColWidth' || k === 'maxColWidth' ||
				k === 'sampleRows' || k === 'pad' || k === 'selectColWidth') {
				continue;
			}
			cfg[k] = opts[k];
		}

		if (typeof X === 'undefined' || !X.Grid) {
			throw new Error('X.Grid（virtualgrid）未加载，请先引入 xui/core.js');
		}
		var grid = X.Grid(cfg);
		if (opts.onCellValueChange) {
			grid.onCellValueChange = opts.onCellValueChange;
		}
		// 暴露当前列定义（含自适应后的宽度）
		grid.columns = cols;
		return grid;
	}

	function loadAndBind(container, apiPath, body, gridOpts) {
		return SqlmngerApi.post(apiPath, body || {}).then(function (env) {
			return bindGrid(container, env.data, gridOpts);
		});
	}

	function destroyGrid(grid) {
		if (grid && typeof grid.destroy === 'function') grid.destroy();
	}
})();
