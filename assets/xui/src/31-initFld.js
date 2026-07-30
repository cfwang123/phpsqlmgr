/* XUI component: initFld — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFld(){
		X.Fld = function(cfg,par){X.Base.call(this,cfg,par);this._v=cfg.value;};
		X.Fld.prototype=Object.create(X.Base.prototype);
		X.extend(X.Fld.prototype, {
			constructor:X.Fld,
			_mkinp(tag,cls){
				var self=this,ev=tag==='select'||tag==='textarea'?'change':'input';
				var o={x:tag||'input',className:'xin'+(cls?' '+cls:'')};
				if(this.cfg.name)o.name=this.cfg.name;
				if(this.cfg.disabled)o.disabled=true;
				if(this.cfg.readOnly)o.readOnly=true;
				var d=X.CreateDOM(null,o);
				d[ev]=function(){self._fire();};
				return d;
			},
			_fire(ev,val){
				if(!ev)ev='change';
				if(val==null)val=this.getValue();
				if(this.cfg.listeners&&this.cfg.listeners[ev])this.cfg.listeners[ev](val,this);
				if(this._events&&this._events[ev]){for(var i=0;i<this._events[ev].length;i++)this._events[ev][i](val,this);}
			},
			on(ev,fn){
				if(!this._events)this._events={};
				if(!this._events[ev])this._events[ev]=[];
				if(this._events[ev].indexOf(fn)<0)this._events[ev].push(fn);
				return this;
			},
			off(ev,fn){
				if(!this._events||!this._events[ev])return this;
				var idx=this._events[ev].indexOf(fn);
				if(idx>=0)this._events[ev].splice(idx,1);
				return this;
			},
			getValue(){ return this.el?this.el.value:this._v; },
			setValue(v){ this._v=v;if(this.el)this.el.value=v==null?'':v; },
		});
	}

	// ─── Textfield ───
