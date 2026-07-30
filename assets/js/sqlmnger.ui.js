/**
 * 统一对话框 / Toast（基于 XUI：X.mbox / X.confirm / X.mboxerror / X.toast）
 */
window.SqlmngerUi = (function () {
	var t = {
		confirm: confirmDlg,
		alert: alertDlg,
		error: errorDlg,
		info: infoDlg,
		toast: toast,
		toastOk: function (msg, ms) { return toast(msg, 'ok', ms); },
		toastErr: function (msg, ms) { return toast(msg, 'err', ms); },
		toastInfo: function (msg, ms) { return toast(msg, 'info', ms); }
	};
	return t;

	function _(k) {
		return (window.SqlmngerI18n && SqlmngerI18n.t) ? SqlmngerI18n.t(k) : k;
	}

	/** @returns {Promise<boolean>} */
	function confirmDlg(msg, title) {
		msg = String(msg == null ? '' : msg);
		if (typeof X !== 'undefined' && typeof X.confirm === 'function') {
			return X.confirm(msg, title || _('common.confirm')).then(function (v) {
				return v === true;
			});
		}
		return Promise.resolve(!!window.confirm(msg));
	}

	/** @returns {Promise} */
	function alertDlg(msg, title) {
		msg = String(msg == null ? '' : msg);
		if (typeof X !== 'undefined' && typeof X.mbox === 'function') {
			return X.mbox(
				msg,
				title || _('common.tip'),
				'<i class="fa-solid fa-info-circle" style="color:var(--x-accent)"></i>&nbsp;',
				[{ text: _('common.ok'), value: true }]
			);
		}
		window.alert(msg);
		return Promise.resolve(true);
	}

	/** @returns {Promise} */
	function errorDlg(msg, title) {
		msg = String(msg == null ? '' : msg);
		if (typeof X !== 'undefined' && typeof X.mboxerror === 'function') {
			return X.mboxerror(msg, title || _('common.error'));
		}
		window.alert(msg);
		return Promise.resolve(false);
	}

	/** @returns {Promise} */
	function infoDlg(msg, title) {
		return alertDlg(msg, title || _('common.tip'));
	}

	/**
	 * 顶部居中 Toast（委托 X.toast）
	 * @param {string} msg
	 * @param {'ok'|'err'|'info'|string} [kind]
	 * @param {number} [ms]
	 */
	function toast(msg, kind, ms) {
		if (typeof X !== 'undefined' && typeof X.toast === 'function') {
			return X.toast(msg, kind, ms);
		}
		// 极简回退
		if (window.console && console.log) console.log('[toast]', kind || 'ok', msg);
	}
})();
