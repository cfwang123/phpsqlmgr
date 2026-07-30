/* XUI component: initCheckbox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initCheckbox(){
		X.Checkbox = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Checkbox.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Checkbox.prototype, {
			constructor:X.Checkbox,
			build(){
				var self=this,w=X.CreateDOM(null,{x:'label.xchk',c:[
					{x:'input',type:'checkbox',checked:!!(this.cfg.checked||this._v)},
					{x:'span',c:this.cfg.boxLabel||''}
				]});
				this._inp=w.firstElementChild;
				this._inp.onchange=function(){self._fire();};
				return w;
			},
			getValue(){ return this._inp.checked; },
			setValue(v){ this._v=v;this._inp.checked=!!v; },
		});
		X.reg('checkbox', X.Checkbox);
	}

	// ─── Checkboxgroup ───
