/* XUI component: initFieldrow — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFieldrow(){
		X.Fieldrow = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Fieldrow.prototype=Object.create(X.Base.prototype);
		X.extend(X.Fieldrow.prototype, {
			constructor:X.Fieldrow,
			build(){
				var d=X.CreateDOM(null,{x:'div.xfrow',c:[
					{x:'span.lbl',c:this.cfg.fieldLabel||''},
					{x:'div.inp',oncreate:function(el){this._inp=el;}.bind(this)}
				]});
				return d;
			},
			body(){ return this._inp; },
		});
		X.reg('fieldrow', X.Fieldrow);
	}

	// ─── Window ───
