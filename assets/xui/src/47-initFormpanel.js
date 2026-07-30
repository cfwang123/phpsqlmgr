/* XUI component: initFormpanel — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFormpanel(){
		X.Formpanel = function(cfg,par){X.Panel.call(this,cfg,par);};
		X.Formpanel.prototype=Object.create(X.Panel.prototype);
		X.extend(X.Formpanel.prototype, {constructor:X.Formpanel});
		X.reg('formpanel', X.Formpanel);
	}
