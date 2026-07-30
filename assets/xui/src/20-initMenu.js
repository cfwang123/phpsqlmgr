/* XUI component: initMenu — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initMenu(){
		X.Menu = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Menu.prototype=Object.create(X.Base.prototype);
		X.extend(X.Menu.prototype, {
			constructor:X.Menu,
			build(){
				var self=this,d=X.CreateDOM(null,{x:'div.xmnu'+(this.cfg.contextMenu?'':'')});
				if(!this.cfg.contextMenu){
					var btn=X.CreateDOM(null,{x:'button.xbtn',type:'button',html:(this.cfg.icon||'')+(this.cfg.text||'')+' \u25BE',onclick:function(e){e.stopPropagation();self._toggle(d);}});
					d.appendChild(btn);
				}
				var pop=X.CreateDOM(null,{x:'div.pop',oncreate:function(el){self._pop=el;}});
				d.appendChild(pop);
				document.addEventListener('click',function(){d.classList.remove('open');});
				return d;
			},
			body(){ return this._pop; },
			_toggle(d){
				d.classList.toggle('open');
				if(!d.classList.contains('open'))return;
				var pop=d.querySelector('.pop');
				if(!pop)return;
				pop.style.left='';
				pop.style.right='';
				pop.style.top='';
				pop.style.bottom='';
				void pop.offsetHeight;
				var vr=pop.getBoundingClientRect();
				var cw=document.documentElement.clientWidth;
				var ch=document.documentElement.clientHeight;
				if(vr.right>cw)pop.style.right='auto',pop.style.left='0';
				if(vr.bottom>ch)pop.style.top='auto',pop.style.bottom='100%';
			},
			_renderItems(container,items){
				var d=this.el;
				for(var i=0;i<items.length;i++){
					var it=items[i];
					if(it==='-')container.appendChild(X.CreateDOM(null,{x:'div.sep'}));
					else if(it.menu){
						var a=X.CreateDOM(null,{x:'a.mi.has-sub',href:'javascript:void(0)',html:it.text||''});
						if(it.icon){
							var ic=typeof it.icon==='string'?X.CreateDOM(null,{x:'i',className:it.icon}):it.icon;
							a.insertBefore(ic,a.firstChild);
						}
						a.insertAdjacentHTML('beforeend','<i class="fa-solid fa-chevron-right sub-arrow"></i>');
						if(it.act)a.classList.add('act');
						var subPop=X.CreateDOM(null,{x:'div.sub-pop'});
						this._renderItems(subPop,it.menu);
						a.appendChild(subPop);
						a.addEventListener('mouseenter',function(){
							var sr=subPop.getBoundingClientRect();
							if(sr.bottom>window.innerHeight){
								var shift=Math.min(sr.bottom-window.innerHeight+2,sr.top-2);
								if(shift>0) subPop.style.top=(-5-shift)+'px';
							}
						});
						container.appendChild(a);
					}else{
						var a=X.CreateDOM(null,{x:'a.mi',href:'javascript:void(0)',html:it.text||''});
						if(it.icon){
							var ic=typeof it.icon==='string'?X.CreateDOM(null,{x:'i',className:it.icon}):it.icon;
							a.insertBefore(ic,a.firstChild);
						}
						if(it.handler)a.onclick=(function(h,itm,el){return function(e){e.stopPropagation();h(itm,el);d.classList.remove('open');};})(it.handler,it,a);
						if(it.act)a.classList.add('act');
						container.appendChild(a);
					}
				}
			},
			showAt(x,y){
				var pop=this._pop,d=this.el;
				if(!d.isConnected) document.body.appendChild(d);
				this._pop.innerHTML='';
				this._renderItems(this._pop,this.cfg.menu||[]);
				d.classList.add('open');
				pop.style.cssText='position:fixed;left:'+x+'px;top:'+y+'px;margin:0;right:auto;bottom:auto;';
				var vr=pop.getBoundingClientRect();
				if(vr.right>window.innerWidth)pop.style.left=(window.innerWidth-vr.width-2)+'px';
				if(vr.bottom>window.innerHeight)pop.style.top=(window.innerHeight-vr.height-2)+'px';
				if(parseInt(pop.style.left)<2)pop.style.left='2px';
				if(parseInt(pop.style.top)<2)pop.style.top='2px';
				var self=this;
				function onDocClick(e){
					if(!pop.contains(e.target)){
						d.classList.remove('open');
						document.removeEventListener('mousedown',onDocClick);
					}
				}
				document.addEventListener('mousedown',onDocClick);
			},
			init(){
				this._renderItems(this._pop,this.cfg.menu||[]);
			},
		});
		X.reg('menu', X.Menu);
	}

	// ─── Tree ───
