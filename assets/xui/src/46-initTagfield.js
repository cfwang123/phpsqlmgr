/* XUI component: initTagfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTagfield(){
		X.Tagfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Tagfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Tagfield.prototype, {
			constructor:X.Tagfield,
			build(){
				var self=this,opts=this.cfg.store||[],i,o,items=[];
				for(i=0;i<opts.length;i++){
					o=opts[i];
					items.push({x:'option',value:o.value!=null?o.value:o,c:o.text!=null?o.text:o});
				}
				var d=X.CreateDOM(null,{x:'select.xin.xtag',multiple:true,c:items});
				d.onchange=function(){self._fire();};
				return d;
			},
			getValue(){
				var v=[],opts=this.el.selectedOptions;
				for(var i=0;i<opts.length;i++)v.push(opts[i].value);
				return v;
			},
			init(){
				var vals=this.cfg.value;
				if(!vals||!this.el)return;
				for(var i=0;i<this.el.options.length;i++)this.el.options[i].selected=vals.indexOf(this.el.options[i].value)>=0;
			},
		});
		X.reg('tagfield', X.Tagfield);
	}

	// ─── Formpanel ───
