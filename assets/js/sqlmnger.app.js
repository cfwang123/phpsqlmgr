/**
 * sqlmnger 主界面
 * - 登录门禁
 * - 顶栏：Logo / 版本 / 连接信息 / 数据库下拉
 * - 左树：当前库的表列表
 * - 中心 Tabs：打开表（数据编辑 + 结构/索引）
 */
window.SqlmngerApp = (function () {
	var APP_VERSION = '1.0.2';

	var t = {
		start: start,
		openTable: openTable,
		openSqlConsole: openSqlConsole,
		logout: logout,
		version: APP_VERSION
	};

	var _tabpnl = null;
	var _statbar = null;
	var _titlebar = null;
	var _openTabs = {};
	var _connection = null;
	var _databases = [];
	var _currentDb = '';
	var _dbCombo = null;
	var _tableFilter = '';
	var _allTables = [];
	var _treeHost = null;
	var _westComp = null;
	var _breadcrumb = null;
	// SQL 命令 Tab 序号（每次点击新开一个，不复用）
	var _sqlTabSeq = 0;
	// hash 路由：刷新后恢复活动表/SQL 及 where、排序等
	var _hashSilent = false;
	var _hashTimer = null;
	var _pendingHash = null;
	var _hashRestored = false;

	return t;

	function _(k, vars) {
		return (window.SqlmngerI18n && SqlmngerI18n.t) ? SqlmngerI18n.t(k, vars) : k;
	}

	function start() {
		SqlmngerApi.setBaseUrl(detectBase());
		// 多 Tab：从 URL ?c= 恢复本 Tab 的连接
		var cid = SqlmngerApi.readConnIdFromUrl();
		if (cid) SqlmngerApi.setConnId(cid);

		// 避免 auth_me 卡住时长时间白屏（默认 XHR 120s）
		showBootSplash();

		SqlmngerApi.get('api/auth_me.php', cid ? { c: cid } : {}, { timeoutMs: 12000 }).then(function (env) {
			hideBootSplash();
			var data = env.data || {};
			if (data.logged_in && data.connection) {
				_connection = data.connection;
				var id = data.conn_id || data.c || (data.connection && data.connection.id) || cid;
				if (id) {
					SqlmngerApi.setConnId(id);
					SqlmngerApi.writeConnIdToUrl(id, {
						db: data.connection.database || ''
					});
				}
				enterMain(data);
			} else {
				// 本 Tab 无有效连接 → 登录（其它 Tab 的 c 不受影响）
				showLogin(data);
			}
		}).catch(function (err) {
			console.warn(err);
			hideBootSplash();
			// 超时/网络失败也进登录页，避免白屏干等
			showLogin({});
		});
	}

	function showBootSplash() {
		if (document.getElementById('sqlmnger-boot-splash')) return;
		var el = document.createElement('div');
		el.id = 'sqlmnger-boot-splash';
		el.setAttribute('style',
			'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
			'background:#f4f6f8;color:#334;font:14px/1.5 system-ui,Segoe UI,sans-serif;');
		el.innerHTML = '<div style="text-align:center;padding:24px;">' +
			'<div style="font-size:18px;font-weight:600;margin-bottom:8px;">sqlmnger</div>' +
			'<div style="opacity:.75;">正在加载…</div></div>';
		document.body.appendChild(el);
	}

	function hideBootSplash() {
		var el = document.getElementById('sqlmnger-boot-splash');
		if (el && el.parentNode) el.parentNode.removeChild(el);
	}

	function showLogin(authData) {
		authData = authData || {};
		var drivers = authData.drivers || (Array.isArray(authData) ? authData : []);
		clearMain();
		SqlmngerLogin.show({
			drivers: drivers,
			allowEmptyPassword: authData.allow_empty_password !== false,
			// 同 Tab 重连可复用 URL 上的 c
			connId: SqlmngerApi.getConnId() || SqlmngerApi.readConnIdFromUrl(),
			onSuccess: function (data) {
				_connection = (data && data.connection) ? data.connection : null;
				var id = (data && (data.conn_id || data.c)) ||
					(_connection && _connection.id) || '';
				if (id) {
					SqlmngerApi.setConnId(id);
					SqlmngerApi.writeConnIdToUrl(id, {
						db: (_connection && _connection.database) || ''
					});
				}
				SqlmngerLogin.hide();
				enterMain(data || {});
			}
		});
	}

	function enterMain(data) {
		if (data && data.connection) _connection = data.connection;
		clearMain();
		_openTabs = {};
		_sqlTabSeq = 0;
		_tabpnl = null;
		_statbar = null;

		var connLabel = formatConn(_connection);

		var vp = X.mk({
			xtype: 'viewport',
			renderTo: document.body,
			items: [
				{
					xtype: 'titlebar',
					title: 'sqlmnger',
					items: [
						{
							xtype: 'button',
							icon: '<i class="fa-solid fa-rotate"></i>',
							text: _('app.refreshTables'),
							small: true,
							handler: function () { reloadTables(); }
						},
						{ xtype: 'sep' },
						{
							xtype: 'button',
							icon: '<i class="fa-solid fa-plug-circle-xmark"></i>',
							text: _('app.disconnect'),
							handler: logout
						}
					]
				},
				{
					xtype: 'border',
					region: {
						west: {
							xtype: 'panel',
							title: _('app.tables'),
							width: 260,
							cls: 'sqlmnger-west'
						},
						center: {
							xtype: 'tabpanel',
							id: 'maintabs',
							listeners: {
								tabclose: onTabClose,
								tabchange: onTabChange
							}
						}
					}
				},
				{
					xtype: 'statusbar',
					left: _('app.loadingDbs'),
					right: connLabel
				}
			]
		});

		_titlebar = vp.ch[0];
		_tabpnl = vp.ch[1].ch[1];
		_statbar = vp.ch[2];
		_westComp = vp.ch[1].ch[0];

		// 西侧面板 body 作为树容器
		_treeHost = _westComp.body ? _westComp.body() : _westComp.el;
		if (_treeHost) {
			_treeHost.style.overflow = 'auto';
			_treeHost.style.padding = '0';
		}

		// Logo + 版本 + 连接信息（类型 / IP / 用户）
		decorateTitlebar();

		// 面包屑：MySQL » 服务器 » 库 » 表
		injectBreadcrumb();

		// 顶栏插入「数据库」下拉（Adminer 风格）
		injectDbSelector();

		// 主界面语言下拉（与登录页同一组件）
		injectLangSelector();

		loadDatabases();
	}

	/** 主界面顶栏：语言下拉按钮 */
	function injectLangSelector() {
		var bar = _titlebar && _titlebar.body ? _titlebar.body() : null;
		if (!bar || !window.SqlmngerI18n || !SqlmngerI18n.createLangDropdown) return;
		var wrap = document.createElement('span');
		wrap.className = 'sqlmnger-lang-wrap';
		var dd = SqlmngerI18n.createLangDropdown({ cls: 'sqlmnger-lang-dd-main' });
		wrap.appendChild(dd);
		// 顶栏右侧：与「刷新 / 断开」同区
		bar.appendChild(wrap);
	}

	function injectBreadcrumb() {
		var root = _titlebar && _titlebar.el && _titlebar.el.parentNode;
		if (!root) return;
		var bc = document.createElement('div');
		bc.className = 'sqlmnger-bc';
		bc.innerHTML = '<span class="sqlmnger-bc-inner"></span>';
		// 插在 titlebar 之后
		if (_titlebar.el.nextSibling) {
			root.insertBefore(bc, _titlebar.el.nextSibling);
		} else {
			root.appendChild(bc);
		}
		_breadcrumb = bc.querySelector('.sqlmnger-bc-inner') || bc;
		renderBreadcrumb(null);
	}

	/**
	 * @param {{kind?:string, database?:string, table?:string}|null} ctx
	 */
	function renderBreadcrumb(ctx) {
		if (!_breadcrumb) return;
		ctx = ctx || {};
		var kind = ctx.kind || '';
		var db = ctx.database || _currentDb || '';
		var table = ctx.table || '';
		var drv = driverLabel(_connection && _connection.driver);

		// 服务器段：服务器 + IP/主机（仿 Adminer 展示连接目标）
		var hostIp = mainHost(_connection);
		var serverLabel = hostIp && hostIp !== '—'
			? _('app.serverWithHost', { host: hostIp })
			: _('app.server');

		var html = '';
		html += '<a href="javascript:;" data-bc="server" class="sqlmnger-bc-link">' + esc(drv) + '</a>';
		html += '<span class="sqlmnger-bc-sep">»</span>';
		html += '<a href="javascript:;" data-bc="server" class="sqlmnger-bc-link" title="' + escAttr(serverLabel) + '">' + esc(serverLabel) + '</a>';
		if (db) {
			html += '<span class="sqlmnger-bc-sep">»</span>';
			if (kind === 'table' || kind === 'sql' || table) {
				html += '<a href="javascript:;" data-bc="db" data-db="' + escAttr(db) + '" class="sqlmnger-bc-link">' + esc(db) + '</a>';
			} else {
				html += '<span class="sqlmnger-bc-cur">' + esc(db) + '</span>';
			}
		}
		if (kind === 'table' && table) {
			html += '<span class="sqlmnger-bc-sep">»</span>';
			html += '<span class="sqlmnger-bc-cur">' + esc(_('app.tables')) + ': ' + esc(table) + '</span>';
		} else if (kind === 'sql') {
			html += '<span class="sqlmnger-bc-sep">»</span>';
			html += '<span class="sqlmnger-bc-cur">SQL</span>';
		}
		_breadcrumb.innerHTML = html;
		_breadcrumb.onclick = function (e) {
			var a = e.target;
			while (a && a !== _breadcrumb && !a.getAttribute('data-bc')) a = a.parentNode;
			if (!a || !a.getAttribute) return;
			var act = a.getAttribute('data-bc');
			if (act === 'server') openServerPage();
			else if (act === 'db') {
				var d = a.getAttribute('data-db') || _currentDb;
				if (d) {
					if (d !== _currentDb) {
						selectDatabase(d, { openDbPage: true });
					} else {
						openDatabasePage(d);
					}
				}
			}
		};
	}

	function updateBreadcrumbFromTab(id) {
		var info = id && _openTabs[id] ? _openTabs[id] : null;
		if (!info) {
			renderBreadcrumb({ kind: _currentDb ? 'database' : 'server', database: _currentDb });
			return;
		}
		renderBreadcrumb({
			kind: info.kind || 'table',
			database: info.database || _currentDb,
			table: info.table || ''
		});
	}

	/** 顶栏左侧：Logo、标题、版本；旁侧连接元信息 */
	function decorateTitlebar() {
		var root = _titlebar && _titlebar.el;
		if (!root) return;
		var ttl = root.querySelector('.ttl');
		if (!ttl) return;
		ttl.className = 'ttl sqlmnger-ttl';
		ttl.innerHTML =
			'<span class="sqlmnger-brand" title="sqlmnger">' +
				'<span class="sqlmnger-logo" aria-hidden="true"><i class="fa-solid fa-database"></i></span>' +
				'<span class="sqlmnger-brand-name">sqlmnger</span>' +
				'<span class="sqlmnger-version">v' + APP_VERSION + '</span>' +
			'</span>' +
			'<span class="sqlmnger-conn-meta" data-role="conn-meta"></span>';
		updateConnMeta();
	}

	function driverLabel(driver) {
		var d = String(driver || '').toLowerCase();
		if (d === 'mysql') return 'MySQL';
		if (d === 'sqlsrv' || d === 'mssql') return 'SQL Server (sqlsrv)';
		if (d === 'mssql_tcp') return 'SQL Server (TCP/TDS)';
		if (d === 'mssql_net') return 'SQL Server (.NET CLI)';
		if (d === 'sqlite') return 'SQLite';
		return driver || _('common.unknown');
	}

	function mainHost(c) {
		if (!c) return '—';
		if (c.driver === 'sqlite') {
			var p = c.path || '';
			if (!p) return '—';
			// 路径过长时取文件名
			var parts = String(p).replace(/\\/g, '/').split('/');
			return parts[parts.length - 1] || p;
		}
		var host = c.host || '—';
		var port = c.port;
		if (port != null && String(port) !== '' && String(port) !== '0') {
			// 常见默认端口可不显示，但仍展示主要 IP/主机
			return host;
		}
		return host;
	}

	function updateConnMeta() {
		var root = _titlebar && _titlebar.el;
		var meta = root && root.querySelector('[data-role=conn-meta]');
		if (!meta) return;
		var c = _connection;
		if (!c) {
			meta.innerHTML = '<span class="sqlmnger-meta-empty">' + esc(_('app.notConnected')) + '</span>';
			return;
		}
		var type = driverLabel(c.driver);
		var ip = mainHost(c);
		var user = c.driver === 'sqlite' ? '—' : (c.user || '—');
		var ro = c.readonly ? '<span class="sqlmnger-meta-ro">' + esc(_('common.readonly')) + '</span>' : '';
		var sslHtml = '';
		if (c.driver === 'mssql_tcp' || c.driver === 'mssql_net') {
			if (c.tls || c.ssl) {
				sslHtml = '<span class="sqlmnger-meta-ssl on" title="' + esc(_('app.sslOn')) + '"><i class="fa-solid fa-lock"></i> <em>SSL</em> <b>' + esc(_('app.sslOnShort')) + '</b></span>';
			} else {
				sslHtml = '<span class="sqlmnger-meta-ssl off" title="' + esc(_('app.sslOff')) + '"><i class="fa-solid fa-lock-open"></i> <em>SSL</em> <b>' + esc(_('app.sslOffShort')) + '</b></span>';
			}
		}
		meta.innerHTML =
			'<span class="sqlmnger-meta-item" title="' + esc(_('app.type')) + '"><i class="fa-solid fa-server"></i> <em>' + esc(_('app.type')) + '</em> <b>' + esc(type) + '</b></span>' +
			'<span class="sqlmnger-meta-item" title="Host / IP"><i class="fa-solid fa-network-wired"></i> <em>' + esc(_('app.ip')) + '</em> <b>' + esc(ip) + '</b></span>' +
			'<span class="sqlmnger-meta-item" title="' + esc(_('app.user')) + '"><i class="fa-solid fa-user"></i> <em>' + esc(_('app.user')) + '</em> <b>' + esc(user) + '</b></span>' +
			sslHtml +
			ro;
	}

	function injectDbSelector() {
		var bar = _titlebar && _titlebar.body ? _titlebar.body() : null;
		if (!bar) return;

		var wrap = document.createElement('span');
		wrap.className = 'sqlmnger-db-wrap';
		wrap.innerHTML = '<label class="sqlmnger-db-label">' + esc(_('app.dbLabel')) + '<span class="sqlmnger-db-combo-host"></span></label>';
		if (bar.firstChild) bar.insertBefore(wrap, bar.firstChild);
		else bar.appendChild(wrap);

		var host = wrap.querySelector('.sqlmnger-db-combo-host');
		_dbCombo = SqlmngerCombo.mount({
			el: host,
			items: [],
			placeholder: _('app.dbPlaceholder'),
			onChange: function (db) {
				if (!db || db === _currentDb) return;
				selectDatabase(db, { openDbPage: true });
			}
		});
	}

	function loadDatabases() {
		setStatus(_('app.loadingDbs'));
		_pendingHash = parseLocationHash();
		SqlmngerApi.post('api/db_list.php', {}).then(function (env) {
			var data = env.data || {};
			_databases = data.databases || [];
			_connection = data.connection || _connection;
			updateConnMeta();
			if (_statbar && _statbar.setright) _statbar.setright(formatConn(_connection));

			// hash 指定库优先
			var preferDb = (_pendingHash && _pendingHash.db) ? _pendingHash.db : '';
			var cur = data.current || (_connection && _connection.database) || '';
			if (preferDb && _databases.indexOf(preferDb) >= 0) {
				if (preferDb !== cur) {
					fillDbSelect(preferDb);
					selectDatabase(preferDb, { fromHash: true });
					return;
				}
				fillDbSelect(preferDb);
			} else {
				fillDbSelect(cur);
			}

			if (_currentDb) {
				reloadTables();
				tryRestoreFromHash();
			} else if (_databases.length) {
				// 无当前库：打开服务器页；hash 指定库时 selectDatabase 会处理
				if (_pendingHash && _pendingHash.db) {
					selectDatabase(_pendingHash.db, { fromHash: true });
				} else {
					openServerPage();
					var pick = pickDefaultDb(_databases);
					// 选中默认库：顶栏 + 左侧表列表，中心保持服务器页
					if (pick) {
						fillDbSelect(pick);
						selectDatabase(pick, { skipDbPage: true, openDbPage: false });
					} else {
						renderTreeEmpty(_('app.pickDb'));
					}
					// 无库名的 hash（如 k=server）可立刻恢复；有表 hash 时 _currentDb 已由 fillDbSelect 设置
					tryRestoreFromHash();
				}
			} else {
				openServerPage();
				setStatus(_('app.noDbAvailable'));
				renderTreeEmpty(_('app.noDb'));
			}
		}).catch(function (err) {
			setStatus(_('app.loadDbFail', { msg: errMsg(err) }));
			renderTreeEmpty(_('app.loadFail'));
		});
	}

	function pickDefaultDb(list) {
		var skip = { information_schema: 1, mysql: 1, performance_schema: 1, sys: 1 };
		var i;
		for (i = 0; i < list.length; i++) {
			if (!skip[list[i]]) return list[i];
		}
		return list[0];
	}

	function fillDbSelect(current) {
		if (!_dbCombo) return;
		_dbCombo.setItems(_databases);
		if (current && _databases.indexOf(current) >= 0) {
			_currentDb = current;
			_dbCombo.setValue(current, true);
		} else if (_databases.length) {
			_currentDb = _databases[0];
			_dbCombo.setValue(_currentDb, true);
		} else {
			_currentDb = '';
			_dbCombo.setValue('', true);
		}
	}

	/**
	 * @param {string} db
	 * @param {{fromHash?:boolean, openDbPage?:boolean, skipDbPage?:boolean}|null} opts
	 */
	function selectDatabase(db, opts) {
		opts = opts || {};
		setStatus(_('app.switchDb', { db: db }));
		SqlmngerApi.post('api/db_select.php', { database: db }).then(function (env) {
			var data = env.data || {};
			_connection = data.connection || _connection;
			_currentDb = data.current || db;
			if (_dbCombo) _dbCombo.setValue(_currentDb, true);
			updateConnMeta();
			if (_statbar && _statbar.setright) {
				_statbar.setright(formatConn(_connection));
			}
			// URL 同步 db，便于刷新/分享
			SqlmngerApi.writeConnIdToUrl(SqlmngerApi.getConnId(), { db: _currentDb });
			setStatus(_('app.currentDb', { db: _currentDb }));
			reloadTables();
			if (opts.fromHash) {
				tryRestoreFromHash();
			} else if (opts.openDbPage !== false && !opts.skipDbPage) {
				// 用户主动选库：打开数据库概览页
				openDatabasePage(_currentDb);
			}
			updateBreadcrumbFromTab(_tabpnl && _tabpnl._act);
		}).catch(function (err) {
			setStatus(_('app.selectDbFail', { msg: errMsg(err) }));
			if (_dbCombo) _dbCombo.setValue(_currentDb, true);
		});
	}

	// ─── Hash 路由：活动 Tab 状态 ───
	// #v=1&k=t&db=xx&t=yy&m=struct|alter&w=where&s=col:1,col2:-1&l=10000&p=1
	// #v=1&k=sql&db=xx
	// m 省略或 m=data 表示数据页

	function normalizeTableMode(m) {
		m = m == null ? '' : String(m).toLowerCase();
		if (m === 'struct' || m === 'structure' || m === 's') return 'struct';
		if (m === 'alter' || m === 'edit' || m === 'a') return 'alter';
		return 'data';
	}

	function parseLocationHash() {
		var raw = (window.location.hash || '').replace(/^#/, '');
		if (!raw) return null;
		var params = {};
		var parts = raw.split('&');
		var i, kv, k, v;
		for (i = 0; i < parts.length; i++) {
			if (!parts[i]) continue;
			kv = parts[i].split('=');
			try {
				k = decodeURIComponent(kv[0]);
				v = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '';
			} catch (e) {
				k = kv[0];
				v = kv.length > 1 ? kv[1] : '';
			}
			params[k] = v;
		}
		if (!params.k && !params.kind) return null;
		var kind = params.k || params.kind || '';
		if (kind === 't') kind = 'table';
		if (kind === 's') kind = 'sql';
		if (kind === 'server') kind = 'server';
		if (kind === 'db' || kind === 'database') kind = 'database';
		var out = {
			kind: kind,
			db: params.db || params.database || '',
			table: params.t || params.table || '',
			mode: normalizeTableMode(params.m || params.mode || 'data'),
			where: params.w != null ? params.w : (params.where || ''),
			limit: params.l != null ? params.l : params.limit,
			page: params.p != null ? params.p : params.page,
			sort: parseSortParam(params.s || params.sort || '')
		};
		if (out.kind === 'table' && (!out.db || !out.table)) return null;
		if (out.kind === 'sql' && !out.db) return null;
		if (out.kind === 'database' && !out.db) return null;
		if (out.kind === 'server') return out;
		return out;
	}

	function parseSortParam(s) {
		if (!s) return null;
		var keys = [];
		var parts = String(s).split(',');
		var i, p, name, dir;
		for (i = 0; i < parts.length; i++) {
			p = parts[i];
			if (!p) continue;
			// name:1 或 name.-1
			var idx = p.lastIndexOf(':');
			if (idx < 0) idx = p.lastIndexOf('.');
			if (idx <= 0) continue;
			name = p.slice(0, idx);
			dir = p.slice(idx + 1) === '-1' ? -1 : 1;
			if (name) keys.push({ name: name, field: name, dir: dir });
		}
		if (!keys.length) return null;
		return { keys: keys, name: keys[0].name, field: keys[0].field, dir: keys[0].dir };
	}

	function encodeSortParam(sort) {
		if (!sort) return '';
		var keys = sort.keys && sort.keys.length ? sort.keys : [sort];
		var parts = [], i, k, nm, d;
		for (i = 0; i < keys.length; i++) {
			k = keys[i];
			if (!k) continue;
			// 优先列名 name，避免 field 数字下标写入 hash 后无法还原
			nm = (k.name != null && String(k.name) !== '') ? k.name
				: (k.field != null && String(k.field) !== '' ? k.field : null);
			if (nm == null || nm === '') continue;
			// 纯数字 field 且无 name 时跳过（不可靠）
			if ((k.name == null || k.name === '') && /^\d+$/.test(String(nm))) continue;
			d = k.dir === -1 ? -1 : 1;
			parts.push(String(nm) + ':' + d);
		}
		return parts.join(',');
	}

	function buildHashFromState(st) {
		if (!st || !st.kind) return '';
		var parts = ['v=1'];
		function add(k, val) {
			if (val == null || val === '') return;
			parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(val)));
		}
		if (st.kind === 'table') {
			add('k', 't');
			add('db', st.database);
			add('t', st.table);
			// 结构/改表写入 m=；数据页省略以保持简短
			var mode = normalizeTableMode(st.mode);
			if (mode === 'struct' || mode === 'alter') add('m', mode);
			add('w', st.where || '');
			// 无排序时不写 s=，保证取消排序后 F5 不会再恢复
			var sortStr = encodeSortParam(st.sort);
			if (sortStr) add('s', sortStr);
			if (st.limit != null) add('l', st.limit);
			if (st.page != null && st.page > 1) add('p', st.page);
		} else if (st.kind === 'sql') {
			add('k', 'sql');
			add('db', st.database);
		} else if (st.kind === 'server') {
			add('k', 'server');
		} else if (st.kind === 'database') {
			add('k', 'db');
			add('db', st.database);
		} else {
			return '';
		}
		return parts.join('&');
	}

	function writeHashState(st) {
		if (_hashSilent) return;
		var h = buildHashFromState(st);
		var next = h ? ('#' + h) : '';
		var cur = window.location.hash || '';
		if (cur === next || (!h && (cur === '' || cur === '#'))) return;
		var path = window.location.pathname || '';
		var search = window.location.search || '';
		if (!window.history || !window.history.replaceState) {
			try { window.location.hash = h; } catch (e) { /* */ }
			return;
		}
		try {
			window.history.replaceState(window.history.state, '', path + search + next);
		} catch (e2) {
			try { window.location.hash = h; } catch (e3) { /* */ }
		}
		// 二次确认：取消排序后 URL 里不得再残留 s=
		if (st && st.kind === 'table' && !encodeSortParam(st.sort)) {
			var after = window.location.hash || '';
			if (/(?:^|[&#])s=/.test(after.replace(/^#/, '#'))) {
				try {
					window.history.replaceState(window.history.state, '', path + search + next);
				} catch (e4) { /* */ }
			}
		}
	}

	function scheduleHashWrite(st) {
		if (_hashSilent) return;
		// 表页状态立即写入：排序/取消排序/where 后立刻 F5 都能从 hash 恢复
		// （原先 80ms 防抖会导致设排序后马上刷新仍带旧 hash）
		if (st && st.kind === 'table') {
			if (_hashTimer) { clearTimeout(_hashTimer); _hashTimer = null; }
			writeHashState(st);
			return;
		}
		if (_hashTimer) clearTimeout(_hashTimer);
		_hashTimer = setTimeout(function () {
			_hashTimer = null;
			writeHashState(st);
		}, 80);
	}

	function syncHashFromActiveTab() {
		if (!_tabpnl || _hashSilent) return;
		var id = _tabpnl._act;
		if (!id || !_openTabs[id]) {
			// 无活动表时写当前库的空 hash 或不写
			return;
		}
		var info = _openTabs[id];
		if (info.kind === 'sql') {
			scheduleHashWrite({ kind: 'sql', database: info.database });
			return;
		}
		if (info.kind === 'server') {
			scheduleHashWrite({ kind: 'server' });
			return;
		}
		if (info.kind === 'database') {
			scheduleHashWrite({ kind: 'database', database: info.database });
			return;
		}
		if (info.inst && typeof info.inst.getState === 'function') {
			scheduleHashWrite(info.inst.getState());
			return;
		}
		scheduleHashWrite({
			kind: 'table',
			database: info.database,
			table: info.table,
			mode: 'data',
			where: '',
			sort: null,
			limit: 10000,
			page: 1
		});
	}

	function tryRestoreFromHash() {
		if (_hashRestored) return;
		var h = _pendingHash || parseLocationHash();
		if (!h) {
			// 无 hash：若尚有活动 tab，打开服务器页
			_hashRestored = true;
			if (!_tabpnl || !_tabpnl._act) openServerPage();
			return;
		}
		if (h.kind !== 'server' && h.db && _currentDb && h.db !== _currentDb) {
			// 等切库完成
			return;
		}
		_hashRestored = true;
		_pendingHash = null;
		_hashSilent = true;
		function done() {
			setTimeout(function () { _hashSilent = false; }, 400);
		}
		try {
			if (h.kind === 'server') {
				openServerPage();
				done();
				return;
			}
			if (h.kind === 'database' && h.db) {
				if (h.db !== _currentDb) {
					_hashRestored = false;
					_pendingHash = h;
					selectDatabase(h.db, { fromHash: true, skipDbPage: true });
					return;
				}
				openDatabasePage(h.db);
				done();
				return;
			}
			if (h.kind === 'sql') {
				if (h.db && h.db !== _currentDb) {
					_hashRestored = false;
					_pendingHash = h;
					selectDatabase(h.db, { fromHash: true, skipDbPage: true });
					return;
				}
				// 刷新恢复：已有 SQL Tab 则激活，避免重复叠开
				openSqlConsole(null, { fromHash: true });
				done();
				return;
			}
			if (h.kind === 'table' && h.table) {
				if (h.db && h.db !== _currentDb) {
					_hashRestored = false;
					_pendingHash = h;
					selectDatabase(h.db, { fromHash: true, skipDbPage: true });
					return;
				}
				openTable({
					database: h.db || _currentDb,
					table: h.table,
					mode: h.mode || 'data',
					initial: {
						mode: h.mode || 'data',
						where: h.where || '',
						sort: h.sort,
						limit: h.limit,
						page: h.page
					}
				});
			}
		} catch (ex) {
			console.warn(ex);
		}
		done();
	}

	function openServerPage() {
		if (!_tabpnl) return;
		var tabId = 'tab_server';
		if (_openTabs[tabId]) {
			_tabpnl.activate(tabId);
			setStatus(_('app.server'));
			syncHashFromActiveTab();
			updateBreadcrumbFromTab(tabId);
			return;
		}
		var readonly = !!(_connection && _connection.readonly);
		_openTabs[tabId] = { database: '', table: '', kind: 'server', inst: null };
		_tabpnl.add({
			id: tabId,
			title: _('app.server'),
			content: function () {
				if (typeof SqlmngerServerPage === 'undefined') {
					var d = document.createElement('div');
					d.textContent = 'SqlmngerServerPage not loaded';
					return { el: d, destroy: function () {} };
				}
				return SqlmngerServerPage.create({
					readonly: readonly,
					onSelectDb: function (db) {
						selectDatabase(db, { openDbPage: true });
					},
					onCreateDb: function (name) {
						setStatus(_('app.createdDb', { name: name }));
					}
				}).then(function (inst) {
					if (_openTabs[tabId]) _openTabs[tabId].inst = inst;
					syncHashFromActiveTab();
					return inst;
				});
			}
		});
		setStatus(_('app.server'));
		syncHashFromActiveTab();
		updateBreadcrumbFromTab(tabId);
	}

	function openDatabasePage(db) {
		if (!_tabpnl) return;
		db = db || _currentDb;
		if (!db) {
			setStatus(_('app.pickDbFirst'));
			openServerPage();
			return;
		}
		var tabId = 'tab_db_' + String(db).replace(/[^\w\-.]/g, '_');
		if (_openTabs[tabId]) {
			_tabpnl.activate(tabId);
			setStatus(_('app.currentDb', { db: db }));
			syncHashFromActiveTab();
			updateBreadcrumbFromTab(tabId);
			// 刷新列表
			if (_openTabs[tabId].inst && _openTabs[tabId].inst.reload) {
				try { _openTabs[tabId].inst.reload(); } catch (e) { /* */ }
			}
			return;
		}
		var readonly = !!(_connection && _connection.readonly);
		_openTabs[tabId] = { database: db, table: '', kind: 'database', inst: null };
		_tabpnl.add({
			id: tabId,
			title: _('app.dbPage', { db: db }),
			content: function () {
				if (typeof SqlmngerDbPage === 'undefined') {
					var d = document.createElement('div');
					d.textContent = 'SqlmngerDbPage not loaded';
					return { el: d, destroy: function () {} };
				}
				return SqlmngerDbPage.create({
					database: db,
					readonly: readonly,
					onOpenTable: function (database, table) {
						openTable({ database: database, table: table });
					},
					onReloadTables: function () {
						reloadTables();
					}
				}).then(function (inst) {
					if (_openTabs[tabId]) _openTabs[tabId].inst = inst;
					syncHashFromActiveTab();
					return inst;
				});
			}
		});
		setStatus(_('app.currentDb', { db: db }));
		syncHashFromActiveTab();
		updateBreadcrumbFromTab(tabId);
	}

	function reloadTables() {
		if (!_currentDb) {
			_allTables = [];
			renderTreeEmpty(_('app.pickDb'));
			return;
		}
		if (_treeHost) {
			// 保留操作栏骨架
			renderWestShell(_('app.loadTables'));
		}
		SqlmngerApi.post('api/table_list.php', { database: _currentDb }).then(function (env) {
			_allTables = (env.data && env.data.tables) || [];
			_tableFilter = '';
			renderTableTree(_allTables);
			setStatus(_currentDb + ' · ' + _allTables.length);
		}).catch(function (err) {
			renderTreeEmpty(_('app.loadTablesFail', { msg: errMsg(err) }));
			setStatus(_('app.loadTablesFail', { msg: errMsg(err) }));
		});
	}

	/**
	 * 是否可能改变左侧表/视图列表（建表、删表、重命名等）
	 * 用全文匹配，兼容 IF OBJECT_ID ... DROP TABLE 等前缀
	 */
	function sqlAffectsTableList(sql) {
		var s = String(sql == null ? '' : sql);
		if (!s) return false;
		// CREATE/DROP TABLE|VIEW（含 TEMPORARY / OR ALTER VIEW）
		if (/\bDROP\s+(TEMPORARY\s+|TEMP\s+)?TABLE\b/i.test(s)) return true;
		if (/\bCREATE\s+(TEMPORARY\s+|TEMP\s+)?TABLE\b/i.test(s)) return true;
		if (/\bDROP\s+VIEW\b/i.test(s)) return true;
		if (/\bCREATE\s+(OR\s+ALTER\s+)?VIEW\b/i.test(s)) return true;
		if (/\bRENAME\s+TABLE\b/i.test(s)) return true;
		if (/\bALTER\s+TABLE\b/i.test(s) && /\bRENAME\b/i.test(s)) return true;
		// SQL Server 重命名
		if (/\bsp_rename\b/i.test(s)) return true;
		return false;
	}

	/**
	 * SQL 执行结果是否应刷新左侧表列表
	 * 支持单条 exec 与多语句 batch
	 */
	function shouldReloadTablesAfterSql(data) {
		if (!data) return false;
		if (data.kind === 'exec') {
			return sqlAffectsTableList(data.sql || '');
		}
		if (data.kind === 'batch' && data.results && data.results.length) {
			var i, r;
			for (i = 0; i < data.results.length; i++) {
				r = data.results[i];
				if (r && r.ok && r.kind === 'exec' && sqlAffectsTableList(r.sql || r.preview || '')) {
					return true;
				}
			}
		}
		return false;
	}

	/** 左侧：服务器 / 数据库 / SQL / 新建表（无库时也显示，便于导航） */
	function renderWestActions(host) {
		if (!host) return null;
		var actBar = document.createElement('div');
		actBar.className = 'sqlmnger-west-actions';
		actBar.innerHTML =
			'<button type="button" data-west="server" class="sqlmnger-west-act" title="' + esc(_('app.serverBtn')) + '">' +
				'<i class="fa-solid fa-server"></i> ' + esc(_('app.serverBtn')) + '</button>' +
			'<button type="button" data-west="db" class="sqlmnger-west-act" title="' + esc(_('app.databaseBtn')) + '">' +
				'<i class="fa-solid fa-database"></i> ' + esc(_('app.databaseBtn')) + '</button>' +
			'<button type="button" data-west="sql" class="sqlmnger-west-act" title="' + esc(_('app.sqlBtn')) + '">' +
				'<i class="fa-solid fa-terminal"></i> ' + esc(_('app.sqlBtn')) + '</button>' +
			'<button type="button" data-west="create" class="sqlmnger-west-act" title="' + esc(_('app.newTable')) + '">' +
				'<i class="fa-solid fa-plus"></i> ' + esc(_('app.newTable')) + '</button>';
		host.appendChild(actBar);
		actBar.onclick = function (e) {
			var t = e.target;
			while (t && t !== actBar && !t.getAttribute('data-west')) t = t.parentNode;
			if (!t || !t.getAttribute) return;
			var act = t.getAttribute('data-west');
			if (act === 'server') openServerPage();
			else if (act === 'db') openDatabasePage(_currentDb);
			else if (act === 'sql') openSqlConsole();
			else if (act === 'create') openCreateTable();
		};
		return actBar;
	}

	function renderWestShell(msg) {
		if (!_treeHost) return;
		_treeHost.innerHTML = '';
		renderWestActions(_treeHost);
		var tip = document.createElement('div');
		tip.className = 'sqlmnger-tree-loading';
		tip.textContent = msg || '';
		_treeHost.appendChild(tip);
	}

	function renderTableTree(tables) {
		if (!_treeHost) return;
		_treeHost.innerHTML = '';

		// 工具：SQL 命令 / 新建表（仿 Adminer 左侧）
		renderWestActions(_treeHost);

		// 表名搜索（输入过滤）
		var filterBar = document.createElement('div');
		filterBar.className = 'sqlmnger-table-filter';
		filterBar.innerHTML =
			'<input type="text" class="sqlmnger-input sqlmnger-table-filter-input" placeholder="' + esc(_('app.filterTable')) + '" />';
		_treeHost.appendChild(filterBar);
		var fin = filterBar.querySelector('input');
		fin.value = _tableFilter || '';
		fin.oninput = function () {
			_tableFilter = fin.value || '';
			paintTree(filterTables(_allTables, _tableFilter));
		};

		var treeBox = document.createElement('div');
		treeBox.className = 'sqlmnger-tree-box';
		_treeHost.appendChild(treeBox);
		_treeHost._treeBox = treeBox;

		paintTree(filterTables(tables || _allTables, _tableFilter));
	}

	/** 当前已打开的 SQL 命令 Tab 数量 */
	function countOpenSqlTabs() {
		var n = 0, id, info;
		for (id in _openTabs) {
			if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
			info = _openTabs[id];
			if (info && info.kind === 'sql') n++;
		}
		return n;
	}

	/** 找一个已打开的 SQL Tab（优先当前库） */
	function findOpenSqlTabId(preferDb) {
		var id, info, any = '';
		for (id in _openTabs) {
			if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
			info = _openTabs[id];
			if (!info || info.kind !== 'sql') continue;
			if (preferDb && info.database === preferDb) return id;
			if (!any) any = id;
		}
		return any || '';
	}

	/**
	 * 打开 SQL 命令页。默认每次新开一个 Tab；opts.fromHash 时若已有则激活复用。
	 */
	function openSqlConsole(prefillSql, opts) {
		if (!_tabpnl) return;
		if (!_currentDb) {
			setStatus(_('app.pickDbFirst'));
			return;
		}
		opts = opts || {};
		var db = _currentDb;

		// hash 恢复 / 显式复用：已有 SQL Tab 则激活，不叠开
		if (opts.fromHash || opts.reuse) {
			var existId = findOpenSqlTabId(db);
			if (existId) {
				_tabpnl.activate(existId);
				setStatus(_('app.sqlCmd', { db: db }));
				syncHashFromActiveTab();
				updateBreadcrumbFromTab(existId);
				return;
			}
		}

		var readonly = !!(_connection && _connection.readonly);
		_sqlTabSeq += 1;
		var tabId = 'tab_sql_' + String(db).replace(/[^\w\-.]/g, '_') + '_' + _sqlTabSeq;
		var n = countOpenSqlTabs() + 1;
		var title = (n <= 1)
			? _('app.sqlTitle', { db: db })
			: _('app.sqlTitleN', { db: db, n: n });

		_openTabs[tabId] = { database: db, table: '', kind: 'sql', inst: null, sqlSeq: _sqlTabSeq };
		_tabpnl.add({
			id: tabId,
			title: title,
			content: function () {
				if (typeof SqlmngerSqlPage === 'undefined') {
					var d = document.createElement('div');
					d.textContent = 'SqlmngerSqlPage not loaded';
					return { el: d, destroy: function () {} };
				}
				return SqlmngerSqlPage.create({
					database: db,
					readonly: readonly,
					sql: prefillSql || '',
					onExec: function (data) {
						// CREATE/DROP TABLE 等成功后刷新左侧表列表（含多语句 batch）
						if (shouldReloadTablesAfterSql(data)) reloadTables();
					}
				}).then(function (inst) {
					if (_openTabs[tabId]) _openTabs[tabId].inst = inst;
					syncHashFromActiveTab();
					return inst;
				});
			}
		});
		setStatus(_('app.sqlCmd', { db: db }));
		syncHashFromActiveTab();
		updateBreadcrumbFromTab(tabId);
	}

	function openCreateTable() {
		if (!_currentDb) {
			setStatus(_('app.pickDbFirst'));
			return;
		}
		if (_connection && _connection.readonly) {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.alert) {
				SqlmngerUi.alert('当前为只读连接，无法新建表');
			} else {
				alert('当前为只读连接，无法新建表');
			}
			return;
		}
		if (typeof SqlmngerCreateTable === 'undefined') {
			if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.error) {
				SqlmngerUi.error('新建表模块未加载');
			} else {
				alert('新建表模块未加载');
			}
			return;
		}
		SqlmngerCreateTable.open({
			database: _currentDb,
			readonly: !!(_connection && _connection.readonly),
			driver: (_connection && _connection.driver) || 'mysql',
			onCreated: function (tableName) {
				setStatus('已创建表: ' + tableName);
				if (typeof SqlmngerUi !== 'undefined' && SqlmngerUi.toast) {
					SqlmngerUi.toast('表已创建: ' + tableName, 'ok');
				}
				reloadTables();
				if (tableName) {
					openTable({ database: _currentDb, table: tableName });
				}
			}
		});
	}

	function filterTables(tables, q) {
		q = (q || '').toLowerCase();
		if (!q) return tables || [];
		var out = [], i, n;
		for (i = 0; i < tables.length; i++) {
			n = tables[i].name || '';
			if (String(n).toLowerCase().indexOf(q) >= 0) out.push(tables[i]);
		}
		return out;
	}

	/** 表名过滤关键字高亮（安全转义 + mark） */
	function highlightTableName(name, q) {
		var s = name == null ? '' : String(name);
		var key = (q || '').trim();
		if (!key || !s) return esc(s);
		var lower = s.toLowerCase();
		var k = key.toLowerCase();
		var idx = lower.indexOf(k);
		if (idx < 0) return esc(s);
		var out = '', last = 0, pos;
		while (idx >= 0) {
			out += esc(s.slice(last, idx));
			out += '<mark class="sqlmnger-hl">' + esc(s.slice(idx, idx + key.length)) + '</mark>';
			last = idx + key.length;
			idx = lower.indexOf(k, last);
		}
		out += esc(s.slice(last));
		return out;
	}

	function paintTree(tables) {
		var treeBox = _treeHost && _treeHost._treeBox;
		if (!treeBox) return;
		treeBox.innerHTML = '';

		var q = _tableFilter || '';
		var root = {
			text: _currentDb || 'tables',
			expanded: true,
			icon: '<i class="fa-solid fa-database"></i>',
			children: []
		};
		var i, tinfo, icon, nm;
		for (i = 0; i < tables.length; i++) {
			tinfo = tables[i];
			nm = tinfo.name || '';
			icon = (tinfo.type === 'view')
				? '<i class="fa-solid fa-eye"></i>'
				: '<i class="fa-solid fa-table"></i>';
			root.children.push({
				text: nm,
				// 有过滤词时用 HTML 高亮；无则纯文本
				html: q ? highlightTableName(nm, q) : null,
				leaf: true,
				icon: icon,
				_kind: 'table',
				_db: _currentDb,
				_table: nm,
				_type: tinfo.type || 'table'
			});
		}
		if (!tables.length) {
			root.children.push({
				text: q ? '（无匹配表）' : '（无表）',
				leaf: true,
				icon: '<i class="fa-solid fa-ban"></i>',
				_kind: 'empty'
			});
		}

		var tree = X.mk({
			xtype: 'tree',
			root: root,
			listeners: {
				itemclick: onTreeClick
			}
		});
		treeBox.appendChild(tree.el);
		// 表节点右键菜单
		bindTreeContextMenu(tree.el);
		// 树重建后：定位当前活动表
		setTimeout(function () { syncTreeToActiveTab(); }, 0);
	}

	function renderTreeEmpty(msg) {
		renderWestShell(msg || '');
	}

	function onTreeClick(e) {
		if (!e || !e.leaf) return;
		var nd = e.node || e;
		if (nd._kind === 'empty') return;
		if (nd._kind === 'table' || nd._table) {
			openTable({
				database: nd._db || _currentDb,
				table: nd._table || e.text,
				mode: 'data'
			});
		}
	}

	/** 左侧表列表右键：查看 / 结构 / SQL 工具 / 清空·重命名·删除 */
	function bindTreeContextMenu(treeEl) {
		if (!treeEl) return;
		treeEl.oncontextmenu = function (e) {
			var row = e.target;
			while (row && row !== treeEl && !(row.classList && row.classList.contains('nd'))) {
				row = row.parentNode;
			}
			if (!row || row === treeEl) return;
			var kind = row.getAttribute('data-kind') || '';
			var tableName = row.getAttribute('data-table') || '';
			var dbName = row.getAttribute('data-db') || _currentDb || '';
			if (kind === 'empty' || !tableName) return;
			e.preventDefault();
			e.stopPropagation();
			// 高亮当前右键节点
			var all = treeEl.querySelectorAll('.nd.sel');
			var i;
			for (i = 0; i < all.length; i++) all[i].classList.remove('sel');
			row.classList.add('sel');
			showTableContextMenu(e.clientX, e.clientY, dbName, tableName);
		};
	}

	function driverOfConn() {
		return (_connection && _connection.driver) ? String(_connection.driver) : 'mysql';
	}

	/** 按引擎引用表名 */
	function quoteTableIdent(name) {
		name = String(name || '');
		var d = driverOfConn();
		if (d === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
		if (d === 'sqlsrv' || d === 'mssql_tcp' || d === 'mssql') {
			return '[dbo].[' + name.replace(/]/g, ']]') + ']';
		}
		// sqlite
		return '"' + name.replace(/"/g, '""') + '"';
	}

	function buildSelectStarSql(table) {
		return 'SELECT * FROM ' + quoteTableIdent(table) + '\nLIMIT 100;\n';
	}

	function copyTextQuiet(text) {
		text = text == null ? '' : String(text);
		if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
			return navigator.clipboard.writeText(text).then(function () { return true; })
				.catch(function () { return fallbackCopyText(text); });
		}
		return Promise.resolve(fallbackCopyText(text));
	}

	function fallbackCopyText(text) {
		try {
			var ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;left:-9999px;top:0';
			document.body.appendChild(ta);
			ta.select();
			var ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return !!ok;
		} catch (e) {
			return false;
		}
	}

	function uiConfirm(msg, title) {
		if (window.SqlmngerUi && SqlmngerUi.confirm) {
			return SqlmngerUi.confirm(msg, title || '确认');
		}
		return Promise.resolve(!!window.confirm(msg));
	}

	function uiToast(msg, kind) {
		if (window.SqlmngerUi && SqlmngerUi.toast) SqlmngerUi.toast(msg, kind || 'ok');
		else setStatus(msg);
	}

	function uiPrompt(defVal, title) {
		if (typeof X !== 'undefined' && typeof X.prompt === 'function') {
			return X.prompt(defVal || '', title || '请输入');
		}
		var v = window.prompt(title || '请输入', defVal || '');
		return Promise.resolve(v === null ? null : v);
	}

	/** 执行管理类 SQL（清空/重命名/删除表） */
	function runTreeAdminSql(db, sql, opts) {
		opts = opts || {};
		var body = {
			database: db,
			sql: sql
		};
		if (opts.confirmDangerous) body.confirm_dangerous = true;
		return SqlmngerApi.post('api/sql_exec.php', body);
	}

	function sqlErrMsg(err) {
		if (err && err.error && err.error.message) {
			var m = err.error.message;
			if (err.error.detail && typeof err.error.detail === 'string') {
				m += ' — ' + err.error.detail;
			}
			return m;
		}
		return String(err || '失败');
	}

	/** 关闭指定库表已打开的 Tab */
	function closeTabsForTable(db, table) {
		if (!_tabpnl || !_openTabs) return;
		var ids = [], id, info;
		for (id in _openTabs) {
			if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
			info = _openTabs[id];
			if (!info || info.kind !== 'table') continue;
			if (info.table === table && (!db || info.database === db)) {
				ids.push(id);
			}
		}
		var i;
		for (i = 0; i < ids.length; i++) {
			try {
				if (typeof _tabpnl.remove === 'function') _tabpnl.remove(ids[i]);
			} catch (e) { /* */ }
		}
	}

	function buildTruncateSql(table) {
		var d = driverOfConn();
		var q = quoteTableIdent(table);
		// SQLite 无 TRUNCATE，用 DELETE
		if (d === 'sqlite') return 'DELETE FROM ' + q + ';';
		return 'TRUNCATE TABLE ' + q + ';';
	}

	function buildDropSql(table) {
		return 'DROP TABLE ' + quoteTableIdent(table) + ';';
	}

	function buildRenameSql(oldName, newName) {
		var d = driverOfConn();
		var o = quoteTableIdent(oldName);
		if (d === 'mysql') {
			return 'RENAME TABLE ' + o + ' TO ' + quoteTableIdent(newName) + ';';
		}
		if (d === 'sqlsrv' || d === 'mssql_tcp' || d === 'mssql') {
			// sp_rename 新名不要 schema 前缀
			return "EXEC sp_rename N'dbo." + String(oldName).replace(/'/g, "''")
				+ "', N'" + String(newName).replace(/'/g, "''") + "';";
		}
		// sqlite
		return 'ALTER TABLE ' + o + ' RENAME TO '
			+ '"' + String(newName).replace(/"/g, '""') + '";';
	}

	function showTableContextMenu(x, y, db, table) {
		if (typeof X === 'undefined' || !X.mk) {
			openTable({ database: db, table: table, mode: 'data' });
			return;
		}
		var readonly = !!(_connection && _connection.readonly);
		var items = [
			{
				text: '查看数据',
				icon: 'fa-solid fa-table',
				handler: function () {
					openTable({ database: db, table: table, mode: 'data' });
				}
			},
			{
				text: '结构',
				icon: 'fa-solid fa-list',
				handler: function () {
					openTable({ database: db, table: table, mode: 'struct' });
				}
			}
		];
		if (!readonly) {
			items.push({
				text: '修改结构',
				icon: 'fa-solid fa-pen-to-square',
				handler: function () {
					openTable({ database: db, table: table, mode: 'alter' });
				}
			});
		}
		items.push('-');
		items.push({
			text: '复制表名',
			icon: 'fa-solid fa-copy',
			handler: function () {
				copyTextQuiet(table).then(function (ok) {
					if (ok) {
						uiToast('已复制: ' + table, 'ok');
						setStatus('已复制表名: ' + table);
					} else {
						uiToast('复制失败', 'err');
					}
				});
			}
		});
		items.push({
			text: '生成 SELECT *',
			icon: 'fa-solid fa-code',
			handler: function () {
				var sql = buildSelectStarSql(table);
				copyTextQuiet(sql).then(function (ok) {
					if (ok) uiToast('已复制 SELECT *', 'ok');
					else uiToast('复制失败', 'err');
				});
			}
		});
		items.push({
			text: '打开 SQL 并预填',
			icon: 'fa-solid fa-terminal',
			handler: function () {
				openSqlConsole(buildSelectStarSql(table));
				setStatus('SQL · ' + db + '.' + table);
			}
		});
		if (!readonly) {
			items.push('-');
			items.push({
				text: '清空表',
				icon: 'fa-solid fa-eraser',
				handler: function () {
					uiConfirm(
						'确定清空表数据？\n' + db + '.' + table + '\n\n此操作不可撤销（TRUNCATE / DELETE）。',
						'清空表'
					).then(function (ok) {
						if (!ok) return;
						var sql = buildTruncateSql(table);
						setStatus('清空中… ' + table);
						runTreeAdminSql(db, sql, { confirmDangerous: true }).then(function () {
							uiToast('已清空: ' + table, 'ok');
							setStatus('已清空: ' + db + '.' + table);
							// 刷新已打开的数据页
							var id, info, inst;
							for (id in _openTabs) {
								if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
								info = _openTabs[id];
								if (!info || info.kind !== 'table') continue;
								if (info.table !== table || (db && info.database && info.database !== db)) continue;
								inst = info.inst;
								if (inst && typeof inst.reload === 'function') {
									try { inst.reload(); } catch (ex) { /* */ }
								}
							}
						}).catch(function (err) {
							uiToast('清空失败: ' + sqlErrMsg(err), 'err');
							setStatus('清空失败: ' + sqlErrMsg(err));
						});
					});
				}
			});
			items.push({
				text: '重命名…',
				icon: 'fa-solid fa-i-cursor',
				handler: function () {
					uiPrompt(table, '重命名表 — 输入新表名').then(function (newName) {
						if (newName == null) return;
						newName = String(newName).trim();
						if (!newName) {
							uiToast('表名不能为空', 'err');
							return;
						}
						if (newName === table) return;
						if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName) && !/^[\u4e00-\u9fa5A-Za-z0-9_]+$/.test(newName)) {
							// 宽松允许常见标识符；复杂名仍让 SQL 报错
						}
						uiConfirm(
							'将表「' + table + '」重命名为「' + newName + '」？',
							'确认重命名'
						).then(function (ok) {
							if (!ok) return;
							var sql = buildRenameSql(table, newName);
							setStatus('重命名中…');
							runTreeAdminSql(db, sql, { confirmDangerous: false }).then(function () {
								closeTabsForTable(db, table);
								reloadTables();
								uiToast('已重命名: ' + table + ' → ' + newName, 'ok');
								setStatus('已重命名: ' + db + '.' + newName);
							}).catch(function (err) {
								uiToast('重命名失败: ' + sqlErrMsg(err), 'err');
								setStatus('重命名失败: ' + sqlErrMsg(err));
							});
						});
					});
				}
			});
			items.push({
				text: '删除表…',
				icon: 'fa-solid fa-trash-can',
				handler: function () {
					uiConfirm(
						'确定删除表？此操作不可撤销！\n\n' + db + '.' + table + '\n\n请再次确认是否继续。',
						'删除表'
					).then(function (ok1) {
						if (!ok1) return;
						// 二次确认
						return uiConfirm(
							'最后确认：DROP TABLE ' + table + ' ？',
							'危险操作'
						).then(function (ok2) {
							if (!ok2) return;
							var sql = buildDropSql(table);
							setStatus('删除中… ' + table);
							runTreeAdminSql(db, sql, { confirmDangerous: true }).then(function () {
								closeTabsForTable(db, table);
								reloadTables();
								uiToast('已删除表: ' + table, 'ok');
								setStatus('已删除: ' + db + '.' + table);
							}).catch(function (err) {
								uiToast('删除失败: ' + sqlErrMsg(err), 'err');
								setStatus('删除失败: ' + sqlErrMsg(err));
							});
						});
					});
				}
			});
		}
		var menu = X.mk({
			xtype: 'menu',
			contextMenu: true,
			menu: items
		});
		if (menu && menu.el && !menu.el.parentNode) {
			document.body.appendChild(menu.el);
		}
		if (menu && typeof menu.showAt === 'function') {
			menu.showAt(x, y);
		}
	}

	/** 左侧树高亮并滚动到指定表 */
	function selectTreeTable(db, table) {
		if (!_treeHost || !table) {
			clearTreeSelection();
			return;
		}
		var root = _treeHost.querySelector('.xtre');
		if (!root) return;
		var all = root.querySelectorAll('.nd.sel');
		var i;
		for (i = 0; i < all.length; i++) all[i].classList.remove('sel');

		var nodes = root.querySelectorAll('.nd[data-table]');
		var hit = null, nd, tName, tDb;
		for (i = 0; i < nodes.length; i++) {
			nd = nodes[i];
			tName = nd.getAttribute('data-table') || '';
			tDb = nd.getAttribute('data-db') || '';
			if (tName === table && (!db || !tDb || tDb === db)) {
				hit = nd;
				break;
			}
		}
		if (!hit) return;
		hit.classList.add('sel');
		// 滚到可见：优先树容器，其次 west 滚动区
		try {
			if (hit.scrollIntoView) {
				hit.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
			}
		} catch (ex) {
			try { hit.scrollIntoView(true); } catch (ex2) { /* */ }
		}
	}

	function clearTreeSelection() {
		if (!_treeHost) return;
		var all = _treeHost.querySelectorAll('.xtre .nd.sel');
		var i;
		for (i = 0; i < all.length; i++) all[i].classList.remove('sel');
	}

	/** 按当前活动 Tab 同步左侧树选中 */
	function syncTreeToActiveTab() {
		if (!_tabpnl) return;
		var id = _tabpnl._act;
		var info = id && _openTabs[id] ? _openTabs[id] : null;
		if (!info || info.kind === 'server' || info.kind === 'sql' || info.kind === 'database') {
			// 非表页：取消表高亮（库根节点保持）
			if (!info || info.kind !== 'table') clearTreeSelection();
			return;
		}
		if (info.kind === 'table' || info.table) {
			// 若树当前库与 tab 库不一致，仅高亮同名（切库不在此强制）
			selectTreeTable(info.database || _currentDb, info.table);
		}
	}

	/**
	 * 打开表 Tab（已存在则切换）
	 * spec.mode: data|struct|alter
	 * spec.initial: { where, sort, limit, page, mode } 用于 hash 恢复
	 */
	/** 已打开的表 Tab 涉及几个不同数据库 */
	function countOpenTableDatabases() {
		var seen = {}, n = 0, id, info;
		for (id in _openTabs) {
			if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
			info = _openTabs[id];
			if (!info || info.kind !== 'table' || !info.database) continue;
			if (!seen[info.database]) {
				seen[info.database] = true;
				n++;
			}
		}
		return n;
	}

	/** 单库只显示表名；多库显示 库.表 */
	function tableTabTitle(database, table) {
		if (countOpenTableDatabases() > 1) return database + '.' + table;
		return table;
	}

	/** 打开/关闭表后刷新全部表 Tab 标题 */
	function refreshTableTabTitles() {
		if (!_tabpnl || typeof _tabpnl.setTitle !== 'function') return;
		var multi = countOpenTableDatabases() > 1;
		var id, info, title;
		for (id in _openTabs) {
			if (!Object.prototype.hasOwnProperty.call(_openTabs, id)) continue;
			info = _openTabs[id];
			if (!info || info.kind !== 'table') continue;
			title = multi ? (info.database + '.' + info.table) : info.table;
			_tabpnl.setTitle(id, title);
		}
	}

	function openTable(spec) {
		if (!_tabpnl) return;
		var database = spec.database || _currentDb;
		var table = spec.table;
		if (!database || !table) return;

		var mode = spec.mode || (spec.initial && spec.initial.mode) || 'data';
		if (mode !== 'data' && mode !== 'struct' && mode !== 'alter') mode = 'data';

		var tabId = makeTableTabId(database, table);
		if (_openTabs[tabId]) {
			_tabpnl.activate(tabId);
			var existing = _openTabs[tabId].inst;
			if (existing && typeof existing.setMode === 'function') {
				try { existing.setMode(mode); } catch (exMode) { /* */ }
			}
			setStatus(_('app.switched', { name: database + '.' + table }));
			syncHashFromActiveTab();
			selectTreeTable(database, table);
			return;
		}

		var readonly = !!( _connection && _connection.readonly );
		setStatus(_('app.openTable', { name: database + '.' + table }));

		var initial = {};
		if (spec.initial) {
			var k0;
			for (k0 in spec.initial) {
				if (Object.prototype.hasOwnProperty.call(spec.initial, k0)) {
					initial[k0] = spec.initial[k0];
				}
			}
		}
		initial.mode = mode;

		_openTabs[tabId] = { database: database, table: table, kind: 'table', inst: null };
		// 先按「加入后」的库数决定标题（新 tab 已写入 _openTabs）
		_tabpnl.add({
			id: tabId,
			title: tableTabTitle(database, table),
			content: function () {
				return SqlmngerTablePage.create({
					database: database,
					table: table,
					readonly: readonly,
					initial: initial,
					onStateChange: function (st) {
						// 仅当前活动 tab 写 hash
						if (_tabpnl && _tabpnl._act === tabId) {
							scheduleHashWrite(st);
						}
					}
				}).then(function (inst) {
					if (_openTabs[tabId]) _openTabs[tabId].inst = inst;
					if (_tabpnl && _tabpnl._act === tabId) {
						syncHashFromActiveTab();
						updateBreadcrumbFromTab(tabId);
						selectTreeTable(database, table);
					}
					return inst;
				});
			}
		});
		// 若因此变成多库，刷新其它表 Tab 为 库.表
		refreshTableTabTitles();
		updateBreadcrumbFromTab(tabId);
		selectTreeTable(database, table);
	}

	function onTabClose(id) {
		if (_openTabs[id]) delete _openTabs[id];
		// 关闭后可能从多库变回单库，收起库名前缀
		refreshTableTabTitles();
		// 关闭后 sync 新活动 tab（activate 会触发 tabchange）
		setTimeout(function () {
			syncHashFromActiveTab();
			syncTreeToActiveTab();
		}, 0);
	}

	function onTabChange(id) {
		var info = _openTabs[id];
		if (!info) return;
		if (info.kind === 'sql') setStatus(_('app.sqlCmd', { db: info.database }));
		else if (info.kind === 'server') setStatus(_('app.server'));
		else if (info.kind === 'database') setStatus(_('app.currentDb', { db: info.database }));
		else setStatus(_('app.current', { name: info.database + '.' + info.table }));
		syncHashFromActiveTab();
		updateBreadcrumbFromTab(id);
		syncTreeToActiveTab();
	}

	function makeTableTabId(db, table) {
		return 'tab_tbl_' + String(db).replace(/[^\w\-.]/g, '_') +
			'__' + String(table).replace(/[^\w\-.]/g, '_');
	}

	function logout() {
		SqlmngerApi.post('api/auth_logout.php', {}).then(function () {
			_connection = null;
			_currentDb = '';
			// 清除本 Tab 的 c，其它 Tab URL 不变
			SqlmngerApi.setConnId('');
			SqlmngerApi.writeConnIdToUrl('', { db: null });
			clearMain();
			SqlmngerApi.get('api/auth_me.php', {}).then(function (env) {
				showLogin(env.data || {});
			}).catch(function () {
				showLogin({});
			});
		}).catch(function () {
			SqlmngerApi.setConnId('');
			SqlmngerApi.writeConnIdToUrl('', { db: null });
			clearMain();
			showLogin({});
		});
	}

	function clearMain() {
		var vps = document.querySelectorAll('.xvp');
		var i;
		for (i = 0; i < vps.length; i++) {
			if (vps[i].parentNode) vps[i].parentNode.removeChild(vps[i]);
		}
		_tabpnl = null;
		_statbar = null;
		_titlebar = null;
		_treeHost = null;
		_dbCombo = null;
		_breadcrumb = null;
		_allTables = [];
		_tableFilter = '';
		_openTabs = {};
		_hashRestored = false;
		_pendingHash = null;
		if (_hashTimer) { clearTimeout(_hashTimer); _hashTimer = null; }
	}

	function formatConn(c) {
		if (!c) return '未连接';
		if (c.driver === 'sqlite') return 'SQLite · ' + (c.path || '');
		var host = c.host || '';
		var port = c.port != null ? c.port : '';
		var db = c.database ? '/' + c.database : '';
		var user = c.user ? (c.user + '@') : '';
		var ro = c.readonly ? ' · 只读' : '';
		var ssl = '';
		if (c.driver === 'mssql_tcp' || c.driver === 'mssql_net') {
			ssl = (c.tls || c.ssl) ? ' · SSL' : ' · 明文';
		}
		return (c.driver || '') + ' · ' + user + host + (port ? (':' + port) : '') + db + ssl + ro;
	}

	function setStatus(text) {
		if (_statbar && typeof _statbar.setleft === 'function') _statbar.setleft(text);
		if (window.console && console.log) console.log('[sqlmnger]', text);
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
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function escAttr(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;');
	}

	function detectBase() {
		var path = location.pathname.replace(/\\/g, '/');
		if (path.slice(-1) === '/') return path;
		var i = path.lastIndexOf('/');
		return i >= 0 ? path.slice(0, i + 1) : './';
	}
})();

(function () {
	function boot() {
		if (typeof X === 'undefined') {
			console.error('XUI core.js 未加载');
			return;
		}
		SqlmngerApp.start();
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
