/**
 * 可输入过滤下拉（IIFE）
 * SqlmngerCombo.mount({ el, items, value, placeholder, onChange, filterKeys? })
 * items: string[] 或 { value, label }[]
 */
window.SqlmngerCombo = (function () {
	var t = {
		mount: mount
	};
	return t;

	function mount(opts) {
		opts = opts || {};
		var host = opts.el;
		if (!host) throw new Error('SqlmngerCombo: el required');

		var items = normalizeItems(opts.items || []);
		var value = opts.value != null ? String(opts.value) : '';
		var placeholder = opts.placeholder || '';
		var allowCustom = !!opts.allowCustom; // 允许列表外自定义值（如 varchar(360)）
		var onChange = opts.onChange || function () { };

		host.innerHTML = '';
		host.className = (host.className ? host.className + ' ' : '') + 'sqlmnger-combo';

		var wrap = document.createElement('div');
		wrap.className = 'sqlmnger-combo-inner';
		wrap.innerHTML =
			'<input type="text" class="sqlmnger-combo-input" autocomplete="off" />' +
			'<button type="button" class="sqlmnger-combo-caret" tabindex="-1">▾</button>' +
			'<ul class="sqlmnger-combo-list" style="display:none"></ul>';
		host.appendChild(wrap);

		var input = wrap.querySelector('.sqlmnger-combo-input');
		var list = wrap.querySelector('.sqlmnger-combo-list');
		var caret = wrap.querySelector('.sqlmnger-combo-caret');
		input.placeholder = placeholder;

		var open = false;
		var hi = -1;
		var filtered = items.slice();
		// 仅在用户输入后才按内容过滤；刚打开下拉时显示全部
		var filtering = false;

		function labelOf(v) {
			var i;
			for (i = 0; i < items.length; i++) {
				if (items[i].value === v) return items[i].label;
			}
			return v;
		}

		// value 可能为 "0" / "''"，不能用 if (value) 判断
		if (value !== '') {
			input.value = labelOf(value);
		}

		function setItems(next) {
			items = normalizeItems(next || []);
			// 打开中且正在输入时才按当前输入过滤
			renderList(filtering && open ? input.value : '');
		}

		function setValue(v, silent) {
			// 注意：value 可能是 "0" 或 "''"（空串字面量），不能用真假判断
			value = v != null ? String(v) : '';
			if (value === '') {
				input.value = '';
			} else {
				input.value = labelOf(value);
			}
			filtering = false;
			if (!silent) onChange(value);
		}

		function getValue() {
			return value;
		}

		function normalizeItems(arr) {
			var out = [];
			var i, it;
			for (i = 0; i < arr.length; i++) {
				it = arr[i];
				if (it == null) continue;
				if (typeof it === 'string' || typeof it === 'number') {
					out.push({ value: String(it), label: String(it) });
				} else {
					out.push({
						value: String(it.value != null ? it.value : it.label),
						label: String(it.label != null ? it.label : it.value)
					});
				}
			}
			return out;
		}

		function escapeHtml(s) {
			return String(s == null ? '' : s)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		}

		/** 高亮 label 中与 q 匹配的片段（大小写不敏感，全部出现） */
		function highlightLabel(label, q) {
			label = String(label == null ? '' : label);
			q = String(q == null ? '' : q);
			if (!q) return escapeHtml(label);
			var lower = label.toLowerCase();
			var ql = q.toLowerCase();
			var out = '';
			var last = 0;
			var i = lower.indexOf(ql);
			var qLen = q.length;
			if (i < 0) return escapeHtml(label);
			while (i >= 0) {
				out += escapeHtml(label.slice(last, i));
				out += '<mark class="sqlmnger-combo-hl">' + escapeHtml(label.slice(i, i + qLen)) + '</mark>';
				last = i + qLen;
				i = lower.indexOf(ql, last);
			}
			out += escapeHtml(label.slice(last));
			return out;
		}

		function renderList(qRaw) {
			var q = (qRaw || '').trim();
			var qLower = q.toLowerCase();
			filtered = [];
			var i, it, lab, val, starts = [], mids = [];
			for (i = 0; i < items.length; i++) {
				it = items[i];
				lab = it.label.toLowerCase();
				val = it.value.toLowerCase();
				if (!qLower) {
					filtered.push(it);
					continue;
				}
				if (lab.indexOf(qLower) === 0 || val.indexOf(qLower) === 0) {
					starts.push(it);
				} else if (lab.indexOf(qLower) >= 0 || val.indexOf(qLower) >= 0) {
					mids.push(it);
				}
			}
			if (qLower) {
				// 前缀匹配优先
				filtered = starts.concat(mids);
			}
			list.innerHTML = '';
			hi = filtered.length ? 0 : -1;
			for (i = 0; i < filtered.length; i++) {
				(function (item, idx) {
					var li = document.createElement('li');
					li.className = 'sqlmnger-combo-item' + (idx === hi ? ' is-hi' : '');
					// 有关键字时高亮匹配段
					if (q) li.innerHTML = highlightLabel(item.label, q);
					else li.textContent = item.label;
					li.onmousedown = function (e) {
						// prevent blur before click
						if (e && e.preventDefault) e.preventDefault();
						pick(item);
					};
					list.appendChild(li);
				})(filtered[i], i);
			}
			if (!filtered.length) {
				var empty = document.createElement('li');
				empty.className = 'sqlmnger-combo-empty';
				empty.textContent = (function () {
					if (window.SqlmngerI18n && SqlmngerI18n.t) {
						return q
							? SqlmngerI18n.t('grid.noMatchQ', { q: q })
							: SqlmngerI18n.t('grid.noMatch');
					}
					return q ? ('无匹配「' + q + '」') : '无匹配项';
				})();
				list.appendChild(empty);
			}
		}

		function show(forceAll) {
			open = true;
			list.style.display = 'block';
			if (forceAll) {
				// 箭头打开：显示全部（不按输入过滤）
				filtering = false;
				renderList('');
			} else if (filtering) {
				renderList(input.value);
			} else {
				renderList('');
			}
		}

		function hide() {
			open = false;
			list.style.display = 'none';
			hi = -1;
			filtering = false;
		}

		function pick(item) {
			value = item.value;
			input.value = item.label;
			filtering = false;
			hide();
			onChange(value);
		}

		function commitTyped() {
			var q = (input.value || '').trim();
			// exact match label or value
			var i, it;
			for (i = 0; i < items.length; i++) {
				it = items[i];
				if (it.label === q || it.value === q) {
					pick(it);
					return;
				}
			}
			// 有输入过滤时：仅一项则选中
			if (filtering) {
				renderList(q);
				if (filtered.length === 1) {
					pick(filtered[0]);
					return;
				}
			}
			// 允许自定义：保留用户输入
			if (allowCustom) {
				value = q;
				input.value = q;
				filtering = false;
				hide();
				onChange(value);
				return;
			}
			// keep previous value display if invalid
			if (value) input.value = labelOf(value);
			else input.value = '';
			filtering = false;
			hide();
		}

		// 用 addEventListener，避免宿主再赋 oninput 时冲掉过滤逻辑
		input.addEventListener('focus', function () {
			// 初次下拉：不按现有内容过滤，显示全部
			show(true);
		});
		input.addEventListener('input', function () {
			// 仅在用户输入后才过滤 + 高亮
			filtering = true;
			open = true;
			list.style.display = 'block';
			renderList(input.value);
		});
		input.addEventListener('keydown', function (e) {
			if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
				show(true);
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (hi < filtered.length - 1) hi++;
				paintHi();
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (hi > 0) hi--;
				paintHi();
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if (hi >= 0 && filtered[hi]) pick(filtered[hi]);
				else commitTyped();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				if (value) input.value = labelOf(value);
				filtering = false;
				hide();
			}
		});
		input.addEventListener('blur', function () {
			// 延迟提交，便于点下拉项/箭头（否则会先关再闪）
			setTimeout(function () {
				if (!open) return;
				// 焦点仍在本控件内（箭头/列表）则不关
				var ae = document.activeElement;
				if (ae && wrap.contains(ae)) return;
				commitTyped();
			}, 150);
		});
		// 点箭头勿抢走 input 焦点，否则 blur→commitTyped 会立刻关掉刚打开的列表
		caret.addEventListener('mousedown', function (e) {
			if (e && e.preventDefault) e.preventDefault();
		});
		caret.addEventListener('click', function (e) {
			if (e) {
				e.preventDefault();
				e.stopPropagation();
			}
			if (open) {
				hide();
			} else {
				// 点箭头：显示全部
				filtering = false;
				try { input.focus(); } catch (exF) { /* */ }
				show(true);
			}
		});

		function paintHi() {
			var nodes = list.querySelectorAll('.sqlmnger-combo-item');
			var i;
			for (i = 0; i < nodes.length; i++) {
				if (i === hi) nodes[i].classList.add('is-hi');
				else nodes[i].classList.remove('is-hi');
			}
			if (hi >= 0 && nodes[hi] && nodes[hi].scrollIntoView) {
				nodes[hi].scrollIntoView({ block: 'nearest' });
			}
		}

		document.addEventListener('mousedown', function (e) {
			if (!wrap.contains(e.target)) hide();
		});

		return {
			setItems: setItems,
			setValue: setValue,
			getValue: getValue,
			focus: function () { input.focus(); }
		};
	}
})();
