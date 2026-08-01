/**
 * 数据库登录页（IIFE）
 * 选择引擎、IP/端口、账号密码（或 SQLite 路径）后 AJAX 登录进入系统
 * 连接配置保存在浏览器 localStorage（连接管理）
 */
window.SqlmngerLogin = (function () {
	var STORAGE_KEY = 'sqlmnger_saved_conns';
	var ACTIVE_KEY = 'sqlmnger_active_conn_id';

	var t = {
		show: show,
		hide: hide,
		getLastDrivers: function () { return _drivers; }
	};

	var _root = null;
	var _drivers = [];
	var _onSuccess = null;
	var _reuseConnId = '';
	var _allowEmptyPassword = true;
	/** 当前表单对应的已保存连接 id（新建为空） */
	var _activeProfileId = '';
	/**
	 * 已保存密码仅放内存，不写入 password 输入框明文，降低调试面板一眼可见的风险。
	 * localStorage 中存 passwordEnc（混淆，非加密）。
	 */
	var _vaultPass = null;
	var _passDirty = false;
	var _state = {
		driver: 'mysql',
		host: '127.0.0.1',
		port: 3306,
		database: '',
		user: 'root',
		password: '',
		path: 'demo.db',
		readonly: false
	};
	var _els = {};

	return t;

	function _(k, vars) {
		return (window.SqlmngerI18n && SqlmngerI18n.t) ? SqlmngerI18n.t(k, vars) : k;
	}
	function esc(s) {
		if (s == null) return '';
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
	function escAttr(s) {
		return esc(s).replace(/'/g, '&#39;');
	}

	// ─── 密码混淆（防闲看，非安全加密） ───
	// localStorage 不写明文；输入框自动填充时也不写明文 value

	var PASS_SALT = 'sqlmnger.v1.pw';

	function utf8ToBytes(str) {
		var s = String(str == null ? '' : str);
		if (typeof TextEncoder !== 'undefined') {
			return Array.prototype.slice.call(new TextEncoder().encode(s));
		}
		// 简易 UTF-8
		var out = [], i, c;
		for (i = 0; i < s.length; i++) {
			c = s.charCodeAt(i);
			if (c < 0x80) out.push(c);
			else if (c < 0x800) {
				out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
			} else {
				out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
			}
		}
		return out;
	}

	function bytesToUtf8(bytes) {
		if (typeof TextDecoder !== 'undefined') {
			try {
				return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
			} catch (e) { /* fall */ }
		}
		var out = '', i = 0, c, c2, c3;
		while (i < bytes.length) {
			c = bytes[i++];
			if (c < 0x80) out += String.fromCharCode(c);
			else if ((c & 0xE0) === 0xC0) {
				c2 = bytes[i++];
				out += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F));
			} else {
				c2 = bytes[i++];
				c3 = bytes[i++];
				out += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
			}
		}
		return out;
	}

	function b64encode(bytes) {
		var bin = '', i;
		for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] & 0xFF);
		try {
			return btoa(bin);
		} catch (e) {
			return '';
		}
	}

	function b64decode(str) {
		try {
			var bin = atob(String(str || ''));
			var out = [], i;
			for (i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i) & 0xFF);
			return out;
		} catch (e) {
			return [];
		}
	}

	/** 混淆：XOR + Base64，密钥由档案 id 派生；防 localStorage 明文窥视 */
	function obfuscatePassword(plain, profileId) {
		plain = String(plain == null ? '' : plain);
		if (!plain) return '';
		var key = utf8ToBytes(PASS_SALT + '|' + String(profileId || '') + '|' + PASS_SALT);
		if (!key.length) key = [0x5A];
		var data = utf8ToBytes(plain);
		var out = [], i;
		// 前缀随机 2 字节，每次保存形态不同
		var r0 = Math.floor(Math.random() * 256);
		var r1 = Math.floor(Math.random() * 256);
		out.push(r0, r1);
		for (i = 0; i < data.length; i++) {
			out.push((data[i] ^ key[(i + r0 + r1) % key.length] ^ ((r0 + i * 13) & 0xFF)) & 0xFF);
		}
		return 'v1:' + b64encode(out);
	}

	function deobfuscatePassword(enc, profileId) {
		enc = String(enc == null ? '' : enc);
		if (!enc) return '';
		// 兼容旧版明文
		if (enc.indexOf('v1:') !== 0) {
			return enc;
		}
		var raw = b64decode(enc.slice(3));
		if (raw.length < 2) return '';
		var r0 = raw[0], r1 = raw[1];
		var key = utf8ToBytes(PASS_SALT + '|' + String(profileId || '') + '|' + PASS_SALT);
		if (!key.length) key = [0x5A];
		var data = [], i;
		for (i = 2; i < raw.length; i++) {
			data.push((raw[i] ^ key[((i - 2) + r0 + r1) % key.length] ^ ((r0 + (i - 2) * 13) & 0xFF)) & 0xFF);
		}
		try {
			return bytesToUtf8(data);
		} catch (e) {
			return '';
		}
	}

	function clearVaultPass() {
		_vaultPass = null;
		_passDirty = false;
		if (_els.password) {
			_els.password.value = '';
			_els.password.removeAttribute('data-vault');
			_els.password.placeholder = '';
			_els.password.classList.remove('is-vault-pass');
		}
	}

	/** 使用已保存密码：输入框不放明文，只标记“已载入” */
	function setVaultPass(plain) {
		_vaultPass = plain == null ? null : String(plain);
		_passDirty = false;
		if (!_els.password) return;
		// 故意不写真实密码到 value，避免 Elements/调试器直接看到
		_els.password.value = '';
		if (_vaultPass !== null && _vaultPass !== '') {
			_els.password.setAttribute('data-vault', '1');
			_els.password.placeholder = _('login.passSavedPh');
			_els.password.classList.add('is-vault-pass');
		} else {
			_els.password.removeAttribute('data-vault');
			_els.password.placeholder = '';
			_els.password.classList.remove('is-vault-pass');
		}
	}

	function resolvePasswordForSubmit() {
		// 用户改过输入框 → 以输入为准
		if (_passDirty) {
			return _els.password ? String(_els.password.value) : '';
		}
		// 未改且有 vault → 用内存中的真实密码
		if (_vaultPass != null && _vaultPass !== '') {
			return _vaultPass;
		}
		return _els.password ? String(_els.password.value) : '';
	}

	function bindPasswordGuard() {
		if (!_els.password || _els.password._vaultBound) return;
		_els.password._vaultBound = true;
		_els.password.addEventListener('input', function () {
			_passDirty = true;
			_vaultPass = null;
			_els.password.removeAttribute('data-vault');
			_els.password.classList.remove('is-vault-pass');
			_els.password.placeholder = '';
		});
		_els.password.addEventListener('focus', function () {
			// 聚焦时若仍是 vault 态，保持空，提示用户可直接连或改密
			if (!_passDirty && _vaultPass != null) {
				_els.password.value = '';
			}
		});
	}

	// ─── localStorage 连接档案 ───

	function loadProfiles() {
		try {
			var raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			var arr = JSON.parse(raw);
			if (!arr || !arr.length) return [];
			var out = [], i, p, migrated = false;
			for (i = 0; i < arr.length; i++) {
				p = normalizeProfile(arr[i]);
				if (p) {
					// 旧版明文 password → 升级为 passwordEnc
					if (p.savePassword && p._plainMigrate != null) {
						p.passwordEnc = obfuscatePassword(p._plainMigrate, p.id);
						delete p._plainMigrate;
						migrated = true;
					}
					out.push(p);
				}
			}
			// 最近使用优先
			out.sort(function (a, b) {
				return (b.updatedAt || 0) - (a.updatedAt || 0);
			});
			if (migrated) saveProfiles(out);
			return out;
		} catch (e) {
			return [];
		}
	}

	function saveProfiles(list) {
		try {
			// 落盘前去掉任何残留明文 password 字段
			var safe = [], i, p, copy;
			for (i = 0; i < (list || []).length; i++) {
				p = list[i];
				if (!p) continue;
				copy = {};
				copy.id = p.id;
				copy.name = p.name;
				copy.driver = p.driver;
				copy.host = p.host;
				copy.port = p.port;
				copy.database = p.database;
				copy.user = p.user;
				copy.path = p.path;
				copy.readonly = !!p.readonly;
				copy.savePassword = !!p.savePassword;
				copy.passwordEnc = p.savePassword && p.passwordEnc ? String(p.passwordEnc) : '';
				copy.updatedAt = p.updatedAt;
				// 绝不写 password 明文
				safe.push(copy);
			}
			localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
			return true;
		} catch (e) {
			return false;
		}
	}

	function normalizeProfile(p) {
		if (!p || typeof p !== 'object') return null;
		var id = p.id != null ? String(p.id) : '';
		if (!id) id = genId();
		var savePw = !!p.savePassword;
		var enc = p.passwordEnc != null ? String(p.passwordEnc) : '';
		var plainLegacy = null;
		// 兼容旧数据：password 明文
		if (savePw && !enc && p.password != null && String(p.password) !== '') {
			plainLegacy = String(p.password);
		}
		var out = {
			id: id,
			name: p.name != null ? String(p.name) : '',
			driver: p.driver != null ? String(p.driver) : 'mysql',
			host: p.host != null ? String(p.host) : '127.0.0.1',
			port: parseInt(p.port, 10) || 0,
			database: p.database != null ? String(p.database) : '',
			user: p.user != null ? String(p.user) : '',
			path: p.path != null ? String(p.path) : '',
			readonly: !!p.readonly,
			forceSsl: !!p.forceSsl,
			savePassword: savePw,
			passwordEnc: enc,
			updatedAt: p.updatedAt != null ? Number(p.updatedAt) : Date.now()
		};
		if (plainLegacy != null) out._plainMigrate = plainLegacy;
		return out;
	}

	function profilePlainPassword(p) {
		if (!p || !p.savePassword) return '';
		if (p.passwordEnc) return deobfuscatePassword(p.passwordEnc, p.id);
		if (p._plainMigrate != null) return p._plainMigrate;
		return '';
	}

	function genId() {
		return 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
	}

	function findProfile(id) {
		var list = loadProfiles(), i;
		for (i = 0; i < list.length; i++) {
			if (list[i].id === id) return list[i];
		}
		return null;
	}

	function upsertProfile(prof) {
		var list = loadProfiles();
		var i, found = false;
		prof.updatedAt = Date.now();
		for (i = 0; i < list.length; i++) {
			if (list[i].id === prof.id) {
				list[i] = prof;
				found = true;
				break;
			}
		}
		if (!found) list.unshift(prof);
		saveProfiles(list);
		try { localStorage.setItem(ACTIVE_KEY, prof.id); } catch (e) { /* */ }
		return prof;
	}

	function removeProfile(id) {
		var list = loadProfiles().filter(function (p) { return p.id !== id; });
		saveProfiles(list);
		if (_activeProfileId === id) _activeProfileId = '';
		try {
			if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
		} catch (e) { /* */ }
	}

	/** 根据表单内容生成默认显示名 */
	function defaultProfileName(body) {
		var drv = body.driver || 'mysql';
		var label = driverShortLabel(drv);
		if (drv === 'sqlite') {
			return label + ' · ' + (body.path || 'sqlite');
		}
		var host = body.host || '127.0.0.1';
		var port = body.port > 0 ? body.port : '';
		var mid = host + (port ? (':' + port) : '');
		if (body.database) mid += ' / ' + body.database;
		if (body.user) mid += ' · ' + body.user;
		return label + ' · ' + mid;
	}

	function driverShortLabel(drv) {
		if (drv === 'mysql') return 'MySQL';
		if (drv === 'sqlite') return 'SQLite';
		if (drv === 'sqlsrv') return 'SQL Server';
		if (drv === 'mssql_tcp') return 'MSSQL TCP';
		if (drv === 'mssql_net') return 'MSSQL .NET';
		return drv || '?';
	}

	function profileSubtitle(p) {
		if (p.driver === 'sqlite') {
			return (p.path || '') + (p.readonly ? ' · RO' : '');
		}
		var s = (p.host || '') + (p.port ? (':' + p.port) : '');
		if (p.database) s += ' / ' + p.database;
		if (p.user) s += ' · ' + p.user;
		if (p.readonly) s += ' · RO';
		return s;
	}

	/**
	 * @param {object} opts
	 * @param {Array} [opts.drivers]
	 * @param {boolean} [opts.allowEmptyPassword]
	 * @param {string} [opts.connId]
	 * @param {function(object)} opts.onSuccess
	 */
	function show(opts) {
		opts = opts || {};
		_onSuccess = opts.onSuccess || null;
		_drivers = opts.drivers || [];
		_reuseConnId = opts.connId || '';
		_allowEmptyPassword = opts.allowEmptyPassword !== false;
		ensureDom();
		_root.style.display = 'flex';
		fillDriverSelect();
		// 恢复上次选中的连接
		var lastId = '';
		try { lastId = localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) { lastId = ''; }
		if (lastId && findProfile(lastId)) {
			applyProfile(findProfile(lastId), false);
		} else {
			applyDriverUi();
			updatePassHint();
			// 表单保持上次 _state 的 host/user
			if (_els.host) _els.host.value = _state.host;
			if (_els.port) _els.port.value = _state.port;
			if (_els.user) _els.user.value = _state.user;
			if (_els.path) _els.path.value = _state.path;
		}
		renderConnList();
		setMsg('');
	}

	function hide() {
		if (_root) _root.style.display = 'none';
	}

	function ensureDom() {
		if (_root) return;

		_root = document.createElement('div');
		_root.className = 'sqlmnger-login-mask';
		_root.innerHTML =
			'<div class="sqlmnger-login-card sqlmnger-login-card-wide">' +
			'  <div class="sqlmnger-login-lang" data-lang-host></div>' +
			'  <div class="sqlmnger-login-hd">' +
			'    <div class="sqlmnger-login-logo"><i class="fa-solid fa-database"></i></div>' +
			'    <div>' +
			'      <div class="sqlmnger-login-title">sqlmnger <span class="sqlmnger-login-ver">v1.0.3</span></div>' +
			'      <div class="sqlmnger-login-sub">' + esc(_('login.sub')) + '</div>' +
			'    </div>' +
			'  </div>' +
			'  <div class="sqlmnger-login-main">' +
			'    <aside class="sqlmnger-conn-panel">' +
			'      <div class="sqlmnger-conn-panel-hd">' +
			'        <span><i class="fa-solid fa-bookmark"></i> ' + esc(_('login.savedConns')) + '</span>' +
			'      </div>' +
			'      <div class="sqlmnger-conn-list" data-role="conn-list"></div>' +
			'      <div class="sqlmnger-conn-panel-ft">' +
			'        <button type="button" class="sqlmnger-conn-btn" data-act="new-conn" title="' + escAttr(_('login.newConn')) + '">' +
			'          <i class="fa-solid fa-plus"></i> ' + esc(_('login.newConn')) +
			'        </button>' +
			'      </div>' +
			'      <p class="sqlmnger-conn-hint">' + esc(_('login.localHint')) + '</p>' +
			'    </aside>' +
			'    <form class="sqlmnger-login-form" autocomplete="off">' +
			'      <label class="sqlmnger-field"><span>' + esc(_('login.connName')) + '</span>' +
			'        <input type="text" name="connName" class="sqlmnger-input" placeholder="' + escAttr(_('login.connNamePh')) + '" />' +
			'      </label>' +
			'      <label class="sqlmnger-field"><span>' + esc(_('login.engine')) + '</span>' +
			'        <select name="driver" class="sqlmnger-input"></select>' +
			'      </label>' +
			'      <div class="sqlmnger-net-fields">' +
			'        <label class="sqlmnger-field"><span>' + esc(_('login.host')) + '</span>' +
			'          <input type="text" name="host" class="sqlmnger-input" placeholder="127.0.0.1" />' +
			'        </label>' +
			'        <label class="sqlmnger-field sqlmnger-field-port"><span>' + esc(_('login.port')) + '</span>' +
			'          <input type="number" name="port" class="sqlmnger-input" />' +
			'        </label>' +
			'      </div>' +
			'      <label class="sqlmnger-field sqlmnger-field-db"><span>' + esc(_('login.dbOptional')) +
			' <em>' + esc(_('login.dbOptionalHint')) + '</em></span>' +
			'        <input type="text" name="database" class="sqlmnger-input" placeholder="' + escAttr(_('login.dbPlaceholder')) + '" />' +
			'      </label>' +
			'      <label class="sqlmnger-field sqlmnger-field-user"><span>' + esc(_('login.account')) + '</span>' +
			'        <input type="text" name="user" class="sqlmnger-input" autocomplete="username" />' +
			'      </label>' +
			'      <label class="sqlmnger-field sqlmnger-field-pass"><span class="sqlmnger-pass-label">' + esc(_('login.password')) + '</span>' +
			'        <input type="password" name="password" class="sqlmnger-input" autocomplete="current-password" />' +
			'      </label>' +
			'      <label class="sqlmnger-field sqlmnger-field-path" style="display:none"><span>' + esc(_('login.sqlitePath')) + '</span>' +
			'        <input type="text" name="path" class="sqlmnger-input" placeholder="' + escAttr(_('login.sqlitePh')) + '" />' +
			'        <small class="sqlmnger-hint">' + esc(_('login.sqliteHint')) + '</small>' +
			'      </label>' +
			'      <label class="sqlmnger-check">' +
			'        <input type="checkbox" name="readonly" /> ' + esc(_('login.readonly')) +
			'      </label>' +
			'      <label class="sqlmnger-check sqlmnger-check-forcessl" style="display:none">' +
			'        <input type="checkbox" name="forceSsl" /> ' + esc(_('login.forceSsl')) +
			'        <small class="sqlmnger-hint">' + esc(_('login.forceSslHint')) + '</small>' +
			'      </label>' +
			'      <label class="sqlmnger-check sqlmnger-check-savepass">' +
			'        <input type="checkbox" name="savePassword" /> ' + esc(_('login.savePassword')) +
			'      </label>' +
			'      <div class="sqlmnger-login-actions">' +
			'        <button type="button" class="sqlmnger-login-btn secondary" data-act="save-conn">' +
			'          <i class="fa-solid fa-floppy-disk"></i> ' + esc(_('login.saveConn')) +
			'        </button>' +
			'        <button type="submit" class="sqlmnger-login-btn">' +
			'          <i class="fa-solid fa-plug"></i> ' + esc(_('login.connect')) +
			'        </button>' +
			'      </div>' +
			'      <div class="sqlmnger-login-msg" role="alert"></div>' +
			'    </form>' +
			'  </div>' +
			'</div>';

		document.body.appendChild(_root);
		var langHost = _root.querySelector('[data-lang-host]');
		if (langHost && window.SqlmngerI18n && SqlmngerI18n.createLangDropdown) {
			langHost.appendChild(SqlmngerI18n.createLangDropdown({ cls: 'sqlmnger-lang-dd-login' }));
		}

		var form = _root.querySelector('form');
		_els.driver = form.querySelector('[name=driver]');
		_els.host = form.querySelector('[name=host]');
		_els.port = form.querySelector('[name=port]');
		_els.database = form.querySelector('[name=database]');
		_els.user = form.querySelector('[name=user]');
		_els.password = form.querySelector('[name=password]');
		_els.passLabel = form.querySelector('.sqlmnger-pass-label');
		_els.path = form.querySelector('[name=path]');
		_els.readonly = form.querySelector('[name=readonly]');
		_els.forceSsl = form.querySelector('[name=forceSsl]');
		_els.savePass = form.querySelector('[name=savePassword]');
		_els.connName = form.querySelector('[name=connName]');
		_els.fieldForceSsl = form.querySelector('.sqlmnger-check-forcessl');
		_els.msg = _root.querySelector('.sqlmnger-login-msg');
		_els.net = _root.querySelector('.sqlmnger-net-fields');
		_els.fieldDb = _root.querySelector('.sqlmnger-field-db');
		_els.fieldUser = _root.querySelector('.sqlmnger-field-user');
		_els.fieldPass = _root.querySelector('.sqlmnger-field-pass');
		_els.fieldPath = _root.querySelector('.sqlmnger-field-path');
		_els.btn = form.querySelector('button[type=submit]');
		_els.connList = _root.querySelector('[data-role=conn-list]');
		_els.saveBtn = form.querySelector('[data-act=save-conn]');
		_els.newBtn = _root.querySelector('[data-act=new-conn]');

		_els.host.value = _state.host;
		_els.port.value = _state.port;
		_els.user.value = _state.user;
		_els.path.value = _state.path;
		bindPasswordGuard();

		_els.driver.onchange = function () {
			_state.driver = _els.driver.value;
			if (_state.driver === 'mysql') _els.port.value = 3306;
			if (_state.driver === 'sqlsrv' || _state.driver === 'mssql_tcp' || _state.driver === 'mssql_net') _els.port.value = 1433;
			applyDriverUi();
		};

		form.onsubmit = function (e) {
			if (e && e.preventDefault) e.preventDefault();
			doLogin();
			return false;
		};

		if (_els.saveBtn) {
			_els.saveBtn.onclick = function (e) {
				if (e) { e.preventDefault(); e.stopPropagation(); }
				doSaveProfile();
			};
		}
		if (_els.newBtn) {
			_els.newBtn.onclick = function (e) {
				if (e) { e.preventDefault(); e.stopPropagation(); }
				clearFormNew();
			};
		}
		if (_els.connList) {
			_els.connList.onclick = function (e) {
				var tEl = e.target;
				while (tEl && tEl !== _els.connList) {
					if (tEl.getAttribute && tEl.getAttribute('data-del')) {
						e.preventDefault();
						e.stopPropagation();
						var delId = tEl.getAttribute('data-del');
						if (delId) {
							if (window.confirm(_('login.confirmDel'))) {
								removeProfile(delId);
								if (_activeProfileId === delId) clearFormNew();
								renderConnList();
								setMsg(_('login.deleted'), 'ok');
							}
						}
						return;
					}
					if (tEl.classList && tEl.classList.contains('sqlmnger-conn-item')) {
						e.preventDefault();
						var pid = tEl.getAttribute('data-id');
						var prof = findProfile(pid);
						if (prof) {
							applyProfile(prof, true);
							renderConnList();
							setMsg(_('login.loaded'), 'info');
						}
						return;
					}
					tEl = tEl.parentNode;
				}
			};
		}
	}

	function renderConnList() {
		if (!_els.connList) return;
		var list = loadProfiles();
		if (!list.length) {
			_els.connList.innerHTML =
				'<div class="sqlmnger-conn-empty">' +
				esc(_('login.noSaved')).replace(/\n/g, '<br>') +
				'</div>';
			return;
		}
		var html = '', i, p, act;
		for (i = 0; i < list.length; i++) {
			p = list[i];
			act = (p.id === _activeProfileId) ? ' is-active' : '';
			html +=
				'<div class="sqlmnger-conn-item' + act + '" data-id="' + escAttr(p.id) + '" title="' + escAttr(p.name || profileSubtitle(p)) + '">' +
				'  <div class="sqlmnger-conn-item-main">' +
				'    <div class="sqlmnger-conn-item-name">' + esc(p.name || defaultProfileName(p)) + '</div>' +
				'    <div class="sqlmnger-conn-item-sub">' +
				'      <span class="sqlmnger-conn-badge">' + esc(driverShortLabel(p.driver)) + '</span> ' +
				esc(profileSubtitle(p)) +
				'    </div>' +
				'  </div>' +
				'  <button type="button" class="sqlmnger-conn-del" data-del="' + escAttr(p.id) + '" title="' + escAttr(_('login.deleteConn')) + '">' +
				'    <i class="fa-solid fa-trash-can"></i>' +
				'  </button>' +
				'</div>';
		}
		_els.connList.innerHTML = html;
	}

	function clearFormNew() {
		_activeProfileId = '';
		try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* */ }
		if (_els.connName) _els.connName.value = '';
		clearVaultPass();
		if (_els.database) _els.database.value = '';
		if (_els.readonly) _els.readonly.checked = false;
		if (_els.forceSsl) _els.forceSsl.checked = false;
		if (_els.savePass) _els.savePass.checked = false;
		// 保留 host/user 便于改连
		fillDriverSelect();
		applyDriverUi();
		renderConnList();
		setMsg(_('login.newForm'), 'info');
	}

	function applyProfile(p, fromClick) {
		if (!p) return;
		_activeProfileId = p.id;
		try { localStorage.setItem(ACTIVE_KEY, p.id); } catch (e) { /* */ }

		// 确保 driver 在 select 中
		if (_els.driver) {
			var has = false, i, o;
			for (i = 0; i < _els.driver.options.length; i++) {
				if (_els.driver.options[i].value === p.driver) {
					has = true;
					break;
				}
			}
			if (!has) {
				o = document.createElement('option');
				o.value = p.driver;
				o.textContent = p.driver + '（' + _('login.driverMissing') + '）';
				_els.driver.appendChild(o);
			}
			_els.driver.value = p.driver;
		}
		_state.driver = p.driver;
		if (_els.host) _els.host.value = p.host || '127.0.0.1';
		if (_els.port) _els.port.value = p.port > 0 ? p.port : (p.driver === 'mysql' ? 3306 : 1433);
		if (_els.forceSsl) _els.forceSsl.checked = !!p.forceSsl;
		if (_els.database) _els.database.value = p.database || '';
		if (_els.user) _els.user.value = p.user || '';
		if (_els.path) _els.path.value = p.path || '';
		if (_els.readonly) _els.readonly.checked = !!p.readonly;
		if (_els.savePass) _els.savePass.checked = !!p.savePassword;
		// 密码：解密进 vault，输入框不填明文
		if (p.savePassword) {
			setVaultPass(profilePlainPassword(p));
		} else {
			clearVaultPass();
		}
		if (_els.connName) _els.connName.value = p.name || '';
		applyDriverUi();
		updatePassHint();
		if (!fromClick) { /* show() 里会 render */ }
	}

	function readFormBody() {
		var driver = _els.driver ? _els.driver.value : 'mysql';
		var forceSsl = !!( _els.forceSsl && _els.forceSsl.checked );
		var body = {
			driver: driver,
			host: _els.host ? String(_els.host.value).trim() : '',
			port: _els.port ? (parseInt(_els.port.value, 10) || 0) : 0,
			database: _els.database ? String(_els.database.value).trim() : '',
			user: _els.user ? String(_els.user.value) : '',
			password: resolvePasswordForSubmit(),
			path: _els.path ? String(_els.path.value).trim() : '',
			readonly: !!( _els.readonly && _els.readonly.checked ),
			force_ssl: forceSsl
		};
		// SQL Server TDS / .NET CLI：强制 SSL → require；未勾选用 auto
		if (driver === 'mssql_tcp' || driver === 'mssql_net') {
			body.encrypt = forceSsl ? 'require' : 'auto';
		}
		return body;
	}

	function doSaveProfile() {
		var body = readFormBody();
		var savePw = !!( _els.savePass && _els.savePass.checked );
		var name = _els.connName ? String(_els.connName.value).trim() : '';
		if (!name) name = defaultProfileName(body);

		var id = _activeProfileId || genId();
		var prof = {
			id: id,
			name: name,
			driver: body.driver,
			host: body.host,
			port: body.port,
			database: body.database,
			user: body.user,
			path: body.path,
			readonly: body.readonly,
			forceSsl: !!body.force_ssl,
			savePassword: savePw,
			passwordEnc: '',
			updatedAt: Date.now()
		};
		if (savePw) {
			// 有输入或 vault 中的真实密码
			var plain = body.password;
			if (plain === '' && _vaultPass) plain = _vaultPass;
			prof.passwordEnc = plain ? obfuscatePassword(plain, id) : '';
			if (!prof.passwordEnc) {
				// 无密码可存
				prof.savePassword = false;
			} else {
				// 保存后继续用 vault，不回填输入框
				setVaultPass(plain);
				if (_els.savePass) _els.savePass.checked = true;
			}
		} else {
			clearVaultPass();
		}
		upsertProfile(prof);
		_activeProfileId = prof.id;
		if (_els.connName) _els.connName.value = name;
		renderConnList();
		setMsg(prof.savePassword ? _('login.savedWithPass') : _('login.saved'), 'ok');
	}

	function fillDriverSelect() {
		var sel = _els.driver;
		if (!sel) return;
		var prev = sel.value || _state.driver;
		sel.innerHTML = '';
		var list = _drivers && _drivers.length ? _drivers : [
			{ id: 'mysql', label: 'MySQL / MariaDB', available: true },
			{ id: 'sqlite', label: 'SQLite', available: true },
			{ id: 'sqlsrv', label: 'SQL Server (sqlsrv)', available: true },
			{ id: 'mssql_tcp', label: 'SQL Server (TCP/TDS)', available: true },
			{ id: 'mssql_net', label: 'SQL Server (.NET CLI)', available: true }
		];
		var i, d, opt, first = null;
		for (i = 0; i < list.length; i++) {
			d = list[i];
			opt = document.createElement('option');
			opt.value = d.id;
			opt.textContent = d.label + (d.available ? '' : '（' + _('login.extOff') + '）');
			opt.disabled = !d.available;
			sel.appendChild(opt);
			if (d.available && !first) first = d.id;
		}
		if (prev) {
			try { sel.value = prev; } catch (e) { /* */ }
		}
		if (!sel.value && first) {
			sel.value = first;
			_state.driver = first;
			if (first === 'mysql') _els.port.value = 3306;
			if (first === 'sqlsrv' || first === 'mssql_tcp' || first === 'mssql_net') _els.port.value = 1433;
		} else if (sel.value) {
			_state.driver = sel.value;
		}
	}

	function applyDriverUi() {
		var drv = _els.driver ? _els.driver.value : '';
		var isSqlite = (drv === 'sqlite');
		var isMssqlEnc = (drv === 'mssql_tcp' || drv === 'mssql_net');
		if (_els.net) _els.net.style.display = isSqlite ? 'none' : 'flex';
		if (_els.fieldDb) _els.fieldDb.style.display = isSqlite ? 'none' : 'block';
		if (_els.fieldUser) _els.fieldUser.style.display = isSqlite ? 'none' : 'block';
		if (_els.fieldPass) _els.fieldPass.style.display = isSqlite ? 'none' : 'block';
		if (_els.fieldPath) _els.fieldPath.style.display = isSqlite ? 'block' : 'none';
		// SQLite 无密码，隐藏记住密码
		var sp = _root && _root.querySelector('.sqlmnger-check-savepass');
		if (sp) sp.style.display = isSqlite ? 'none' : 'flex';
		// 强制 SSL：TDS 纯 PHP / .NET CLI
		if (_els.fieldForceSsl) {
			_els.fieldForceSsl.style.display = isMssqlEnc ? 'flex' : 'none';
		}
		updatePassHint();
	}

	function updatePassHint() {
		if (!_els.passLabel) return;
		if (_allowEmptyPassword) {
			_els.passLabel.innerHTML = esc(_('login.password')) + ' <em>(' + esc(_('login.emptyPassHint')) + ')</em>';
		} else {
			_els.passLabel.textContent = _('login.password');
		}
	}

	function doLogin() {
		var body = readFormBody();
		// 前端预检：配置禁止空密码时（网络库）直接提示
		if (!_allowEmptyPassword && body.driver !== 'sqlite' && body.password === '') {
			setMsg(_('login.needPass'), 'err');
			return;
		}
		// 同 Tab 重连：复用 c
		if (_reuseConnId) body.c = _reuseConnId;

		// 连接成功前先把当前档案更新时间/字段同步（便于列表排序）
		// 真正写入在成功回调里

		setMsg(_('login.connecting'), 'info');
		if (_els.btn) _els.btn.disabled = true;

		SqlmngerApi.setConnId('');
		// 登录含 TLS/回退，给足时间但勿用全局 120s 默默挂死
		SqlmngerApi.post('api/auth_login.php', body, { timeoutMs: 45000 }).then(function (env) {
			if (_els.btn) _els.btn.disabled = false;
			// 登录成功：自动保存/更新连接（名称沿用或默认）
			autoSaveAfterLogin(body);
			setMsg(_('login.connect'), 'ok');
			if (typeof _onSuccess === 'function') {
				_onSuccess(env.data || {});
			}
		}).catch(function (err) {
			if (_els.btn) _els.btn.disabled = false;
			var msg = _('login.fail', { msg: '' });
			if (err && err.error) {
				if (err.error.code === 'TIMEOUT') {
					msg = '连接超时：请检查主机/端口、SQL Server 是否启动，或将 config mssql_tcp_encrypt 设为 disable 试明文';
				} else {
					msg = err.error.message || msg;
					if (err.error.detail) msg += ' — ' + err.error.detail;
				}
			}
			setMsg(msg, 'err');
		});
	}

	/** 连接成功后自动写入本地（方便下次一点即填） */
	function autoSaveAfterLogin(body) {
		var savePw = !!( _els.savePass && _els.savePass.checked );
		var name = _els.connName ? String(_els.connName.value).trim() : '';
		if (!name) name = defaultProfileName(body);
		var id = _activeProfileId || genId();
		var prof = {
			id: id,
			name: name,
			driver: body.driver,
			host: body.host,
			port: body.port,
			database: body.database,
			user: body.user,
			path: body.path,
			readonly: body.readonly,
			forceSsl: !!body.force_ssl,
			savePassword: savePw,
			passwordEnc: '',
			updatedAt: Date.now()
		};
		if (savePw && body.password) {
			prof.passwordEnc = obfuscatePassword(body.password, id);
			setVaultPass(body.password);
		} else if (!savePw) {
			clearVaultPass();
		} else if (savePw && _vaultPass) {
			// 用 vault 密码但 body 已带上
			prof.passwordEnc = obfuscatePassword(body.password || _vaultPass, id);
		}
		if (savePw && !prof.passwordEnc) {
			prof.savePassword = false;
		}
		upsertProfile(prof);
		_activeProfileId = prof.id;
		if (_els.connName) _els.connName.value = name;
	}

	function setMsg(text, kind) {
		if (!_els.msg) return;
		_els.msg.textContent = text || '';
		_els.msg.className = 'sqlmnger-login-msg' + (kind ? ' is-' + kind : '');
	}
})();
