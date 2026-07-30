/* XUI component: initStatusbar — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initStatusbar(){
		X.Statusbar = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Statusbar.prototype=Object.create(X.Base.prototype);
		X.extend(X.Statusbar.prototype, {
			constructor:X.Statusbar,
			build(){
				var d=X.CreateDOM(null,{x:'div.xsb',c:[
					{x:'span.lft',c:this.cfg.left||''},
					{x:'span.rgt',c:this.cfg.right||''}
				]});
				this._lft=d.firstElementChild;
				this._rgt=d.lastElementChild;
				return d;
			},
			setleft(t){ this._lft.textContent=t; },
			setright(t){ this._rgt.textContent=t; },
		});
		X.reg('statusbar', X.Statusbar);
	}

	// ─── Borderlayout ───
