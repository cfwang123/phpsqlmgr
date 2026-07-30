/* XUI component: initWindow — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initWindow(){
		X.Window = function(cfg,par){X.Base.call(this,cfg,par);this._max=false;this._z=1;}
		X.Window.prototype=Object.create(X.Base.prototype);
		X.extend(X.Window.prototype, {
			constructor:X.Window,
			build(){
				var self=this,cfg=this.cfg;
				var btns=[{x:'button.xwin-btn.wclose',type:'button',html:'<i class="fa-solid fa-xmark"></i>'}];
				if(cfg.toolBtns!==false){btns.unshift({x:'button.xwin-btn.wmin',type:'button',html:'<i class="fa-solid fa-minus"></i>'});btns.splice(1,0,{x:'button.xwin-btn.wmax',type:'button',html:'<i class="fa-regular fa-square"></i>'});}
				var ch=[{x:'div.xwin-hd',c:[
					{x:'span.xwin-ttl',c:cfg.title||'Window'},
					{x:'div.xwin-btns',c:btns}
				]}];
				if(cfg.tbar){ch.push({x:'div.xwin-tbr',oncreate:function(el){self._tbr=el;}});}
				ch.push({x:'div.xwin-bd',oncreate:function(el){self._bd=el;}});
				if(cfg.bbar){ch.push({x:'div.xwin-bbr',oncreate:function(el){self._bbr=el;}});}
				// Resize handles
				var dirs=['resn','ress','rew','rese','resnw','resne','ressw','resse'];
				for(var i=0;i<dirs.length;i++)ch.push({x:'div.reshandle.'+dirs[i]});
				return X.CreateDOM(null,{x:'div.xwin',c:ch});
			},
			body(){ return this._bd; },
			init(){
				var self=this,el=this.el,cfg=this.cfg;
				if(cfg.left!=null)el.style.left=(typeof cfg.left==='number'?cfg.left+'px':cfg.left);
				if(cfg.top!=null)el.style.top=(typeof cfg.top==='number'?cfg.top+'px':cfg.top);
				var hd=el.querySelector('.xwin-hd');
				// Build toolbar items
				if(this._tbr&&cfg.tbar){this._tbitms=X.mks(cfg.tbar,this);for(var i=0;i<this._tbitms.length;i++)this._tbr.appendChild(this._tbitms[i].el);}
				// Build status / action bar items
				// 若 bbar 含按钮，加 xwin-bbr-actions，避免固定矮底栏裁切（新建表/导出预览等）
				if(this._bbr&&cfg.bbar){
					var bbitms=X.mks(cfg.bbar,this),hasActBtn=false,b,i;
					for(i=0;i<bbitms.length;i++){
						b=bbitms[i];
						if(typeof b==='string'||typeof b.el==='string')this._bbr.appendChild(document.createTextNode(b));
						else{
							this._bbr.appendChild(b.el);
							if(b.el&&b.el.classList&&(b.el.classList.contains('xbtn')||b.el.tagName==='BUTTON'))hasActBtn=true;
						}
					}
					if(hasActBtn)this._bbr.classList.add('xwin-bbr-actions');
				}
				// Close button
				var closeBtn=el.querySelector('.wclose');
				if(closeBtn)closeBtn.onclick=function(){self.close();};
				// Max button
				var maxBtn=el.querySelector('.wmax');
				if(maxBtn)maxBtn.onclick=function(){self.toggleMax();};
				// Min button
				var minBtn=el.querySelector('.wmin');
				if(minBtn)minBtn.onclick=function(){self.minimize();};
				// Double-click title bar to toggle maximize
				if(hd&&cfg.toolBtns!==false)hd.ondblclick=function(e){if(e.target.closest('.xwin-btns'))return;self.toggleMax();};
				// Drag
				if(cfg.draggable!==false)this._initDrag(hd);
				// Resize
				if(cfg.resizable!==false)this._initResize(el);
				// Bring to front on click
				el.onmousedown=function(){self._toFront();};
			},
			setTitle(t){
				var ttl=this.el.querySelector('.xwin-ttl');
				if(ttl)ttl.textContent=t;
			},
			close(silent){
				if(!silent){
					if(this.cfg.listeners&&this.cfg.listeners.beforeclose){
						if(this.cfg.listeners.beforeclose()===false)return;
					}
				}
				if(this._dockRec)X._tornWinSize={w:this.el.offsetWidth,h:this.el.offsetHeight};
				if(this.par){var idx=this.par.ch.indexOf(this);if(idx>-1)this.par.ch.splice(idx,1);}
				if(this._mgr)this._mgr._remove(this);
				this._removeMask();
				if(this.el.parentNode)this.el.parentNode.removeChild(this.el);
				if(!silent){
					if(this.cfg.listeners&&this.cfg.listeners.close)this.cfg.listeners.close();
				}
			},
			setBbarText(t){
				if(this._bbr)this._bbr.textContent=t;
			},
			toggleMax(){
				if(this._min){this._restoreMin();return;}
				if(this._max)this._restore();
				else this._maximize();
			},
			_maximize(){
				var el=this.el;
				this._savedRect={w:el.style.width,h:el.style.height,l:el.style.left,t:el.style.top};
				el.classList.add('xwin-max');
				el.style.width='';el.style.height='';el.style.left='';el.style.top='';
				this._max=true;this._min=false;
				var maxBtn=el.querySelector('.wmax');
				if(maxBtn)maxBtn.innerHTML='<i class="fa-regular fa-clone"></i>';
			},
			_restore(){
				var el=this.el,sr=this._savedRect;
				if(!sr)return;
				el.classList.remove('xwin-max');
				el.style.width=sr.w;el.style.height=sr.h;
				el.style.left=sr.l;el.style.top=sr.t;
				el.style.bottom='';
				this._max=false;
				var maxBtn=el.querySelector('.wmax');
				if(maxBtn)maxBtn.innerHTML='<i class="fa-regular fa-square"></i>';
			},
			minimize(){
				if(this._max)this._restore();
				if(this._min){this._restoreMin();return;}
				var el=this.el;
				this._savedRect={w:el.style.width,h:el.style.height,l:el.style.left,t:el.style.top};
				// Position: place after the rightmost minimized window
				var curLeft=0,mins=document.querySelectorAll('.xwin.xwin-min');
				for(var i=0;i<mins.length;i++){var ml=parseInt(mins[i].style.left)||0;if(ml+240>curLeft)curLeft=ml+240;}
				el.classList.add('xwin-min');
				el.style.left=curLeft+'px';
				el.style.width='240px';
				el.style.height='36px';
				el.style.bottom='0px';
				el.style.top='auto';
				this._min=true;
			},
			_restoreMin(){
				var el=this.el,sr=this._savedRect;
				if(!sr)return;
				el.classList.remove('xwin-min');
				el.style.width=sr.w;el.style.height=sr.h;
				el.style.left=sr.l;el.style.top=sr.t;
				el.style.bottom='';
				this._min=false;
			},
			enableModal(z){
				if(this._mask)return;
				var mask=document.createElement('div');
				mask.className='xmodal-mask';
				mask.style.zIndex=(z||1000)-1;
				document.body.appendChild(mask);
				this._mask=mask;
			},
			_removeMask(){
				if(this._mask&&this._mask.parentNode)this._mask.parentNode.removeChild(this._mask);
				this._mask=null;
			},
			_toFront(){
				this._z=Math.max(this._z,this._getMaxZ())+1;
				this.el.style.zIndex=this._z;
			},
			_getMaxZ(){
				var max=0,all=document.querySelectorAll('.xwin'),i,z;
				for(i=0;i<all.length;i++){z=parseInt(all[i].style.zIndex)||0;if(z>max)max=z;}
				return max;
			},
			/** 是否允许拖入 Tabpanel（默认 false；从 Tab 撕出的窗口由 Tabpanel 设 allowDock:true） */
			_canDock(){
				return !!(this.cfg&&this.cfg.allowDock);
			},
			_initDrag(hd){
				var self=this,el=this.el,isDown=false,ox,oy,dockMode=false;
				hd.onmousedown=function(e){
					if(e.target.closest('.xwin-btns'))return;
					isDown=true;
					// 仅 allowDock===true 时，拖标题文字才进入「可停靠 Tab」模式
					dockMode=self._canDock()&&!!e.target.closest('.xwin-ttl');
					var rect=el.getBoundingClientRect();
					ox=e.clientX-rect.left;
					oy=e.clientY-rect.top;
					self._toFront();
					document.addEventListener('mousemove',onMove);
					document.addEventListener('mouseup',onUp);
				};
				function onMove(e){
					if(!isDown)return;
					el.style.left=Math.max(0,e.clientX-ox)+'px';
					el.style.top=Math.max(0,e.clientY-oy)+'px';
					if(dockMode){
						var tp=self._findNearTabpnl(e.clientX,e.clientY);
						if(tp!==self._dockTarget){
							if(self._dockTarget){
								self._dockTarget._hideDropIndicator();
								self._dockTarget._dropIndicator.style.zIndex='10';
							}
							self._dockTarget=tp;
						}
						if(tp){
							tp._showDropIndicator(e.clientX);
							tp._dropIndicator.style.zIndex='10000';
							el.style.opacity='0.4';
						}else{
							el.style.opacity='';
						}
					}
				}
				function onUp(e){
					isDown=false;
					document.removeEventListener('mousemove',onMove);
					document.removeEventListener('mouseup',onUp);
					if(dockMode){
						var tp=self._dockTarget;
						if(tp&&self._canDock())self._dockToTab(tp,e.clientX);
						el.style.opacity='';
						if(self._dockTarget){
							self._dockTarget._hideDropIndicator();
							self._dockTarget._dropIndicator.style.zIndex='10';
							self._dockTarget=null;
						}
						dockMode=false;
					}
				}
			},
			_findNearTabpnl(x,y){
				var best=null,bestD=Infinity,list=X._tabpanels||[];
				for(var i=0;i<list.length;i++){
					var tp=list[i];
					if(!tp._bar)continue;
					var r=tp._bar.getBoundingClientRect(),m=24;
					if(x>=r.left-m&&x<=r.right+m&&y>=r.top-m&&y<=r.bottom+m){
						var cx=Math.max(r.left,Math.min(x,r.right));
						var cy=Math.max(r.top,Math.min(y,r.bottom));
						var d=Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
						if(d<bestD){bestD=d;best=tp;}
					}
				}
				return best;
			},
			_dockToTab(tp,x){
				if(!this._canDock())return;
				var idx=tp._getDropIndex(x),rec;
				if(this._dockRec&&this._sourceTabpnl===tp){
					rec=tp.attachTab(this._dockRec,idx);
				}else{
					// 普通弹窗进 Tab：仅 body，底栏/工具栏不随迁（对话框请保持 allowDock:false）
					var frag=document.createDocumentFragment();
					while(this._bd.firstChild)frag.appendChild(this._bd.firstChild);
					var title=(this.el.querySelector('.xwin-ttl')||{}).textContent||'Tab';
					rec=tp.add({title:title,content:frag});
					tp.moveTab(rec.id,idx);
				}
				if(tp.cfg.listeners&&tp.cfg.listeners.tabattach)tp.cfg.listeners.tabattach(rec.id,this);
				X._tornWinSize={w:this.el.offsetWidth,h:this.el.offsetHeight};
				this._dockRec=null;
				this._sourceTabpnl=null;
				this.close(true);
			},
			_initResize(el){
				var self=this,handles=el.querySelectorAll('.reshandle');
				var dirMap={resn:'n',ress:'s',rew:'w',rese:'e',resnw:'nw',resne:'ne',ressw:'sw',resse:'se'};
				handles.forEach(function(h){
					for(var cls in dirMap){if(h.classList.contains(cls)){h._dir=dirMap[cls];break;}}
					h.onmousedown=function(e){
						if(self._min)return;
						e.preventDefault();
						var dir=this._dir,sx=e.clientX,sy=e.clientY,sw=el.offsetWidth,sh=el.offsetHeight,sl=el.offsetLeft,st=el.offsetTop,minW=200,minH=120;
						function onMove(ev){
							var dx=ev.clientX-sx,dy=ev.clientY-sy,w=sw,h=sh,l=sl,t=st;
							if(dir.indexOf('e')!==-1)w=Math.max(minW,sw+dx);
							if(dir.indexOf('s')!==-1)h=Math.max(minH,sh+dy);
							if(dir.indexOf('w')!==-1){w=Math.max(minW,sw-dx);l=sl+(sw-w);}
							if(dir.indexOf('n')!==-1){h=Math.max(minH,sh-dy);t=st+(sh-h);}
							el.style.width=w+'px';el.style.height=h+'px';el.style.left=l+'px';el.style.top=t+'px';
						}
						function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}
						document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);
					};
				});
			},
		});
		X.reg('window', X.Window);
	}

	// ─── WindowManager ───
