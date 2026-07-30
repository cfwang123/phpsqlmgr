/* XUI component: initDisplayfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initDisplayfield(){
		X.Displayfield = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Displayfield.prototype=Object.create(X.Base.prototype);
		X.extend(X.Displayfield.prototype, {
			constructor:X.Displayfield,
			build(){ return X.CreateDOM(null,{x:'span.xdsp',c:this.cfg.value||''}); },
			getValue(){ return this.el.textContent; },
			setValue(v){ this.el.textContent=v; },
		});
		X.reg('displayfield', X.Displayfield);
	}

	// ─── Hiddenfield ───
