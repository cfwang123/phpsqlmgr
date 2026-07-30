/**
 * sqlmnger AJAX / JSON 通信层（IIFE）
 * 所有请求自动附带连接 ID（?c= / body.c），支持多 Tab 不同库
 */
window.SqlmngerApi = (function () {
	var t = {
		baseUrl: '',
		connId: '',
		timeoutMs: 120000,
		downloadTimeoutMs: 600000,
		setBaseUrl: setBaseUrl,
		setConnId: setConnId,
		getConnId: getConnId,
		get: get,
		post: post,
		request: request,
		download: download,
		fetchBlob: fetchBlob,
		readConnIdFromUrl: readConnIdFromUrl,
		writeConnIdToUrl: writeConnIdToUrl
	};
	return t;

	function setBaseUrl(url) {
		t.baseUrl = url || '';
	}

	function setConnId(id) {
		t.connId = id ? String(id) : '';
	}

	function getConnId() {
		return t.connId || '';
	}

	function readConnIdFromUrl() {
		var q = window.location.search || '';
		var m = q.match(/[?&]c=([^&]*)/);
		if (m) {
			try {
				return decodeURIComponent(m[1].replace(/\+/g, ' '));
			} catch (e) {
				return m[1];
			}
		}
		return '';
	}

	/**
	 * 把连接 ID 写入地址栏（不刷新页面），便于多 Tab / 书签 / 刷新保持
	 */
	function writeConnIdToUrl(id, extra) {
		id = id ? String(id) : '';
		t.connId = id;
		if (!window.history || !window.history.replaceState) return;
		var path = window.location.pathname || '';
		var hash = window.location.hash || '';
		var params = {};
		var q = (window.location.search || '').replace(/^\?/, '');
		if (q) {
			var parts = q.split('&');
			var i, kv;
			for (i = 0; i < parts.length; i++) {
				if (!parts[i]) continue;
				kv = parts[i].split('=');
				try {
					params[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '';
				} catch (e2) {
					params[kv[0]] = kv.length > 1 ? kv[1] : '';
				}
			}
		}
		if (id) params.c = id;
		else delete params.c;
		if (extra && typeof extra === 'object') {
			var k;
			for (k in extra) {
				if (!Object.prototype.hasOwnProperty.call(extra, k)) continue;
				if (extra[k] == null || extra[k] === '') delete params[k];
				else params[k] = String(extra[k]);
			}
		}
		var qs = buildQuery(params);
		var url = path + (qs ? ('?' + qs) : '') + hash;
		try {
			window.history.replaceState({ c: id }, '', url);
		} catch (e3) { /* ignore */ }
	}

	function get(path, query) {
		query = query || {};
		if (t.connId && query.c == null) query.c = t.connId;
		var q = buildQuery(query);
		var full = path;
		if (q) full += (path.indexOf('?') >= 0 ? '&' : '?') + q;
		return request('GET', full, null);
	}

	function post(path, body) {
		body = body == null ? {} : body;
		if (t.connId && (body.c == null || body.c === '')) {
			body.c = t.connId;
		}
		// 同时挂在 query，便于服务端 GET 风格读取
		var path2 = path;
		if (t.connId) {
			path2 += (path.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(t.connId);
		}
		return request('POST', path2, body);
	}

	function request(method, path, body) {
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			var url = joinUrl(t.baseUrl, path);
			xhr.open(method, url, true);
			xhr.timeout = t.timeoutMs;
			xhr.withCredentials = true;
			xhr.setRequestHeader('Accept', 'application/json');
			if (method !== 'GET' && method !== 'HEAD') {
				xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
			}
			xhr.onreadystatechange = function () {
				if (xhr.readyState !== 4) return;
				var text = xhr.responseText || '';
				var env = null;
				try {
					env = text ? JSON.parse(text) : null;
				} catch (e) {
					reject({
						ok: false,
						error: {
							code: 'BAD_JSON',
							message: '响应不是合法 JSON',
							detail: text.slice(0, 200)
						},
						httpStatus: xhr.status
					});
					return;
				}
				if (xhr.status >= 200 && xhr.status < 300) {
					if (env && typeof env.ok === 'boolean') {
						if (env.ok) resolve(env);
						else reject(env);
					} else {
						resolve({ ok: true, data: env, error: null, meta: null });
					}
					return;
				}
				reject(env || {
					ok: false,
					error: {
						code: 'HTTP_' + xhr.status,
						message: 'HTTP ' + xhr.status
					},
					httpStatus: xhr.status
				});
			};
			xhr.ontimeout = function () {
				reject({ ok: false, error: { code: 'TIMEOUT', message: '请求超时' } });
			};
			xhr.onerror = function () {
				reject({ ok: false, error: { code: 'NETWORK', message: '网络错误' } });
			};
			if (method === 'GET' || method === 'HEAD') xhr.send(null);
			else xhr.send(JSON.stringify(body));
		});
	}

	/**
	 * 拉取附件 Blob（不自动保存）。成功 resolve({ filename, blob, size, contentType })
	 */
	function fetchBlob(path, body) {
		body = body == null ? {} : body;
		if (t.connId && (body.c == null || body.c === '')) {
			body.c = t.connId;
		}
		var path2 = path;
		if (t.connId) {
			path2 += (path.indexOf('?') >= 0 ? '&' : '?') + 'c=' + encodeURIComponent(t.connId);
		}
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			var url = joinUrl(t.baseUrl, path2);
			xhr.open('POST', url, true);
			xhr.timeout = t.downloadTimeoutMs || 600000;
			xhr.withCredentials = true;
			xhr.responseType = 'blob';
			xhr.setRequestHeader('Accept', 'application/octet-stream, application/json, */*');
			xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
			xhr.onreadystatechange = function () {
				if (xhr.readyState !== 4) return;
				var blob = xhr.response;
				var ct = (xhr.getResponseHeader('Content-Type') || '').toLowerCase();
				var cd = xhr.getResponseHeader('Content-Disposition') || '';
				var hasAttach = /attachment/i.test(cd) || /filename/i.test(cd);
				var okStatus = xhr.status >= 200 && xhr.status < 300;
				if (!okStatus || (!hasAttach && ct.indexOf('application/json') >= 0)) {
					readBlobText(blob).then(function (text) {
						var env = null;
						try {
							env = text ? JSON.parse(text) : null;
						} catch (e) {
							env = null;
						}
						if (env && env.error) {
							reject(env);
							return;
						}
						// JSON 导出成功但缺 Disposition 时仍当附件
						if (okStatus && env && env.ok !== false && env.rows != null) {
							var fallbackName = 'export.json';
							var fb = blob || new Blob([text], { type: 'application/json' });
							resolve({
								ok: true,
								filename: fallbackName,
								blob: fb,
								size: fb && typeof fb.size === 'number' ? fb.size : 0,
								contentType: 'application/json'
							});
							return;
						}
						reject({
							ok: false,
							error: {
								code: 'HTTP_' + xhr.status,
								message: (env && env.error && env.error.message)
									|| (env && env.message)
									|| ('导出失败 HTTP ' + xhr.status),
								detail: text ? String(text).slice(0, 300) : ''
							},
							httpStatus: xhr.status
						});
					}).catch(function () {
						reject({
							ok: false,
							error: { code: 'HTTP_' + xhr.status, message: '导出失败' },
							httpStatus: xhr.status
						});
					});
					return;
				}
				var filename = parseFilename(cd) || 'export.bin';
				resolve({
					ok: true,
					filename: filename,
					blob: blob,
					size: blob && typeof blob.size === 'number' ? blob.size : 0,
					contentType: ct
				});
			};
			xhr.ontimeout = function () {
				reject({ ok: false, error: { code: 'TIMEOUT', message: '导出超时' } });
			};
			xhr.onerror = function () {
				reject({ ok: false, error: { code: 'NETWORK', message: '网络错误' } });
			};
			xhr.send(JSON.stringify(body));
		});
	}

	/**
	 * 下载附件到本地（fetchBlob + 触发保存）
	 */
	function download(path, body) {
		return fetchBlob(path, body).then(function (res) {
			try {
				trySaveBlob(res.blob, res.filename);
			} catch (e3) {
				return Promise.reject({
					ok: false,
					error: { code: 'SAVE', message: '无法触发下载: ' + (e3 && e3.message ? e3.message : e3) }
				});
			}
			return res;
		});
	}

	function trySaveBlob(blob, filename) {
		var objUrl = (window.URL || window.webkitURL).createObjectURL(blob);
		var a = document.createElement('a');
		a.href = objUrl;
		a.download = filename || 'export.bin';
		a.style.display = 'none';
		document.body.appendChild(a);
		a.click();
		setTimeout(function () {
			try {
				document.body.removeChild(a);
				(window.URL || window.webkitURL).revokeObjectURL(objUrl);
			} catch (e2) { /* ignore */ }
		}, 1500);
	}

	function readBlobText(blob) {
		return new Promise(function (resolve) {
			if (!blob) {
				resolve('');
				return;
			}
			if (typeof blob.text === 'function') {
				blob.text().then(resolve).catch(function () { resolve(''); });
				return;
			}
			var fr = new FileReader();
			fr.onload = function () { resolve(String(fr.result || '')); };
			fr.onerror = function () { resolve(''); };
			fr.readAsText(blob);
		});
	}

	function parseFilename(cd) {
		if (!cd) return '';
		// filename*=UTF-8''xxx
		var m = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
		if (m) {
			try {
				return decodeURIComponent(m[1].replace(/["']/g, '').trim());
			} catch (e) {
				return m[1].replace(/["']/g, '').trim();
			}
		}
		m = cd.match(/filename\s*=\s*("?)([^";]+)\1/i);
		if (m) return m[2].trim();
		return '';
	}

	function joinUrl(base, path) {
		if (!base) return path;
		if (/^https?:\/\//i.test(path)) return path;
		var b = base.replace(/\/+$/, '');
		var p = path.replace(/^\/+/, '');
		return b + '/' + p;
	}

	function buildQuery(obj) {
		var parts = [];
		var k, v;
		for (k in obj) {
			if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
			v = obj[k];
			if (v == null) continue;
			parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
		}
		return parts.join('&');
	}
})();
