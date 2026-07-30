/* XUI component: initBox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initBox(){
		X.Box = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Box.prototype=Object.create(X.Base.prototype);
		X.extend(X.Box.prototype, {
			constructor:X.Box,
			build(){ return X.CreateDOM(null,{x:'div.xbox',html:this.cfg.html||this.cfg.value||''}); },
			setValue(v){ this.el.innerHTML=v; }
		});
		X.reg('box', X.Box);
	}

	// ─── Grid ─── 通用虚拟滚动表格
