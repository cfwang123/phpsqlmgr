/* XUI component: initTitlebar — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTitlebar(){
		X.Titlebar = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Titlebar.prototype=Object.create(X.Base.prototype);
		X.extend(X.Titlebar.prototype, {
			constructor:X.Titlebar,
			build(){
				var d=X.CreateDOM(null,{x:'div.xtb',c:[
					{x:'span.ttl',c:this.cfg.title||''},
					{x:'div.tbr'}
				]});
				this._tbr=d.lastElementChild;
				return d;
			},
			body(){ return this._tbr; },
		});
		X.reg('titlebar', X.Titlebar);
	}

	// ─── Statusbar ───
