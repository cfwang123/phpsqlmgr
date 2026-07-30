/* XUI component: initFieldset — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFieldset(){
		X.Fieldset = function(cfg,par){X.Panel.call(this,cfg,par);};
		X.Fieldset.prototype=Object.create(X.Panel.prototype);
		X.extend(X.Fieldset.prototype, {constructor:X.Fieldset});
		X.reg('fieldset', X.Fieldset);
	}

	// ─── Fieldrow ───
