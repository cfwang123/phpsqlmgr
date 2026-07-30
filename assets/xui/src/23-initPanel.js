/* XUI component: initPanel — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initPanel(){
		X.Panel = function(cfg,par){X.Base.call(this,cfg,par);}
		X.Panel.prototype=Object.create(X.Base.prototype);
		X.extend(X.Panel.prototype, {
			constructor:X.Panel,
			build(){
				var d=X.CreateDOM(null,{x:'div.xfld',c:[
					{x:'div.hd',c:this.cfg.title||''},
					{x:'div.bd',oncreate:function(el){this._bd=el;}.bind(this)}
				]});
				return d;
			},
			body(){ return this._bd; },
			init(){ if(this.cfg.layout)this._applyly(this.cfg.layout); },
		});
		X.reg('panel', X.Panel);
	}

	// ─── Fieldset ───
