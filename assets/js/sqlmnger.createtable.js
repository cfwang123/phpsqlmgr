/**
 * 新建表：弹窗填写表名与列，生成 CREATE TABLE 并执行
 * 类型 / 默认值：与改表一致的可输入 combobox
 */
window.SqlmngerCreateTable = (function () {
	var t = { open: open };

	// 类型选项（参考 Adminer / 改表）—— 须在 return 之前赋值
	var COLUMN_TYPE_ITEMS = [
		'tinyint', 'tinyint(1)', 'tinyint(3) unsigned', 'smallint', 'mediumint',
		'int', 'int(11)', 'int(11) unsigned', 'bigint', 'bigint(20)',
		'decimal', 'decimal(10,2)', 'float', 'double',
		'date', 'datetime', 'timestamp', 'time', 'year',
		'char', 'char(1)', 'varchar', 'varchar(50)', 'varchar(100)', 'varchar(255)',
		'tinytext', 'text', 'mediumtext', 'longtext', 'json',
		'enum', 'set',
		'bit', 'bit(1)', 'binary', 'varbinary', 'varbinary(255)',
		'tinyblob', 'blob', 'mediumblob', 'longblob',
		'geometry', 'point', 'linestring', 'polygon',
		// SQLite / SQL Server 常见
		'INTEGER', 'TEXT', 'REAL', 'BLOB', 'nvarchar(100)', 'nvarchar(255)', 'datetime2'
	];

	/**
	 * @param {{ database:string, readonly?:boolean, driver?:string, onCreated?:function }} opts
	 */
	function open(opts) {
		opts = opts || {};
		if (opts.readonly) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.alert) {
				SqlmngerUi.alert('当前为只读连接，无法新建表');
			} else {
				alert('当前为只读连接，无法新建表');
			}
			return;
		}
		var database = opts.database || '';
		var driver = (opts.driver || 'mysql').toLowerCase();

		function _(k, vars) {
			return (window.SqlmngerI18n && SqlmngerI18n.t) ? SqlmngerI18n.t(k, vars) : k;
		}

		var body = document.createElement('div');
		body.className = 'sqlmnger-ct-body';
		body.innerHTML =
			'<div class="sqlmnger-ct-row">' +
				'<label>表名</label>' +
				'<input type="text" class="sqlmnger-input sqlmnger-ct-name" placeholder="table_name" autocomplete="off" />' +
			'</div>' +
			'<div class="sqlmnger-ct-hint">列定义（至少一列）。类型 / 默认值可下拉或手输</div>' +
			'<table class="sqlmnger-ct-table"><thead><tr>' +
				'<th class="c-name-col">列名</th>' +
				'<th class="c-type-col">类型</th>' +
				'<th class="c-def-col">默认</th>' +
				'<th class="c-null-col">可空</th>' +
				'<th class="c-pk-col">主键</th>' +
				'<th class="c-act-col"></th>' +
			'</tr></thead><tbody></tbody></table>' +
			'<div class="sqlmnger-ct-actions-row">' +
				'<button type="button" class="sqlmnger-tp-btn" data-act="addcol"><i class="fa-solid fa-plus"></i> 加列</button>' +
			'</div>' +
			'<div class="sqlmnger-ct-preview-lab">预览 SQL</div>' +
			'<pre class="sqlmnger-ct-preview"></pre>' +
			'<div class="sqlmnger-ct-msg"></div>';

		var tbody = body.querySelector('tbody');
		var nameInp = body.querySelector('.sqlmnger-ct-name');
		var preview = body.querySelector('.sqlmnger-ct-preview');
		var msgEl = body.querySelector('.sqlmnger-ct-msg');

		function typeItemsFor(curType) {
			var list = COLUMN_TYPE_ITEMS.slice();
			var t0 = (curType || '').trim();
			if (!t0) return list;
			var found = false, i;
			for (i = 0; i < list.length; i++) {
				if (list[i].toLowerCase() === t0.toLowerCase()) { found = true; break; }
			}
			if (!found) list.unshift(t0);
			return list;
		}

		function defaultItemsFor(curDef) {
			var emptyLab = (window.SqlmngerI18n && SqlmngerI18n.t)
				? SqlmngerI18n.t('table.defaultEmpty') : '(空)';
			var list = [
				{ value: '', label: emptyLab }, // 不写 DEFAULT
				{ value: "''", label: "''" }, // 空字符串 DEFAULT ''
				'0',
				'NOW()',
				'GETDATE()',
				'CURRENT_TIMESTAMP',
				"'1970-01-01'",
				"'1970-01-01 00:00:00'",
				'NULL'
			];
			var t0 = curDef == null ? '' : String(curDef);
			if (t0 === '') return list;
			var found = false, i, it, v;
			for (i = 0; i < list.length; i++) {
				it = list[i];
				v = typeof it === 'object' ? String(it.value) : String(it);
				if (v === t0) { found = true; break; }
			}
			if (!found) list.unshift(t0);
			return list;
		}

		/**
		 * 按列类型建议默认值：字符串 ''，数值 0，日期 '1970-01-01'
		 * 返回 UI 用字符串（与 defaultItems 一致）
		 */
		function suggestedDefaultForType(type) {
			var t = String(type || '').toLowerCase().replace(/\s+/g, ' ').trim();
			if (!t) return '';
			// 数值 / 布尔
			if (
				/\b(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|money|smallmoney|year|serial|boolean|bool)\b/.test(t)
				|| /^(tiny|small|medium|big)?int(\(|$)/.test(t)
			) {
				return '0';
			}
			// 日期时间
			if (
				/\b(date|datetime|datetime2|smalldatetime|timestamp|time)\b/.test(t)
			) {
				return "'1970-01-01'";
			}
			// 字符 / 文本 / 二进制等
			if (
				/\b(char|varchar|nchar|nvarchar|text|ntext|tinytext|mediumtext|longtext|blob|tinyblob|mediumblob|longblob|binary|varbinary|enum|set|json|xml|clob|uuid|uniqueidentifier)\b/.test(t)
				|| t === 'text' || t === 'blob'
			) {
				return "''";
			}
			// 其它：不强制
			return '';
		}

		function applySuggestedDefault(tr, type) {
			if (!tr) return;
			var pk = tr.querySelector('.c-pk');
			// 主键列通常自增/IDENTITY，不强写默认
			if (pk && pk.checked) return;
			var sug = suggestedDefaultForType(type);
			if (sug === '') return;
			if (tr._defCombo && typeof tr._defCombo.setItems === 'function') {
				tr._defCombo.setItems(defaultItemsFor(sug));
				if (typeof tr._defCombo.setValue === 'function') {
					tr._defCombo.setValue(sug, true);
				}
			} else {
				var dinp = tr.querySelector('.c-def-host .sqlmnger-combo-input')
					|| tr.querySelector('.c-def');
				if (dinp) dinp.value = sug;
			}
			// 有的环境下 setValue 后 input 仍空：再强制写一次显示
			var show = tr.querySelector('.c-def-host .sqlmnger-combo-input');
			if (show && !show.value && sug) {
				show.value = sug;
			}
		}

		function readType(tr) {
			var tinp = tr.querySelector('.c-type-host .sqlmnger-combo-input');
			if (tinp) return (tinp.value || '').trim();
			var el = tr.querySelector('.c-type');
			return el ? (el.value || '').trim() : '';
		}

		function readDefault(tr) {
			var dinp = tr.querySelector('.c-def-host .sqlmnger-combo-input');
			if (dinp) return dinp.value;
			var el = tr.querySelector('.c-def');
			return el ? el.value : '';
		}

		/** UI 默认值 → SQL DEFAULT 子句（不含前导空格） */
		function defaultSqlClause(uiVal) {
			var s = uiVal == null ? '' : String(uiVal).trim();
			// 空 / (空)：不写 DEFAULT
			if (s === '' || s === '(空)') return '';
			if (s.toUpperCase() === 'NULL') return 'DEFAULT NULL';
			// 数字
			if (/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return 'DEFAULT ' + s;
			// 函数
			if (/^[A-Za-z_][A-Za-z0-9_]*(\(\))?$/.test(s)) return 'DEFAULT ' + s;
			// 已带单引号（含 '' 空串）
			if (s.length >= 2 && s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") {
				return 'DEFAULT ' + s;
			}
			// 裸字符串：加引号
			return "DEFAULT '" + s.replace(/'/g, "''") + "'";
		}

		function addRow(def) {
			def = def || {};
			var colType = def.type || defaultType(driver);
			var isPk = !!def.pk;
			// 未显式指定 default 时：非主键按类型自动给 '' / 0 / '1970-01-01'
			var colDef;
			if (Object.prototype.hasOwnProperty.call(def, 'default') && def.default != null && String(def.default) !== '') {
				colDef = String(def.default);
			} else if (!isPk) {
				colDef = suggestedDefaultForType(colType) || '';
			} else {
				colDef = '';
			}
			var tr = document.createElement('tr');
			tr.innerHTML =
				'<td class="c-name-cell"><input type="text" class="sqlmnger-input c-name" value="' + escAttr(def.name || '') + '" /></td>' +
				'<td class="c-type-cell"><span class="c-type-host"></span></td>' +
				'<td class="c-def-cell"><span class="c-def-host"></span></td>' +
				'<td class="c-center c-null-cell"><input type="checkbox" class="c-null" ' + (def.nullable !== false ? 'checked' : '') + ' /></td>' +
				'<td class="c-center c-pk-cell"><input type="checkbox" class="c-pk" ' + (isPk ? 'checked' : '') + ' /></td>' +
				'<td class="c-act-cell"><button type="button" class="sqlmnger-tp-btn danger c-del" title="删除列"><i class="fa-solid fa-xmark"></i></button></td>';
			tbody.appendChild(tr);

			var typeHost = tr.querySelector('.c-type-host');
			if (typeHost && typeof SqlmngerCombo !== 'undefined' && SqlmngerCombo.mount) {
				tr._typeCombo = SqlmngerCombo.mount({
					el: typeHost,
					items: typeItemsFor(colType),
					value: colType,
					placeholder: _('table.typePh'),
					allowCustom: true,
					onChange: function (v) {
						// 选类型时按类型自动填默认值（'' / 0 / '1970-01-01'）
						applySuggestedDefault(tr, v);
						refreshPreview();
					}
				});
			} else if (typeHost) {
				typeHost.innerHTML = '<input type="text" class="sqlmnger-input c-type" value="' + escAttr(colType) + '" />';
				var typeInp = typeHost.querySelector('.c-type');
				if (typeInp) {
					typeInp.onchange = function () {
						applySuggestedDefault(tr, typeInp.value);
						refreshPreview();
					};
				}
			}

			var defHost = tr.querySelector('.c-def-host');
			if (defHost && typeof SqlmngerCombo !== 'undefined' && SqlmngerCombo.mount) {
				tr._defCombo = SqlmngerCombo.mount({
					el: defHost,
					items: defaultItemsFor(colDef),
					value: colDef,
					placeholder: _('table.defaultPh'),
					allowCustom: true,
					onChange: function () { refreshPreview(); }
				});
				// 确保 '' / 0 等能显示（避免 value 未匹配时仍是 placeholder）
				if (colDef && typeof tr._defCombo.setValue === 'function') {
					tr._defCombo.setValue(colDef, true);
				}
			} else if (defHost) {
				defHost.innerHTML = '<input type="text" class="sqlmnger-input c-def" value="' + escAttr(colDef) + '" />';
			}

			var inputs = tr.querySelectorAll('input');
			var ii;
			for (ii = 0; ii < inputs.length; ii++) {
				if (inputs[ii].classList.contains('sqlmnger-combo-input')) {
					inputs[ii].addEventListener('input', refreshPreview);
					continue;
				}
				inputs[ii].oninput = refreshPreview;
				inputs[ii].onchange = refreshPreview;
			}
			// 勾选主键时清空自动默认；取消主键时按类型补默认
			var pkCb = tr.querySelector('.c-pk');
			if (pkCb) {
				pkCb.addEventListener('change', function () {
					if (pkCb.checked) {
						if (tr._defCombo && tr._defCombo.setValue) {
							tr._defCombo.setItems(defaultItemsFor(''));
							tr._defCombo.setValue('', true);
						}
					} else {
						applySuggestedDefault(tr, readType(tr));
					}
					refreshPreview();
				});
			}
			tr.querySelector('.c-del').onclick = function () {
				if (tbody.rows.length <= 1) return;
				tbody.removeChild(tr);
				refreshPreview();
			};
			refreshPreview();
		}

		function defaultType(drv) {
			if (drv === 'sqlsrv' || drv === 'mssql_tcp') return 'int';
			if (drv === 'sqlite') return 'INTEGER';
			return 'int(11)';
		}

		function collectCols() {
			var cols = [], r, name, type, defv, nullable, pk;
			for (r = 0; r < tbody.rows.length; r++) {
				name = (tbody.rows[r].querySelector('.c-name').value || '').trim();
				type = readType(tbody.rows[r]);
				defv = readDefault(tbody.rows[r]);
				nullable = !!tbody.rows[r].querySelector('.c-null').checked;
				pk = !!tbody.rows[r].querySelector('.c-pk').checked;
				if (!name && !type) continue;
				cols.push({ name: name, type: type, default: defv, nullable: nullable, pk: pk });
			}
			return cols;
		}

		function quoteIdent(name) {
			name = String(name || '');
			if (driver === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
			if (driver === 'sqlsrv' || driver === 'mssql_tcp') return '[' + name.replace(/]/g, ']]') + ']';
			return '"' + name.replace(/"/g, '""') + '"';
		}

		/** 是否整型（可作自增/IDENTITY） */
		function isIntegerType(type) {
			return /\b(tinyint|smallint|mediumint|int|integer|bigint)\b/i.test(String(type || ''));
		}

		function buildSql() {
			var tname = (nameInp.value || '').trim();
			var cols = collectCols();
			if (!tname) return '';
			var parts = [], pks = [], i, c, line, defClause;
			var useIdentity, useAutoInc;
			for (i = 0; i < cols.length; i++) {
				c = cols[i];
				if (!c.name || !c.type) continue;
				line = quoteIdent(c.name) + ' ' + c.type;
				// SQL Server：整型主键加 IDENTITY(1,1)（写在类型后、NULL 前）
				useIdentity = c.pk && (driver === 'sqlsrv' || driver === 'mssql_tcp')
					&& isIntegerType(c.type)
					&& !/identity/i.test(c.type);
				if (useIdentity) {
					line += ' IDENTITY(1,1)';
				}
				// MySQL：整型主键加 AUTO_INCREMENT
				useAutoInc = c.pk && driver === 'mysql'
					&& isIntegerType(c.type)
					&& !/auto_increment/i.test(c.type);
				if (useAutoInc) {
					line += ' AUTO_INCREMENT';
				}
				if (!c.nullable) line += ' NOT NULL';
				// IDENTITY 列一般不写 DEFAULT
				if (!useIdentity) {
					defClause = defaultSqlClause(c.default);
					if (defClause) line += ' ' + defClause;
				}
				parts.push(line);
				if (c.pk) pks.push(quoteIdent(c.name));
			}
			if (!parts.length) return '';
			if (pks.length) {
				parts.push('PRIMARY KEY (' + pks.join(', ') + ')');
			}
			return 'CREATE TABLE ' + quoteIdent(tname) + ' (\n  ' + parts.join(',\n  ') + '\n)';
		}

		function refreshPreview() {
			preview.textContent = buildSql() || '（填写表名与列后生成）';
		}

		function setMsg(text, kind) {
			msgEl.textContent = text || '';
			msgEl.className = 'sqlmnger-ct-msg' + (kind ? ' is-' + kind : '');
		}

		body.querySelector('[data-act=addcol]').onclick = function () { addRow({}); };
		nameInp.oninput = refreshPreview;

		// 默认两列：id PK（无默认）+ name 字符串（自动 DEFAULT ''）
		addRow({ name: 'id', type: defaultType(driver), nullable: false, pk: true });
		addRow({
			name: 'name',
			type: (driver === 'sqlsrv' || driver === 'mssql_tcp') ? 'nvarchar(100)' : (driver === 'sqlite' ? 'TEXT' : 'varchar(100)'),
			nullable: true,
			pk: false
			// default 省略 → 按类型自动 '' / 0 / 日期
		});

		var win = X.WinMgr.create({
			xtype: 'window',
			title: '新建表' + (database ? (' · ' + database) : ''),
			width: 720,
			height: 520,
			modal: true,
			bbar: [
				{
					xtype: 'button',
					text: '创建',
					cls: 'primary',
					handler: function () {
						var sql = buildSql();
						if (!sql) {
							setMsg('请填写表名与至少一列完整定义', 'err');
							return;
						}
						var cols = collectCols();
						var i;
						for (i = 0; i < cols.length; i++) {
							if (!cols[i].name || !cols[i].type) {
								setMsg('第 ' + (i + 1) + ' 列名称/类型不完整', 'err');
								return;
							}
						}
						setMsg('创建中…', 'info');
						SqlmngerApi.post('api/sql_exec.php', {
							database: database,
							sql: sql
						}).then(function () {
							setMsg('创建成功', 'ok');
							if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) {
								SqlmngerUi.toast('表创建成功: ' + (nameInp.value || '').trim(), 'ok');
							}
							if (typeof opts.onCreated === 'function') {
								try { opts.onCreated((nameInp.value || '').trim(), sql); } catch (ex) { /* */ }
							}
							setTimeout(function () {
								try { win.close(); } catch (e) { /* */ }
							}, 300);
						}).catch(function (err) {
							var m = (err && err.error && err.error.message) ? err.error.message : String(err);
							if (err && err.error && err.error.detail) m += ' — ' + err.error.detail;
							setMsg(m, 'err');
							if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) {
								SqlmngerUi.error(m);
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
		// 挂载 body
		if (win._bd) {
			win._bd.appendChild(body);
			win._bd.style.overflow = 'auto';
			win._bd.style.padding = '12px';
		} else if (win.el) {
			var bd = win.el.querySelector('.xwin-bd');
			if (bd) {
				bd.appendChild(body);
				bd.style.overflow = 'auto';
				bd.style.padding = '12px';
			}
		}
		if (win.el) win.el.classList.add('sqlmnger-ct-win');
		setTimeout(function () {
			try { nameInp.focus(); } catch (e) { /* */ }
		}, 50);
		return win;
	}

	function escAttr(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	return t;
})();
