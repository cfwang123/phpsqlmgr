/* XUI component: initCheckboxgroup — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initCheckboxgroup(){
		X.Checkboxgroup = function(cfg,par){
			this._items=cfg.items;
			var c=Object.assign({},cfg);
			delete c.items;
			X.Base.call(this,c,par);
		};
		X.Checkboxgroup.prototype=Object.create(X.Base.prototype);
		X.extend(X.Checkboxgroup.prototype, {
			constructor:X.Checkboxgroup,
			build(){ return X.CreateDOM(null,{x:'div.xckg'}); },
			init(){
				var self=this,items=this._items||[];
				this._boxes=[];
				for(var i=0;i<items.length;i++){
					var b=X.mk({xtype:'checkbox',boxLabel:items[i].boxLabel,value:items[i].value,checked:items[i].checked,listeners:{change:function(){self._fire();}}},this);
					this._boxes.push(b);
				}
			},
			getValue(){
				var v=[];
				for(var i=0;i<this._boxes.length;i++)if(this._boxes[i].getValue())v.push(this._boxes[i].cfg.value);
				return v;
			},
			_fire(){ if(this.cfg.listeners&&this.cfg.listeners.change)this.cfg.listeners.change(this.getValue()); },
		});
		X.reg('checkboxgroup', X.Checkboxgroup);
	}

	// ─── Radio ───
