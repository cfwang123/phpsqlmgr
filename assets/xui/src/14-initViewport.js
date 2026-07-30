/* XUI component: initViewport — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initViewport(){
		X.Viewport = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Viewport.prototype=Object.create(X.Base.prototype);
		X.extend(X.Viewport.prototype, {
			constructor:X.Viewport,
			build(){ return X.CreateDOM(null,{x:'div.xvp'}); },
		});
		X.reg('viewport', X.Viewport);
	}

	// ─── Titlebar ───
