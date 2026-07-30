/* XUI component: initRadiogroup — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initRadiogroup(){
		X.Radiogroup = function(cfg,par){
			this._items=cfg.items;
			var c=Object.assign({},cfg);
			delete c.items;
			X.Base.call(this,c,par);
		};
		X.Radiogroup.prototype=Object.create(X.Base.prototype);
		X.extend(X.Radiogroup.prototype, {
			constructor:X.Radiogroup,
			build(){ return X.CreateDOM(null,{x:'div.xrdg'}); },
			init(){
				var self=this,items=this._items||[],nm=this.cfg.name||'rad'+X.gid();
				this._rads=[];
				for(var i=0;i<items.length;i++){
					var r=X.mk({xtype:'radio',name:nm,boxLabel:items[i].boxLabel,inputValue:items[i].value,checked:items[i].checked,listeners:{change:function(){self._fire();}}},this);
					this._rads.push(r);
				}
			},
			getValue(){
				for(var i=0;i<this._rads.length;i++)if(this._rads[i]._inp.checked)return this._rads[i]._inp.value;
				return null;
			},
			_fire(){ if(this.cfg.listeners&&this.cfg.listeners.change)this.cfg.listeners.change(this.getValue()); },
		});
		X.reg('radiogroup', X.Radiogroup);
	}

	// ─── Datefield ───
