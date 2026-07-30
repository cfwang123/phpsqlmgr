/* XUI component: initSep — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initSep(){
		X.Sep = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Sep.prototype=Object.create(X.Base.prototype);
		X.extend(X.Sep.prototype, {
			constructor:X.Sep,
			build(){ return X.CreateDOM(null,{x:'span.xsep'}); },
		});
		X.reg('sep', X.Sep);
	}

	// ─── Menu ───
