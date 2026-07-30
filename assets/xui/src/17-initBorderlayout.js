/* XUI component: initBorderlayout — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initBorderlayout(){
		X.Borderlayout = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Borderlayout.prototype=Object.create(X.Base.prototype);
		X.extend(X.Borderlayout.prototype, {
			constructor:X.Borderlayout,
			build(){
				var d=X.CreateDOM(null,{x:'div.xbd',c:[{x:'div.xnv'},{x:'div.xct'}]});
				this._nv=d.firstElementChild;
				this._cn=d.lastElementChild;
				return d;
			},
			init(){
				var reg=this.cfg.region||{};
				this.ch=[];
				if(reg.west){var w=X.mk(reg.west);this._nv.appendChild(w.el);this.ch.push(w);}
				if(reg.center){var c=X.mk(reg.center);this._cn.appendChild(c.el);this.ch.push(c);}
			},
		});
		X.reg('border', X.Borderlayout);
	}

	// ─── Button ───
