/* XUI component: initTree — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTree(){
		X.Tree = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Tree.prototype=Object.create(X.Base.prototype);
		X.extend(X.Tree.prototype, {
			constructor:X.Tree,
			build(){ return X.CreateDOM(null,{x:'div.xtre'}); },
			init(){
				var self=this;
				if(this.cfg.root)this._bnd(this.el,this.cfg.root,0);
				if(this.cfg.listeners&&this.cfg.listeners.itemclick)this._clk=this.cfg.listeners.itemclick;
			},
			_bnd(ct,nd,lv){
				var self=this,hasch=nd.children&&nd.children.length;
				// text 纯文本；html/txHtml 可带高亮等安全 HTML
				var txCfg = (nd.html != null || nd.txHtml != null)
					? {x:'span.tx',html:(nd.html != null ? nd.html : nd.txHtml)}
					: {x:'span.tx',c:nd.text||''};
				var wrap=X.CreateDOM(null,{x:'div',c:[
					{x:'div.nd',s:{paddingLeft:(lv*16+2)+'px'},c:[
						{x:'span',className:'exp'+(hasch?'':' leaf'),c:hasch?(nd.expanded!==false?'\u25BC':'\u25B6'):''},
						{x:'span.ico',html:nd.icon||(hasch?'\u25A1':'\u25CF')},
						txCfg
					]},
					{x:'div',className:'ch'+(hasch&&nd.expanded!==false?' open':'')}
				]});
				var row=wrap.firstElementChild,chwrap=wrap.lastElementChild,exp=row.firstElementChild;
				// 业务数据挂到 DOM，便于外层定位/高亮
				if(nd._table!=null)row.setAttribute('data-table',String(nd._table));
				if(nd._db!=null)row.setAttribute('data-db',String(nd._db));
				if(nd._kind!=null)row.setAttribute('data-kind',String(nd._kind));
				ct.appendChild(wrap);
				if(hasch){
					exp.onclick=function(e){
						e.stopPropagation();
						var op=chwrap.classList.contains('open');
						chwrap.classList.toggle('open');
						exp.textContent=op?'\u25B6':'\u25BC';
					};
					for(var i=0;i<nd.children.length;i++)self._bnd(chwrap,nd.children[i],lv+1);
				}
				row.onclick=function(e){
					e.stopPropagation();
					var all=self.el.querySelectorAll('.nd.sel'),j;
					for(j=0;j<all.length;j++)all[j].classList.remove('sel');
					row.classList.add('sel');
					if(self._clk)self._clk({node:nd,text:nd.text,leaf:!hasch});
				};
			},
		});
		X.reg('tree', X.Tree);
	}

	// ─── Tabpanel ───
