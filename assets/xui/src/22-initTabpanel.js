/* XUI component: initTabpanel — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTabpanel(){
		X._tabpanels=X._tabpanels||[];
		/** 可选 SqlmngerI18n；无则用 fallback */
		function tabT(key, fallback, vars) {
			if (typeof window !== 'undefined' && window.SqlmngerI18n && typeof window.SqlmngerI18n.t === 'function') {
				var s = window.SqlmngerI18n.t(key, vars);
				if (s != null && s !== key) return s;
			}
			if (vars && typeof fallback === 'string') {
				return String(fallback).replace(/\{(\w+)\}/g, function (_, k) {
					return vars[k] != null ? String(vars[k]) : '';
				});
			}
			return fallback != null ? fallback : key;
		}
		// Ctrl+Q 关闭当前活动 Tab（全局一次绑定）
		if (!X._tabpanelKeyBound) {
			X._tabpanelKeyBound = true;
			document.addEventListener('keydown', function (e) {
				if (!(e.ctrlKey || e.metaKey)) return;
				var k = e.key;
				if (k !== 'q' && k !== 'Q') return;
				// 输入框内仍允许关 Tab（与常见 IDE 一致）；可按需再排除
				var tp = X._activeTabpanel;
				if (!tp || !tp._act || !tp._tabs || !tp._tabs.length) {
					// 回退：任一有活动页的 panel
					var list = X._tabpanels || [], i;
					tp = null;
					for (i = 0; i < list.length; i++) {
						if (list[i] && list[i]._act && list[i]._tabs && list[i]._tabs.length) {
							tp = list[i];
							break;
						}
					}
				}
				if (!tp || !tp._act) return;
				e.preventDefault();
				e.stopPropagation();
				tp.remove(tp._act);
			}, true);
		}
		X.Tabpanel = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Tabpanel.prototype=Object.create(X.Base.prototype);
		X.extend(X.Tabpanel.prototype, {
			constructor:X.Tabpanel,
			build(){
				var d=X.CreateDOM(null,{x:'div.xpnl',c:[{x:'div.xtab'},{x:'div.xtbd'}]});
				this._bar=d.firstElementChild;
				this._bd=d.lastElementChild;
				this._bar.style.position='relative';
				this._tabs=[];
				this._dragTab=null;
				this._dropHandled=false;
				this._dragCanceled=false;
				this._detachThreshold=this.cfg.detachThreshold!=null?this.cfg.detachThreshold:30;
				if(X._tabpanels.indexOf(this)===-1)X._tabpanels.push(this);
				this._dropIndicator=document.createElement('div');
				this._dropIndicator.className='x-tab-drop-indicator';
				this._dropIndicator.style.cssText='position:absolute;top:4px;bottom:4px;width:2px;background:var(--x-accent,#2563eb);display:none;pointer-events:none;z-index:10;';
				this._bar.appendChild(this._dropIndicator);
				return d;
			},
			_markActivePanel(){
				X._activeTabpanel=this;
			},
			_ensureTabCtxMenu(){
				if(this._tabCtxMenu)return this._tabCtxMenu;
				var self=this;
				var menu=X.mk({
					xtype:'menu',
					contextMenu:true,
					menu:[]
				});
				// 挂到 body，避免被面板 overflow 裁切
				if(menu.el&&!menu.el.parentNode)document.body.appendChild(menu.el);
				this._tabCtxMenu=menu;
				this._tabCtxTargetId=null;
				return menu;
			},
			_showTabCtxMenu(x,y,tabId){
				var self=this;
				var menu=this._ensureTabCtxMenu();
				this._tabCtxTargetId=tabId;
				this._markActivePanel();
				menu.cfg.menu=[
					{
						text:tabT('tab.close','关闭 (Ctrl+Q)'),
						icon:'fa-solid fa-xmark',
						handler:function(){
							var id=self._tabCtxTargetId;
							if(id)self.remove(id);
						}
					},
					{
						text:tabT('tab.closeOthers','关闭其它'),
						icon:'fa-solid fa-layer-group',
						handler:function(){
							var id=self._tabCtxTargetId;
							if(id)self.closeOthers(id);
						}
					},
					{
						text:tabT('tab.closeAll','关闭全部'),
						icon:'fa-solid fa-ban',
						handler:function(){
							self.closeAll();
						}
					}
				];
				menu.showAt(x,y);
			},
			/** 关闭除 keepId 外全部 Tab */
			closeOthers(keepId){
				if(!keepId)return;
				var ids=[],i,t;
				for(i=0;i<this._tabs.length;i++){
					t=this._tabs[i];
					if(t&&t.id!==keepId)ids.push(t.id);
				}
				for(i=0;i<ids.length;i++)this.remove(ids[i]);
				if(this._tabs.length)this.activate(keepId);
			},
			/** 关闭全部 Tab */
			closeAll(){
				var ids=[],i;
				for(i=0;i<this._tabs.length;i++){
					if(this._tabs[i])ids.push(this._tabs[i].id);
				}
				for(i=0;i<ids.length;i++)this.remove(ids[i]);
			},
			_bindTabDnD(rec){
				var self=this;
				rec.tab.draggable=true;
				rec.tab.addEventListener('dragstart',function(e){
					self._dragTab=rec;
					self._dropHandled=false;
					self._dragCanceled=false;
					// move + copy：拖出标签栏变为窗口时也显示“允许”光标
					try{ e.dataTransfer.effectAllowed='copyMove'; }catch(err){ e.dataTransfer.effectAllowed='all'; }
					try{ e.dataTransfer.setData('text/plain',rec.id); }catch(err2){}
					rec.tab.classList.add('dragging');
					document.body.classList.add('x-tab-dragging');
					if(self._escKey)document.removeEventListener('keydown',self._escKey);
					self._escKey=function(ev){ if(ev.key==='Escape'){ self._dragCanceled=true; self._hideDetachHint(); } };
					document.addEventListener('keydown',self._escKey);
					// 全局 dragover：区域外也 preventDefault，避免浏览器显示禁用光标
					self._onDocDragOver=function(ev){
						if(!self._dragTab)return;
						// 必须 preventDefault，否则区域外显示“禁止”光标
						ev.preventDefault();
						try{ ev.dataTransfer.dropEffect='move'; }catch(err3){}
						if(self._isDetachZone(ev.clientX,ev.clientY)){
							self._hideDropIndicator();
							self._showDetachHint(ev.clientX,ev.clientY,rec.title);
						}else{
							self._hideDetachHint();
						}
					};
					self._onDocDrop=function(ev){
						// 防止某些浏览器在文档上 drop 导航/打开文件
						if(self._dragTab)ev.preventDefault();
					};
					document.addEventListener('dragover',self._onDocDragOver,true);
					document.addEventListener('drop',self._onDocDrop,true);
				});
				rec.tab.addEventListener('dragend',function(e){
					rec.tab.classList.remove('dragging');
					document.body.classList.remove('x-tab-dragging');
					self._hideDropIndicator();
					self._hideDetachHint();
					if(self._onDocDragOver){document.removeEventListener('dragover',self._onDocDragOver,true);self._onDocDragOver=null;}
					if(self._onDocDrop){document.removeEventListener('drop',self._onDocDrop,true);self._onDocDrop=null;}
					if(self._escKey){document.removeEventListener('keydown',self._escKey);self._escKey=null;}
					if(self._dragTab&&!self._dropHandled&&!self._dragCanceled){
						if(self._isDetachZone(e.clientX,e.clientY)){
							self._tabToWindow(self._dragTab,e.clientX,e.clientY);
						}
					}
					self._dragTab=null;
					self._dropHandled=false;
				});
			},
			/** 是否已拖出标签栏足够远，将松手变为独立窗口 */
			_isDetachZone(x,y){
				if(!this._bar)return false;
				var br=this._bar.getBoundingClientRect();
				var dx=Math.max(0,Math.max(br.left-x,x-br.right));
				var dy=Math.max(0,Math.max(br.top-y,y-br.bottom));
				return Math.sqrt(dx*dx+dy*dy)>this._detachThreshold;
			},
			_ensureDetachHint(){
				if(this._detachHint&&this._detachHint.parentNode)return this._detachHint;
				var tip=document.createElement('div');
				tip.className='x-tab-detach-hint';
				tip.setAttribute('role','status');
				document.body.appendChild(tip);
				this._detachHint=tip;
				return tip;
			},
			_showDetachHint(x,y,title){
				var tip=this._ensureDetachHint();
				var name=title?String(title):'';
				if(name.length>24)name=name.slice(0,24)+'…';
				tip.innerHTML='<i class="fa-solid fa-window-maximize" aria-hidden="true"></i>'
					+'<span>松开变为窗口'+(name?(' · '+name):'')+'</span>';
				tip.classList.add('is-on');
				// 跟在指针右下方，避免被拖影挡住
				var left=x+16, top=y+18;
				var tw=tip.offsetWidth||180, th=tip.offsetHeight||28;
				if(left+tw>window.innerWidth-8)left=x-tw-12;
				if(top+th>window.innerHeight-8)top=y-th-12;
				if(left<4)left=4;
				if(top<4)top=4;
				tip.style.left=left+'px';
				tip.style.top=top+'px';
			},
			_hideDetachHint(){
				if(this._detachHint){
					this._detachHint.classList.remove('is-on');
				}
			},
			_getDropIndex(x){
				var kids=this._tabs.map(function(t){ return t.tab; });
				for(var i=0;i<kids.length;i++){
					if(this._dragTab&&kids[i]===this._dragTab.tab) continue;
					var r=kids[i].getBoundingClientRect();
					if(x<r.left+r.width/2) return i;
				}
				return kids.length;
			},
			_showDropIndicator(x){
				if(!this._dropIndicator)return;
				var kids=this._tabs.map(function(t){ return t.tab; });
				var idx=this._getDropIndex(x);
				var barRect=this._bar.getBoundingClientRect();
				if(!kids.length){
					this._dropIndicator.style.left='0px';
					this._dropIndicator.style.display='block';
					return;
				}
				if(idx>=kids.length){
					var last=kids[kids.length-1].getBoundingClientRect();
					this._dropIndicator.style.left=(last.right-barRect.left)+'px';
				}else{
					this._dropIndicator.style.left=(kids[idx].getBoundingClientRect().left-barRect.left)+'px';
				}
				this._dropIndicator.style.display='block';
			},
			_hideDropIndicator(){
				if(this._dropIndicator)this._dropIndicator.style.display='none';
			},
			_rebuildTabs(){
				while(this._bar.firstChild)this._bar.removeChild(this._bar.firstChild);
				while(this._bd.firstChild)this._bd.removeChild(this._bd.firstChild);
				for(var i=0;i<this._tabs.length;i++){
					this._bar.appendChild(this._tabs[i].tab);
					this._bd.appendChild(this._tabs[i].pg);
				}
				this._bar.appendChild(this._dropIndicator);
				this._tabs.forEach(function(t){ t.tab.draggable=true; });
				this.activate(this._act|| (this._tabs[0]&&this._tabs[0].id));
			},
			moveTab(id,toIdx){
				for(var i=0;i<this._tabs.length;i++){
					if(this._tabs[i].id===id){
						var t=this._tabs.splice(i,1)[0];
						if(toIdx<0)toIdx=0;
						if(toIdx>this._tabs.length)toIdx=this._tabs.length;
						this._tabs.splice(toIdx,0,t);
						this._rebuildTabs();
						return t;
					}
				}
				return null;
			},
			detachTab(id){
				for(var i=0;i<this._tabs.length;i++){
					if(this._tabs[i].id===id){
						var t=this._tabs.splice(i,1)[0];
						if(t.tab.parentNode)t.tab.parentNode.removeChild(t.tab);
						if(t.pg.parentNode)t.pg.parentNode.removeChild(t.pg);
						if(this._act===id)this._act=this._tabs.length?this._tabs[Math.max(0,i-1)].id:null;
						this.activate(this._act);
						return t;
					}
				}
				return null;
			},
			_tabToWindow(rec,mx,my){
				var br=this._bd.getBoundingClientRect();
				var r=this.detachTab(rec.id);
				if(!r)return;
				var w,h;
				if(X._tornWinSize){w=Math.min(X._tornWinSize.w,Math.floor(br.width));h=Math.min(X._tornWinSize.h,Math.floor(br.height));}
				else{w=Math.max(200,Math.floor(br.width*0.8));h=Math.max(120,Math.floor(br.height*0.8));}
				// 从 Tab 撕出的窗口允许再拖回 tabs
				var win=X.WinMgr.create({xtype:'window',title:r.title,width:w,height:h,
					left:Math.max(0,mx-80),top:Math.max(0,my-20),resizable:true,allowDock:true});
				win._bd.appendChild(r.pg);
				r.pg.style.height='100%';
				win._dockRec=r;
				win._sourceTabpnl=this;
				if(this.cfg.listeners&&this.cfg.listeners.tabdetach)this.cfg.listeners.tabdetach(r.id,win);
			},
			attachTab(rec,toIdx){
				if(!rec||!rec.id||!rec.tab||!rec.pg)return null;
				if(toIdx<0)toIdx=0;
				if(toIdx>this._tabs.length)toIdx=this._tabs.length;
				this._tabs.splice(toIdx,0,rec);
				var next=this._tabs[toIdx+1];
				if(next){
					this._bar.insertBefore(rec.tab,next.tab);
					this._bd.insertBefore(rec.pg,next.pg);
				}else{
					this._bar.appendChild(rec.tab);
					this._bd.appendChild(rec.pg);
				}
				rec.tab.draggable=true;
				// 拖回后补绑右键（原 tab 节点可能仍有旧 handler，统一重绑）
				var self=this,tid=rec.id;
				rec.tab.oncontextmenu=function(e){
					e.preventDefault();
					e.stopPropagation();
					self.activate(tid);
					self._showTabCtxMenu(e.clientX,e.clientY,tid);
				};
				this.activate(rec.id);
				return rec;
			},
			add(cfg){
				var id=cfg.id||X.gid(),self=this;
				var tab=X.CreateDOM(null,{x:'span.itm','data-id':id,html:cfg.title+'<span class="cls">\u00D7</span>'});
				var pg=X.CreateDOM(null,{x:'div.pg','data-id':id});
				this._bar.appendChild(tab);
				this._bd.appendChild(pg);
				var rec={id:id,tab:tab,pg:pg,title:cfg.title,inst:null};
				if(cfg.content){
					if(typeof cfg.content==='function'){
						var result=cfg.content();
						if(result&&typeof result.then==='function'){
							result.then(function(inst){
								if(inst&&inst.el){pg.appendChild(inst.el);}
								rec.inst=inst;
							});
						}
						else{
							rec.inst=result;
							if(result&&result.el)pg.appendChild(result.el);
						}
					}
					else if(typeof cfg.content==='string')pg.innerHTML=cfg.content;
					else if(cfg.content.xtype){var c=X.mk(cfg.content);pg.appendChild(c.el);rec.inst=c;}
					else if(cfg.content.el)pg.appendChild(cfg.content.el);
					else pg.appendChild(cfg.content);
				}
				this._tabs.push(rec);
				this._bindTabDnD(rec);
				tab.onclick=function(e){
					if(e.target.classList.contains('cls')){self.remove(id);return;}
					self._markActivePanel();
					self.activate(id);
				};
				tab.oncontextmenu=function(e){
					e.preventDefault();
					e.stopPropagation();
					self.activate(id);
					self._showTabCtxMenu(e.clientX,e.clientY,id);
				};
				this._bar.ondragover=function(e){
					if(!self._dragTab)return;
					e.preventDefault();
					try{ e.dataTransfer.dropEffect='move'; }catch(err){}
					// 仍在标签栏内：排序插入，不提示“变窗口”
					if(!self._isDetachZone(e.clientX,e.clientY)){
						self._hideDetachHint();
						self._showDropIndicator(e.clientX);
					}
				};
				this._bar.ondrop=function(e){
					if(!self._dragTab)return;
					e.preventDefault();
					self._dropHandled=true;
					var id=self._dragTab.id;
					var idx=self._getDropIndex(e.clientX);
					self.moveTab(id, idx);
					self._hideDropIndicator();
					self._dragTab=null;
				};
				this._bar.ondragleave=function(e){
					var r=self._bar.getBoundingClientRect();
					if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)self._hideDropIndicator();
				};
				this.activate(id);
				return rec;
			},
			activate(id){
				for(var i=0;i<this._tabs.length;i++){
					var t=this._tabs[i],act=t.id===id;
					t.tab.classList.toggle('act',act);
					t.pg.classList.toggle('act',act);
				}
				this._act=id;
				this._markActivePanel();
				if(this.cfg.listeners&&this.cfg.listeners.tabchange)this.cfg.listeners.tabchange(id);
			},
			/** 更新页签标题（保留关闭按钮） */
			setTitle(id, title){
				title = title == null ? '' : String(title);
				for(var i=0;i<this._tabs.length;i++){
					if(this._tabs[i].id===id){
						var t=this._tabs[i];
						t.title=title;
						// 文本 + ×，避免 innerHTML 注入
						while(t.tab.firstChild) t.tab.removeChild(t.tab.firstChild);
						t.tab.appendChild(document.createTextNode(title));
						var cls=document.createElement('span');
						cls.className='cls';
						cls.textContent='\u00D7';
						t.tab.appendChild(cls);
						return true;
					}
				}
				return false;
			},
			remove(id){
				for(var i=0;i<this._tabs.length;i++){
					if(this._tabs[i].id===id){
						var t=this._tabs[i];
						t.tab.parentNode.removeChild(t.tab);
						t.pg.parentNode.removeChild(t.pg);
						this._tabs.splice(i,1);
						if(this._act===id&&this._tabs.length)this.activate(this._tabs[this._tabs.length-1].id);
						if(t.inst&&t.inst.destroy)t.inst.destroy();
						if(this.cfg.listeners&&this.cfg.listeners.tabclose)this.cfg.listeners.tabclose(id);
						break;
					}
				}
			},
		});
		X.reg('tabpanel', X.Tabpanel);
	}

	// ─── Panel ───
