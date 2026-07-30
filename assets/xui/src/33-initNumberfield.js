/* XUI component: initNumberfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initNumberfield(){
		X.Numberfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Numberfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Numberfield.prototype, {
			constructor:X.Numberfield,
			build(){
				var self=this,step=this.cfg.step||1;
				var w=X.CreateDOM(null,{x:'div.xnum',c:[
					{x:'input.xin',type:'text',inputMode:'decimal',value:this._v!=null?this._v:'',oncreate:function(el){self._inp=el;}},
					{x:'div.spn',c:[
						{x:'button.up',type:'button',c:'\u25B2',onclick:function(){var v=parseFloat(self._inp.value)||0;self.setValue(v+step);self._fire();}},
						{x:'button.dn',type:'button',c:'\u25BC',onclick:function(){var v=parseFloat(self._inp.value)||0;self.setValue(v-step);self._fire();}}
					]}
				]});
				this._inp=w.querySelector('input');
				this._inp.oninput=function(){self._fire();};
				return w;
			},
			getValue(){ return parseFloat(this._inp.value)||0; },
			setValue(v){ this._v=v;if(this._inp)this._inp.value=v; },
		});
		X.reg('numberfield', X.Numberfield);
	}

	// ─── Textarea ───
