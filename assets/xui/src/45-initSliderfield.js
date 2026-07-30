/* XUI component: initSliderfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initSliderfield(){
		X.Sliderfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Sliderfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Sliderfield.prototype, {
			constructor:X.Sliderfield,
			build(){
				var self=this,w=X.CreateDOM(null,{x:'div.xsld',c:[
					{x:'input.xin',type:'range',min:this.cfg.min,max:this.cfg.max,step:this.cfg.step,value:this._v!=null?this._v:'',oncreate:function(el){self.el=el;}},
					{x:'span.vl'}
				]});
				var inp=w.querySelector('input'),lb=w.querySelector('.vl');
				lb.textContent=inp.value;
				inp.oninput=function(){lb.textContent=inp.value;self._fire();};
				return w;
			},
		});
		X.reg('sliderfield', X.Sliderfield);
	}

	// ─── Tagfield ───
