/* XUI bundle — auto-merged from src/; DO NOT EDIT.
 * Edit files under assets/xui/src/ then refresh page (mtime rebuild).
 * Generated: 2026-08-01 15:39:54
 */

/* ==== 00-head.js ==== */
/* XUI component: head — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
window.pr = console.log;
X = (function(w){
	var X={
		extend(){
			var o=arguments[0],i,vobj,k;
			for(i=1;i<arguments.length;i++){
			vobj=arguments[i];
			if(vobj)for(k in vobj)o[k]=vobj[k];
			}
			return o;
		},
	};
	var CreateDOM;

/* ==== 10-initX.js ==== */
/* XUI component: initX — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initX(){
		var types={},uid=0;
		return {
			reg(t,cls){
				types[t]=cls;
				// 创建 PascalCase 类名，支持 new X.Button(cfg) 语法
				// 仅在 X[name] 未定义时创建工厂函数，避免覆盖已有类引用
				var name=t.charAt(0).toUpperCase()+t.slice(1);
				if(!X[name]){
					X[name]=function(cfg){
						if(!cfg)cfg={};
						cfg.xtype=t;
						return X.mk(cfg);
					};
				}
			},
			mk(cfg,par){
				var Cls=types[cfg.xtype];
				if(!Cls)throw new Error('unknown xtype:'+cfg.xtype);
				return new Cls(cfg,par);
			},
			mks(items,par){
				return(items||[]).map(function(c){
					if(par&&par.cfg&&par.cfg.defaults)c=X.extend({},par.cfg.defaults,c);
					return X.mk(c,par);
				});
			},
			mount(o,par,rt){
				if(par){
				if(par.cfg&&par.cfg.layout==='table')return;
				var pb=par.body?par.body():par.el;
				if(pb)pb.appendChild(o.el);
				}else if(rt){(rt.nodeType?rt:document.querySelector(rt)).appendChild(o.el);}
			},
			concat(){
				var o=arguments[0],i,vobj,v;
				for(i=1;i<arguments.length;i++){
				vobj=arguments[i];
				for(v of vobj)o.push(v);
				}
				return o;
			},
			CreateDOM(page,o){
				var dom,x,k,childs,style,defaults,html,name,oncreate,tag,id,cls;
				if(o instanceof Array){
				return o.filter(function(v){return v!=null;}).map(function(v){return X.CreateDOM(page,v);});
				}
				if(o instanceof Element)return o;
				o=X.extend({},o);
				x=o.x;delete o.x;delete o.ref;
				if(!x)x='div';
				childs=o.childs||o.c;style=o.style||o.s;defaults=o.defaults;html=o.html;
				name=o.name;oncreate=o.oncreate;
				delete o.childs;delete o.c;delete o.style;delete o.s;delete o.defaults;delete o.html;delete o.name;delete o.oncreate;
				tag=X.ParseEmmet(x);id=tag[1];cls=tag[2];tag=tag[0];
				if(cls.length)cls=cls.join(' ');
				else{
				cls=o.className||'';
				if(cls instanceof Array)cls=cls.filter(function(v){return v;}).join(' ');
				}
				delete o.className;
				dom=document.createElement(tag);
				if(id)o.id=id;
				if(cls)o.className=cls;
				for(k in o){
				if(typeof dom[k]!=='undefined')dom[k]=o[k];
				else if(o[k]!=null)dom.setAttribute(k,o[k]);
				}
				X.extend(dom,o);
				if(style)X.extend(dom.style,style);
				if(html!==undefined)dom.innerHTML=html;
				else if(childs!==undefined){
				if(typeof childs==='function')childs=childs();
				if(!(childs instanceof Array))childs=[childs];
				addarray(page,dom,childs,defaults);
				}
				if(name&&page&&page.doms)page.doms[name]=dom;
				if(oncreate)oncreate(dom);
				return dom;
			},
			ParseEmmet(name){
				var tag='div',cls=[],id='',pos0=0,i,ch,seg,nowtype=0;
				for(i=0;i<name.length;i++){
				ch=name.charCodeAt(i);
				if(ch===0x2e||ch===0x23){
					seg=name.substr(pos0,i-pos0);
					if(seg!==''){
					if(nowtype===0)tag=seg;
					else if(nowtype===1)cls.push(seg);
					else id=seg;
					}
					nowtype=ch===0x2e?1:2;
					pos0=i+1;
				}
				}
				if(pos0<name.length){
				seg=name.substr(pos0);
				if(seg!==''){
					if(nowtype===0)tag=seg;
					else if(nowtype===1)cls.push(seg);
					else id=seg;
				}
				}
				if(!tag)tag='div';
				return [tag,id,cls];
			},
			gid(){return 'x'+(++uid);},
			Base:initBase(),
			types:types,
			loadJs:loadJs
		};

		function addarray(page,dom,arr,defaults){
			var v,i;
			for(i=0;i<arr.length;i++){
				v=arr[i];
				if(v==null)continue;
				if(typeof v==='function')v=v();
				if(v instanceof Array)addarray(page,dom,v,defaults);
				else if(typeof v==='string')dom.appendChild(document.createTextNode(v));
				else if(v instanceof Element)dom.appendChild(v);
				else if(v&&v.el instanceof Element)dom.appendChild(v.el);
				else if(typeof v==='object'){
					if(defaults)v=extend({},defaults,v);
					dom.appendChild(X.CreateDOM(page,v));
				}
			}
		}
	}

/* ==== 11-initCombo.js ==== */
/* XUI component: initCombo — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initCombo(){
		X.Combo = function(cfg,par){
			// Must init _allItems before Fld.call (which triggers build()) so _txt() can access it
			var opts=cfg.store||[];
			this._valueField=cfg.valueField!=null?cfg.valueField:0;
			this._displayField=cfg.displayField!=null?cfg.displayField:1;
			this._allItems=typeof opts==='function'?[]:opts.slice();
			this._filtered=this._allItems.slice();
			this._selected=cfg.value?((cfg.multiSelect&&Array.isArray(cfg.value))?cfg.value.slice():[cfg.value]):[];
			this._prevValidValue=cfg.value;
			this._opened=0;
			this._highlight=-1;
			this._cacheData=null;
			this._cacheTime=0;
			this._listeners={};
			this._debounceTimer=null;
			this._loadDone=false;
			X.Fld.call(this,cfg,par);
			this.dom=this.el;
			this.dom._xinst=this;
		}
		X.Combo.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Combo.prototype, {
			constructor:X.Combo,
			// ─── Tpl helpers (headTpl/footTpl) ───
			_appendTpl(tpl){
				if(tpl==null)return;
				if(typeof tpl==='function')tpl=tpl();
				if(tpl&&typeof tpl.then==='function'){
					var self=this;
					tpl.then(function(v){self._appendTpl(v);});
					return;
				}
				if(tpl.nodeType)this._popBody.appendChild(tpl);
				else if(tpl!='')this._popBody.insertAdjacentHTML('beforeend',String(tpl));
			},
			build(){
				var self=this,cfg=this.cfg;
				this._displayField=cfg.displayField!=null?cfg.displayField:1;
				this._valueField=cfg.valueField!=null?cfg.valueField:0;
				var ms=cfg.multiSelect?true:false;
				var w=X.CreateDOM(null,{x:'div.xcombo'+(ms?'.xcombo-ms':''),
					oncreate:function(el){
						self._w=el;
						if(cfg.width!=null){
							el.style.width=typeof cfg.width==='number'?cfg.width+'px':cfg.width;
						}
					},
					c:[
					{x:'div.xcombo-inpwrp',c:[
						ms?{x:'div.xtags',oncreate:function(el){self._tagsEl=el;}}:null,
						{x:'input.xin',type:'text',placeholder:cfg.placeholder||'',autocomplete:'off',
							value:!ms&&cfg.value!=null?self._txt(cfg.value):'',
							oncreate:function(el){self._inp=el;}}
					]},
					{x:'button.xarr',type:'button',html:cfg.triggerText||'<i class="fa-solid fa-caret-down"></i>',
						onmousedown:function(e){e.preventDefault();self._ignoreBlur=true;},
						onclick:function(e){e.stopPropagation();self.toggle();}}
				]});
				if(cfg.editable===false)this._inp.readOnly=true;
				this._inp.onfocus=function(){self._w.classList.add('xcombo-focus');self.open();if(cfg.editable!==false&&cfg.selectOnFocus!==false)self._inp.select();};
				this._inp.oninput=function(){
					if(self._debounceTimer)clearTimeout(self._debounceTimer);
					var qd=cfg.queryDelay||(cfg.filterFn?0:250);
					if(qd>0){
						self._debounceTimer=setTimeout(function(){self._filter();},qd);
					}else{
						self._filter();
					}
				};
				this._inp.onkeydown=function(e){self._onkey(e);};
				this._inp.onblur=function(){
					setTimeout(function(){
						self._w.classList.remove('xcombo-focus');
						if(self._ignoreBlur){self._ignoreBlur=false;return;}
						self.close();
						if(cfg.forceSelection)self._applyForce();
						if(self._inp.value===''&&cfg.allowBlank===false)self.setValue(self._prevValidValue);
					},180);
				};
				this._pop=X.CreateDOM(null,{x:'div.xcombo-pop'+(cfg.matchFieldWidth===false?'.nomatch':'')});
				this._popBody=X.CreateDOM(null,{x:'div.xcombo-pop-body'});
				this._pop.appendChild(this._popBody);
				w.appendChild(this._pop);
				document.addEventListener('mousedown',function(e){if(!w.contains(e.target))self.close();});
				this._inp.setAttribute('role','combobox');
				this._inp.setAttribute('aria-haspopup','listbox');
				this._inp.setAttribute('aria-expanded','false');
				this._popBody.setAttribute('role','listbox');
				return w;
			},
			// ─── Event system ───
			on(ev,fn){
				if(!this._listeners[ev])this._listeners[ev]=[];
				this._listeners[ev].push(fn);
				return this;
			},
			off(ev,fn){
				if(!this._listeners[ev])return this;
				if(!fn){delete this._listeners[ev];return this;}
				this._listeners[ev]=this._listeners[ev].filter(function(f){return f!==fn;});
				return this;
			},
			_fireEvent(ev){
				if(!this._listeners[ev])return undefined;
				var args=Array.prototype.slice.call(arguments,1),ret;
				for(var i=0;i<this._listeners[ev].length;i++){
					ret=this._listeners[ev][i].apply(null,args);
				}
				return ret;
			},
			// ─── Text helpers ───
			_txt(v){
				if(v==null)return '';
				for(var i=0;i<this._allItems.length;i++){
					var it=this._allItems[i];
					if(String(this._getVal(it))===String(v))return this._getText(it);
				}
				return String(v);
			},
			_rec(v){
				if(v==null)return null;
				for(var i=0;i<this._allItems.length;i++){
					var it=this._allItems[i],mv=this._getVal(it);
					if(String(mv)===String(v))return it;
				}
				return null;
			},
			_getVal(it){
				if(typeof it!=='object'||it===null)return it;
				var vf=this._valueField;
				if(Array.isArray(it))return it[vf]!=null?it[vf]:it;
				return it[vf]!=null?it[vf]:(it.value!=null?it.value:it);
			},
			_getText(it){
				if(typeof it!=='object'||it===null)return it;
				var df=this._displayField;
				if(Array.isArray(it))return it[df]!=null?it[df]:it;
				return it[df]!=null?it[df]:(it.text!=null?it.text:it);
			},
			// ─── Expand / Collapse ───
			toggle(){ if(this._opened)this.collapse();else this.expand(); },
			expand(){
				if(this._opened)return;
				if(this._fireEvent('beforequery',(this._inp&&this._inp.value)||'',this)===false)return;
				if(typeof this.cfg.store==='function'&&!this._loadDone){
					this._loadRemote();
					return;
				}
				if(typeof this.cfg.store==='function'&&this._loadDone){
					this._doOpen();
					return;
				}
				this._doOpen();
			},
			collapse(){
				if(!this._opened)return;
				this._opened=0;this._highlight=-1;this._pop.classList.remove('open');
				this._inp.setAttribute('aria-expanded','false');
				this._fireEvent('collapse',this);
			},
			close(){ this.collapse(); },
			open(){ this.expand(); },
			isExpanded(){ return !!this._opened; },
			_doOpen(){
				var mc=this.cfg.minChars||0;
				if(mc>0&&this._inp&&this._inp.value.length<mc){
					this._filtered=this._allItems.slice();
					this._filtered=[];
					this._render();
					this._applyPopSize();
					this._opened=1;this._highlight=-1;this._pop.classList.add('open');
					this._applyPopWidth();
					this._applyPopDir();
					this._inp.setAttribute('aria-expanded','true');
					return;
				}
				this._filtered=this._allItems.slice();
				this._render();
				this._applyPopSize();
				this._opened=1;this._highlight=-1;this._pop.classList.add('open');
				this._applyPopWidth();
				this._applyPopDir();
				this._inp.setAttribute('aria-expanded','true');
				this._fireEvent('expand',this);
			},
			_applyPopWidth(){
				var pop=this._pop,w=this._w.offsetWidth;
				if(this._popSize){
					pop.style.left='0';
					pop.style.right='auto';
					return;
				}
				if(this.cfg.matchFieldWidth===false){
					var natural=pop.scrollWidth;
					pop.style.width=Math.max(natural,w)+'px';
				}else{
					pop.style.width=w+'px';
				}
				pop.style.left='0';
				pop.style.right='auto';
				pop.style.minWidth='0';
				pop.style.maxWidth='';
			},
			_applyPopDir(){
				var pop=this._pop,popH=pop.offsetHeight,w=this._w,wr=w.getBoundingClientRect(),vh=window.innerHeight;
				var downOverflow=Math.max(0,popH-(vh-wr.bottom));
				var upOverflow=Math.max(0,popH-wr.top);
				if(downOverflow<=0&&upOverflow<=0){
					pop.classList.remove('up');
				}else if(downOverflow<=0){
					pop.classList.remove('up');
				}else if(upOverflow<=0){
					pop.classList.add('up');
				}else{
					pop.classList.toggle('up',upOverflow<downOverflow);
				}
			},
			_appendResizer(){
				var self=this,pop=this._pop,popBody=this._popBody,rsz=document.createElement('div');
				rsz.className='xcombo-rsz';
				pop.appendChild(rsz);
				rsz.addEventListener('mousedown',function(e){
					e.preventDefault();
					e.stopPropagation();
					var sw=pop.offsetWidth,sh=pop.offsetHeight,sx=e.screenX,sy=e.screenY;
					function onmove(ev){
						var dw=ev.screenX-sx,dh=ev.screenY-sy;
						pop.style.width=Math.max(100,sw+dw)+'px';
						pop.style.height=Math.max(50,sh+dh)+'px';
						pop.style.maxHeight='none';
						popBody.style.maxHeight='none';
					}
					function onup(){
						document.removeEventListener('mousemove',onmove);
						document.removeEventListener('mouseup',onup);
						self._popSize={width:pop.style.width,height:pop.style.height};
					}
					document.addEventListener('mousemove',onmove);
					document.addEventListener('mouseup',onup);
				});
			},
			_applyPopSize(){
				var ps=this._popSize;
				if(ps){
					this._pop.style.width=ps.width;
					this._pop.style.height=ps.height;
					this._pop.style.maxHeight='none';
					this._popBody.style.maxHeight='none';
				}
			},
			// ─── Remote data ───
			_loadRemote(){
				var self=this,cfg=this.cfg,now=Date.now(),ttl=(cfg.cacheTTL!=null?cfg.cacheTTL:60)*1000;
				if(self._cacheData&&(now-self._cacheTime<ttl)){
					self._allItems=self._cacheData.slice();
					self._loadDone=true;
					self._filtered=self._allItems.slice();
					self._updateSelectedDisplay();
					self._doOpen();
					return;
				}
				self._showLoading();
				var result=cfg.store();
				if(result&&typeof result.then==='function'){
					result.then(function(data){
						self._hideLoading();
						self._cacheData=data;
						self._cacheTime=Date.now();
						self._allItems=self._normalizeStore(data);
						self._loadDone=true;
						self._filtered=self._allItems.slice();
						self._updateSelectedDisplay();
						self._doOpen();
						self._fireEvent('load',self._allItems,self);
					}).catch(function(e){
						self._hideLoading();
						console.error('Combo store error:',e);
					});
				}else{
					self._hideLoading();
					self._cacheData=result;
					self._cacheTime=now;
					self._allItems=self._normalizeStore(result||[]);
					self._loadDone=true;
					self._filtered=self._allItems.slice();
					self._updateSelectedDisplay();
					self._doOpen();
					self._fireEvent('load',self._allItems,self);
				}
			},
			_normalizeStore(data){
				return (data||[]).slice();
			},
			_showLoading(){
				if(!this._pop)return;
				this._popBody.innerHTML='';
				this._popBody.appendChild(X.CreateDOM(null,{x:'div.xcombo-loading',c:'\u52A0\u8F7D\u4E2D...'}));
				this._opened=1;this._pop.classList.add('open');
				this._applyPopWidth();
				this._applyPopDir();
			},
			_hideLoading(){ this._opened=0;this._pop.classList.remove('open'); },
			// ─── Filtering ───
			_filter(){
				var self=this,fn=this.cfg.filterFn,cfg=this.cfg;
				var q=(this._inp&&this._inp.value)||'';
				var mc=cfg.minChars||0;
				if(typeof fn==='function'){
					this._filtered=this._allItems.filter(function(it){return fn(it);});
				}else if(mc>0&&q.length<mc){
					this._filtered=this._allItems.slice();
				}else{
					var lq=q.toLowerCase();
					this._filtered=this._allItems.filter(function(it){return (self._getText(it)||'').toLowerCase().indexOf(lq)>=0;});
				}
				if(cfg.typeAhead&&this._filtered.length>0&&q.length>0){
					var first=this._filtered[0],txt=this._getText(first);
					if(txt.toLowerCase().indexOf(q.toLowerCase())===0&&txt!==q){
						this._inp.value=q+txt.substring(q.length);
						this._inp.setSelectionRange(q.length,txt.length);
					}
				}
				this._render();
			},
			// ─── Rendering ───
			_render(){
				var self=this,cfg=this.cfg;
				this._highlight=-1;
				this._popBody.innerHTML='';
				if(cfg.headTpl)this._appendTpl(cfg.headTpl);
				if(this._filtered.length===0){
					this._popBody.appendChild(X.CreateDOM(null,{x:'div.xcombo-empty',c:cfg.emptyText||'\u65E0\u5339\u914D\u9879'}));
					if(cfg.footTpl)this._appendTpl(cfg.footTpl);
					this._appendResizer();
					return;
				}
				var groupField=cfg.groupField,groupTpl=cfg.groupTpl,listTpl=cfg.listTpl;
				if(groupField){
					var groups={},gkeys=[],i,it,gv,gi,grp;
					for(i=0;i<this._filtered.length;i++){
						it=this._filtered[i];
						gv=it[groupField]||'';
						if(!groups[gv]){groups[gv]=[];gkeys.push(gv);}
						groups[gv].push(it);
					}
					for(gi=0;gi<gkeys.length;gi++){
						grp=groups[gkeys[gi]];
						(function(gname,gitems){
							var gh=X.CreateDOM(null,{x:'div.xcombo-grp-hd',c:typeof groupTpl==='function'?groupTpl(gname):gname});
							self._popBody.appendChild(gh);
							gitems.forEach(function(it,idx){
								var val=self._getVal(it);
								var d=X.CreateDOM(null,{
									x:'div.xcombo-itm',
									html:typeof listTpl==='function'?listTpl(self._getText(it),it):(self._getText(it)||''),
									oncreate:function(el){el.setAttribute('data-value',val);el.setAttribute('role','option');},
									onmousedown:function(e){e.preventDefault();e.stopPropagation();self._pick(val);},
									onmouseenter:function(){self._highlight=idx;self._updhl();}
								});
								if(self._isSelected(val))d.classList.add('sel');
								if(cfg.wrapItems)d.classList.add('wrap');
								self._popBody.appendChild(d);
							});
						})(gkeys[gi],grp);
					}
				}else{
					this._filtered.forEach(function(it,i){
						var val=self._getVal(it);
						var d=X.CreateDOM(null,{
							x:'div.xcombo-itm',
							html:typeof listTpl==='function'?listTpl(self._getText(it),it):(self._getText(it)||''),
							'data-value':val,
							oncreate:function(el){el.setAttribute('role','option');},
							onmousedown:function(e){e.preventDefault();e.stopPropagation();self._pick(val);},
							onmouseenter:function(){self._highlight=i;self._updhl();}
						});
						if(self._isSelected(val))d.classList.add('sel');
						if(cfg.wrapItems)d.classList.add('wrap');
						self._popBody.appendChild(d);
					});
				}
				if(cfg.footTpl)this._appendTpl(cfg.footTpl);
				this._appendResizer();
			},
			_updhl(){
				var items=this._popBody.querySelectorAll('.xcombo-itm');
				for(var i=0;i<items.length;i++)items[i].classList.toggle('hl',i===this._highlight);
			},
			_isSelected(v){
				if(!this.cfg.multiSelect)return String(this._v)===String(v);
				var sel=this._selected||[];
				for(var i=0;i<sel.length;i++)if(String(sel[i])===String(v))return true;
				return false;
			},
			// ─── Selection ───
			_pick(val){
				if(this.cfg.multiSelect){
					this._toggleMulti(val);
				}else{
					var rec=this._rec(val);
					this._v=val;
					if(this._inp)this._inp.value=rec?this._getText(rec):(val!=null?String(val):'');
					this._prevValidValue=val;
					this.collapse();
					this._fire();
					this._fireEvent('select',rec||{value:val},this);
				}
			},
			_toggleMulti(val){
				var idx=-1,sel=this._selected||[],mx=this.cfg.maxSelect||0;
				for(var i=0;i<sel.length;i++)if(String(sel[i])===String(val)){idx=i;break;}
				if(idx>=0){
					sel.splice(idx,1);
				}else if(mx===0||sel.length<mx){
					sel.push(val);
				}
				this._selected=sel;
				this._v=sel.slice();
				this._renderMultiTags();
				this._render();
				this._fire();
				this._fireEvent('select',this._rec(val)||{value:val},this);
				if(this.cfg.editable!==false)this._inp.focus();
			},
			_updateSelectedDisplay(){
				var ms=this.cfg.multiSelect;
				if(ms){this._renderMultiTags();}
				else{
					if(this._inp&&this._v!=null)this._inp.value=this._txt(this._v);
				}
			},
			_renderMultiTags(){
				if(!this._tagsEl)return;
				var self=this,sel=this._selected||[];
				this._tagsEl.innerHTML='';
				for(var i=0;i<sel.length;i++){
					var v=sel[i],txt=this._txt(v);
					(function(val){
						var tag=X.CreateDOM(null,{x:'span.xtag',c:[
							{x:'span.xtag-txt',c:txt},
							{x:'span.xtag-cls',c:'\u00D7',
								onmousedown:function(e){e.stopPropagation();self._toggleMulti(val);}}
						]});
						self._tagsEl.appendChild(tag);
					})(v);
				}
				if(this._inp)this._inp.style.display=sel.length>0?'inline-block':'';
				this._inp.placeholder=sel.length>0?'':(this.cfg.placeholder||'');
			},
			// ─── Keyboard ───
			_onkey(e){
				if(!this._opened){
					if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Enter'){e.preventDefault();this.expand();}
					return;
				}
				switch(e.key){
					case 'ArrowDown':e.preventDefault();
						if(this._highlight<this._filtered.length-1)this._highlight++;else this._highlight=0;
						this._updhl();this._scrl();break;
					case 'ArrowUp':e.preventDefault();
						if(this._highlight>0)this._highlight--;else this._highlight=this._filtered.length-1;
						this._updhl();this._scrl();break;
					case 'Enter':e.preventDefault();
						if(this._highlight>=0&&this._highlight<this._filtered.length){
							var it=this._filtered[this._highlight];
							this._pick(this._getVal(it));
						}else{
							this.collapse();
						}
						break;
					case 'Escape':e.preventDefault();this.collapse();break;
				}
			},
			_scrl(){
				var items=this._popBody.querySelectorAll('.xcombo-itm');
				if(items[this._highlight])items[this._highlight].scrollIntoView({block:'nearest'});
			},
			// ─── Force selection ───
			_applyForce(){
				if(this._v!=null&&this._txt(this._v)===this._inp.value)return;
				var q=(this._inp.value||'').toLowerCase(),match=null;
				for(var i=0;i<this._allItems.length;i++){
					if((this._getText(this._allItems[i])||'').toLowerCase().indexOf(q)>=0){
						if(!match||this._getText(this._allItems[i]).toLowerCase()===q)match=this._allItems[i];
						if(this._getText(this._allItems[i]).toLowerCase()===q)break;
					}
				}
				if(match){this._pick(this._getVal(match));}
				else if(this.cfg.allowBlank===false&&this._prevValidValue!=null){
					this.setValue(this._prevValidValue);
				}
			},
			// ─── Value API ───
			getValue(){ return this.cfg.multiSelect?((this._selected||[]).slice()):this._v; },
			setValue(v){
				if(this.cfg.multiSelect){
					this._selected=Array.isArray(v)?v.slice():(v!=null?[v]:[]);
					this._v=this._selected.slice();
					this._renderMultiTags();
				}else{
					this._v=v;
					if(this._inp)this._inp.value=v!=null?this._txt(v):'';
					this._prevValidValue=v;
				}
			},
			clearValue(){
				if(this.cfg.multiSelect){
					this._selected=[];
					this._v=[];
					this._renderMultiTags();
				}else{
					this._v=undefined;
					if(this._inp)this._inp.value='';
				}
				this._fire();
			},
			findRecordByValue(v){ return this._rec(v); },
			getDisplayValue(){
				if(this.cfg.multiSelect){
					var sel=this._selected||[];
					return sel.map(function(v){return this._txt(v);},this).join(', ');
				}
				return this._v!=null?this._txt(this._v):'';
			},
			selectIndex(idx){
				if(idx<0||idx>=this._allItems.length)return;
				var it=this._allItems[idx];
				this._pick(this._getVal(it));
			},
			selectValue(v){ this._pick(v); },
			getFilteredRecords(){ return this._filtered.slice(); },
			// ─── Data management ───
			clearCache(){ this._cacheData=null;this._cacheTime=0;this._loadDone=false; },
			updateStore(){
				var self=this,opts=this.cfg.store;
				this.clearCache();
				if(typeof opts==='function'){
					this._allItems=[];
				}else{
					this._allItems=this._normalizeStore(opts||[]);
				}
				this._filtered=this._allItems.slice();
				this._updateSelectedDisplay();
			},
			isValid(){
				var v=this.getValue();
				if(this.cfg.allowBlank===false&&(v==null||v===''||(Array.isArray(v)&&v.length===0)))return false;
				if(typeof this.cfg.validator==='function'){
					var msg=this.cfg.validator(v);
					return msg===true;
				}
				return true;
			},
			getErrors(){
				var v=this.getValue();
				if(this.cfg.allowBlank===false&&(v==null||v===''||(Array.isArray(v)&&v.length===0)))return ['\u8BE5\u5B57\u6BB5\u4E0D\u80FD\u4E3A\u7A7A'];
				if(typeof this.cfg.validator==='function'){
					var msg=this.cfg.validator(v);
					if(msg!==true)return [msg||'\u6821\u9A8C\u5931\u8D25'];
				}
				return [];
			},
			init(){
				X.Fld.prototype.init.call(this);
				if(this.cfg.multiSelect)this._renderMultiTags();
			},
		});
		X.reg('combo',X.Combo);
	};

/* ==== 12-initlybox.js ==== */
/* XUI component: initlybox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initlybox(){
		// ─── lybox layout helpers ───
		function lybox(ly){
			function Box(cfg,par){cfg.layout=ly;X.Container.call(this,cfg,par);}
			Box.prototype=Object.create(X.Container.prototype);
			X.extend(Box.prototype, {constructor:Box});
			return Box;
		}
		X.reg('fit',lybox('fit'));
		X.reg('hbox',lybox('hbox'));
		X.reg('vbox',lybox('vbox'));
		X.reg('column',lybox('column'));
		X.reg('anchor',lybox('anchor'));
		X.reg('table',lybox('table'));
		X.reg('card',lybox('card'));
	}

	// ─── Container ───

/* ==== 13-initContainer.js ==== */
/* XUI component: initContainer — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initContainer(){
		X.Container = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Container.prototype=Object.create(X.Base.prototype);
		X.extend(X.Container.prototype, {
			constructor:X.Container,
			build(){
				var x='div.xctn';
				if(this.cfg.layout)x+='.xly-'+this.cfg.layout;
				return X.CreateDOM(null,{x:x});
			},
			init(){
				if(this.cfg.layout)this._applyly(this.cfg.layout);
			},
		});
		X.reg('container', X.Container);
	}

	// ─── Viewport ───

/* ==== 14-initViewport.js ==== */
/* XUI component: initViewport — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initViewport(){
		X.Viewport = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Viewport.prototype=Object.create(X.Base.prototype);
		X.extend(X.Viewport.prototype, {
			constructor:X.Viewport,
			build(){ return X.CreateDOM(null,{x:'div.xvp'}); },
		});
		X.reg('viewport', X.Viewport);
	}

	// ─── Titlebar ───

/* ==== 15-initTitlebar.js ==== */
/* XUI component: initTitlebar — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTitlebar(){
		X.Titlebar = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Titlebar.prototype=Object.create(X.Base.prototype);
		X.extend(X.Titlebar.prototype, {
			constructor:X.Titlebar,
			build(){
				var d=X.CreateDOM(null,{x:'div.xtb',c:[
					{x:'span.ttl',c:this.cfg.title||''},
					{x:'div.tbr'}
				]});
				this._tbr=d.lastElementChild;
				return d;
			},
			body(){ return this._tbr; },
		});
		X.reg('titlebar', X.Titlebar);
	}

	// ─── Statusbar ───

/* ==== 16-initStatusbar.js ==== */
/* XUI component: initStatusbar — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initStatusbar(){
		X.Statusbar = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Statusbar.prototype=Object.create(X.Base.prototype);
		X.extend(X.Statusbar.prototype, {
			constructor:X.Statusbar,
			build(){
				var d=X.CreateDOM(null,{x:'div.xsb',c:[
					{x:'span.lft',c:this.cfg.left||''},
					{x:'span.rgt',c:this.cfg.right||''}
				]});
				this._lft=d.firstElementChild;
				this._rgt=d.lastElementChild;
				return d;
			},
			setleft(t){ this._lft.textContent=t; },
			setright(t){ this._rgt.textContent=t; },
		});
		X.reg('statusbar', X.Statusbar);
	}

	// ─── Borderlayout ───

/* ==== 17-initBorderlayout.js ==== */
/* XUI component: initBorderlayout — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initBorderlayout(){
		X.Borderlayout = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Borderlayout.prototype=Object.create(X.Base.prototype);
		X.extend(X.Borderlayout.prototype, {
			constructor:X.Borderlayout,
			build(){
				var d=X.CreateDOM(null,{x:'div.xbd',c:[{x:'div.xnv'},{x:'div.xct'}]});
				this._nv=d.firstElementChild;
				this._cn=d.lastElementChild;
				return d;
			},
			init(){
				var reg=this.cfg.region||{};
				this.ch=[];
				if(reg.west){var w=X.mk(reg.west);this._nv.appendChild(w.el);this.ch.push(w);}
				if(reg.center){var c=X.mk(reg.center);this._cn.appendChild(c.el);this.ch.push(c);}
			},
		});
		X.reg('border', X.Borderlayout);
	}

	// ─── Button ───

/* ==== 18-initButton.js ==== */
/* XUI component: initButton — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initButton(){
		X.Button = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Button.prototype=Object.create(X.Base.prototype);
		X.extend(X.Button.prototype, {
			constructor:X.Button,
			build(){
				var self=this,cls='xbtn'+(this.cfg.small?' sm':'')+(this.cfg.icon?' ic':'');
				return X.CreateDOM(null,{
					x:'button',className:cls,type:'button',
					html:(this.cfg.icon||'')+(this.cfg.text||''),
					onclick:function(e){e.stopPropagation();if(self.cfg.handler)self.cfg.handler.call(self,e);}
				});
			},
		});
		X.reg('button', X.Button);
	}

	// ─── Sep ───

/* ==== 19-initSep.js ==== */
/* XUI component: initSep — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initSep(){
		X.Sep = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Sep.prototype=Object.create(X.Base.prototype);
		X.extend(X.Sep.prototype, {
			constructor:X.Sep,
			build(){ return X.CreateDOM(null,{x:'span.xsep'}); },
		});
		X.reg('sep', X.Sep);
	}

	// ─── Menu ───

/* ==== 20-initMenu.js ==== */
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

/* ==== 21-initTree.js ==== */
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

/* ==== 22-initTabpanel.js ==== */
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

/* ==== 23-initPanel.js ==== */
/* XUI component: initPanel — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initPanel(){
		X.Panel = function(cfg,par){X.Base.call(this,cfg,par);}
		X.Panel.prototype=Object.create(X.Base.prototype);
		X.extend(X.Panel.prototype, {
			constructor:X.Panel,
			build(){
				var d=X.CreateDOM(null,{x:'div.xfld',c:[
					{x:'div.hd',c:this.cfg.title||''},
					{x:'div.bd',oncreate:function(el){this._bd=el;}.bind(this)}
				]});
				return d;
			},
			body(){ return this._bd; },
			init(){ if(this.cfg.layout)this._applyly(this.cfg.layout); },
		});
		X.reg('panel', X.Panel);
	}

	// ─── Fieldset ───

/* ==== 24-initFieldset.js ==== */
/* XUI component: initFieldset — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFieldset(){
		X.Fieldset = function(cfg,par){X.Panel.call(this,cfg,par);};
		X.Fieldset.prototype=Object.create(X.Panel.prototype);
		X.extend(X.Fieldset.prototype, {constructor:X.Fieldset});
		X.reg('fieldset', X.Fieldset);
	}

	// ─── Fieldrow ───

/* ==== 25-initFieldrow.js ==== */
/* XUI component: initFieldrow — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFieldrow(){
		X.Fieldrow = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Fieldrow.prototype=Object.create(X.Base.prototype);
		X.extend(X.Fieldrow.prototype, {
			constructor:X.Fieldrow,
			build(){
				var d=X.CreateDOM(null,{x:'div.xfrow',c:[
					{x:'span.lbl',c:this.cfg.fieldLabel||''},
					{x:'div.inp',oncreate:function(el){this._inp=el;}.bind(this)}
				]});
				return d;
			},
			body(){ return this._inp; },
		});
		X.reg('fieldrow', X.Fieldrow);
	}

	// ─── Window ───

/* ==== 26-initWindow.js ==== */
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

/* ==== 27-initWinMgr.js ==== */
/* XUI component: initWinMgr — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initWinMgr(){
		function WinMgr(){this._wins=[];}
		WinMgr.prototype={
			create(cfg){
				var win=X.mk(cfg);
				win._z=this._nextZ();
				win.el.style.zIndex=win._z;
				win._mgr=this;
				document.body.appendChild(win.el);
				// Default positioning - center window
				if(cfg.left==null&&cfg.top==null){
					var w=parseInt(win.el.style.width)||400,h=parseInt(win.el.style.height)||300;
					win.el.style.left=Math.max(0,(window.innerWidth-w)/2)+'px';
					win.el.style.top=Math.max(0,(window.innerHeight-h)/2)+'px';
				}
				if(cfg.modal&&win.enableModal)win.enableModal(win._z);
				this._wins.push(win);
				return win;
			},
			_remove(win){
				var idx=this._wins.indexOf(win);
				if(idx>-1)this._wins.splice(idx,1);
			},
			_nextZ(){
				var max=1000,i;
				for(i=0;i<this._wins.length;i++){var z=parseInt(this._wins[i].el.style.zIndex)||0;if(z>max)max=z;}
				return max+1;
			},
		};
		X.WinMgr=new WinMgr();
	}

	// ─── Box ─── 通用 HTML 容器

/* ==== 28-initBox.js ==== */
/* XUI component: initBox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initBox(){
		X.Box = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Box.prototype=Object.create(X.Base.prototype);
		X.extend(X.Box.prototype, {
			constructor:X.Box,
			build(){ return X.CreateDOM(null,{x:'div.xbox',html:this.cfg.html||this.cfg.value||''}); },
			setValue(v){ this.el.innerHTML=v; }
		});
		X.reg('box', X.Box);
	}

	// ─── Grid ─── 通用虚拟滚动表格

/* ==== 29-initVirtualgrid.js ==== */
/* XUI component: initVirtualgrid — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initVirtualgrid(){
		/** 可选接入 SqlmngerI18n；无则用 fallback */
		function vgT(key, fallback, vars) {
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

		X.Grid = function Grid(opts){
			// ══════════ 配置 ══════════
			var dataArr = opts.data || [];
			var TOTAL = opts.total != null ? opts.total : dataArr.length; // 视图行数（筛选后可变）
			if (TOTAL > dataArr.length) TOTAL = dataArr.length;
			var ROW_H = opts.rowHeight || 28;
			var BUFFER = opts.buffer || 15;

			var cols = opts.columns || [];
			var editable = opts.editable !== false;
			var sortable = opts.sortable !== false;
			// serverSort：表头排序只改指示器 + 触发 onSortChange，不在客户端重排数据（由服务端 ORDER BY）
			var serverSort = opts.serverSort === true;
			var enableFilterRow = opts.filterRow === true; // 表头下筛选行（客户端）
			// 筛选行默认隐藏，点状态栏「筛选」才显示（filterRowVisible:true 可初始展开）
			var filterRowVisible = opts.filterRowVisible === true;
			var filterToggleBtn = null;
			var clicksToEdit = opts.clicksToEdit != null ? opts.clicksToEdit : 1;

			var getCell = function(r, c) { var f = cols[c].field; return dataArr[r] ? dataArr[r][f != null ? f : c] : ''; };
			var setCell = function(r, c, v) { if (dataArr[r]) { var f = cols[c].field; dataArr[r][f != null ? f : c] = v; if (api.onCellValueChange) api.onCellValueChange(r, c, v); } };
			var getCellStyle = opts.getCellStyle || function(r, c, v) { return ''; };
			var getCellClass = opts.getCellClass || function(r, c, v) { return ''; };
			var getRowClass = opts.getRowClass || function(r) { return ''; };

			var compareRows = opts.compareRows || null;
			var contextMenuItems = opts.contextMenu || null;
			var onContextMenuItem = opts.onContextMenu || null;

			var showToolbar = opts.toolbar !== false;
			var showStatusBar = opts.statusBar !== false;
			var toolbarText = opts.toolbarText || '';
			var statusBarText = opts.statusBarText || '';
			// 查询用时（ms）；null/undefined 不显示
			var elapsedMs = (opts.elapsedMs != null && opts.elapsedMs !== '')
				? opts.elapsedMs
				: (opts.elapsed_ms != null ? opts.elapsed_ms : null);
			var container = opts.container || null;

			// 多列排序：[{ col, dir, field }]；sortFld/sortDir 为兼容字段（首关键字）
			// sortIdx：视图位置 -> dataIdx；筛选和/或排序时启用
			var sortIdx = null, sortFld = -1, sortDir = 1;
			var sortKeys = [];
			var dataToVirtual = null; // dataIdx -> visual position
			var colFilterVals = []; // 每列筛选字符串
			// 列宽拖拽柄 mousedown 后抑制随后一次表头 click 排序（即使未拖动）
			var _suppressHeaderSortClick = false;
			var filterInps = []; // 筛选行 input 元素
			var filterRowEl = null;
			var _filterTimer = null;
			var globalSearch = ''; // 底部全列搜索
			var globalSearchInp = null;
			var selAnchor = null, selActive = null;
			var editState = null, _pendingEdit = null;
			// Tab/方向键跳格时：commit 会销毁 input 触发 blur，需抑制，否则会立刻提交新格
			var _suppressEditBlur = false;
			var iInitF;
			for (iInitF = 0; iInitF < cols.length; iInitF++) colFilterVals[iInitF] = '';

			// ─── 辅助函数 ───
			function getDisplayVal(dataIdx, colIdx) {
				var raw = getCell(dataIdx, colIdx);
				return cols[colIdx].fmt ? cols[colIdx].fmt(raw) : raw;
			}

			function _syncLegacySort() {
				if (sortKeys.length) {
					sortFld = sortKeys[0].col;
					sortDir = sortKeys[0].dir;
				} else {
					sortFld = -1;
					sortDir = 1;
				}
			}

			function _colField(colIdx) {
				if (colIdx < 0 || colIdx >= cols.length) return colIdx;
				var c = cols[colIdx];
				return c.field != null ? c.field : colIdx;
			}

			function _findSortKeyIdx(colIdx) {
				for (var i = 0; i < sortKeys.length; i++) {
					if (sortKeys[i].col === colIdx) return i;
				}
				return -1;
			}

			function _isSortableCol(colIdx) {
				if (colIdx < 0 || colIdx >= cols.length) return false;
				var c = cols[colIdx];
				if (!c) return false;
				if (c.sortable === false) return false;
				if (c.is_select || c.field === '__sel__') return false;
				return true;
			}

			/** 比较两行在指定列上的值；返回负/零/正（未乘方向） */
			function _cmpCells(a, b, f) {
				if (compareRows) return compareRows(a, b, f);
				var va = getCell(a, f), vb = getCell(b, f);
				if (va == null && vb == null) return 0;
				if (va == null || va === '') return 1;
				if (vb == null || vb === '') return -1;
				if (typeof va === 'number' && typeof vb === 'number') return va - vb;
				// 两端都像数字时按数值比
				var na = typeof va === 'number' ? va : parseFloat(va);
				var nb = typeof vb === 'number' ? vb : parseFloat(vb);
				if (!isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== ''
					&& /^-?\d+(\.\d+)?$/.test(String(va).trim()) && /^-?\d+(\.\d+)?$/.test(String(vb).trim())) {
					return na - nb;
				}
				return String(va).localeCompare(String(vb), 'zh');
			}

			/**
			 * 点击列头改排序。
			 * multi=false：单列排序（同列则切换正/倒序）
			 * multi=true（Ctrl/Meta）：在现有关键字上追加，或切换该列正/倒序
			 */
			function applyHeaderSort(colIdx, multi) {
				if (!sortable || !_isSortableCol(colIdx)) return false;
				var found = _findSortKeyIdx(colIdx);
				if (multi) {
					if (found >= 0) {
						sortKeys[found].dir = sortKeys[found].dir === 1 ? -1 : 1;
					} else {
						sortKeys.push({ col: colIdx, dir: 1, field: _colField(colIdx) });
					}
				} else {
					if (found >= 0 && sortKeys.length === 1) {
						sortKeys[0].dir = sortKeys[0].dir === 1 ? -1 : 1;
					} else {
						sortKeys = [{ col: colIdx, dir: 1, field: _colField(colIdx) }];
					}
				}
				_syncLegacySort();
				return true;
			}

			function clearSort() {
				sortKeys = [];
				_syncLegacySort();
				// 保留列筛选：重算视图
				updateSort();
			}

			function fireSortChange() {
				if (typeof opts.onSortChange === 'function') {
					try {
						var sortNow = null;
						if (typeof api !== 'undefined' && api && typeof api.getSort === 'function') {
							sortNow = api.getSort();
						} else if (!sortKeys.length) {
							sortNow = null;
						}
						// 第二个参数 isEmpty 便于外层明确「已取消排序」
						opts.onSortChange(sortNow, !sortKeys.length);
					} catch (eFire) { /* */ }
				}
			}

			/** 列重排后按 field 回写 col 下标 */
			function remapSortKeys() {
				if (!sortKeys.length) { _syncLegacySort(); return; }
				var next = [], i, j, k, idx, col;
				for (i = 0; i < sortKeys.length; i++) {
					k = sortKeys[i];
					idx = -1;
					for (j = 0; j < cols.length; j++) {
						col = cols[j];
						if (k.field != null && (col.field === k.field || col.name === k.field)) { idx = j; break; }
					}
					if (idx < 0 && k.col >= 0 && k.col < cols.length) idx = k.col;
					if (idx >= 0 && _isSortableCol(idx)) {
						next.push({ col: idx, dir: k.dir === -1 ? -1 : 1, field: _colField(idx) });
					}
				}
				sortKeys = next;
				_syncLegacySort();
			}

			function hasActiveColFilter() {
				var i, v;
				for (i = 0; i < colFilterVals.length; i++) {
					v = colFilterVals[i];
					if (v != null && String(v).trim() !== '') return true;
				}
				if (globalSearch != null && String(globalSearch).trim() !== '') return true;
				return false;
			}

			/** 解析列筛选表达式 → { neg, mode:'has'|'eq', q } 或 null */
			function parseFilterExpr(fv) {
				if (fv == null) return null;
				var q = String(fv).trim();
				if (!q) return null;
				var neg = false, mode = 'has';
				if (q.charAt(0) === '!' || (q.length >= 2 && q.charAt(0) === '<' && q.charAt(1) === '>')) {
					neg = true;
					q = q.charAt(0) === '!' ? q.slice(1).trim() : q.slice(2).trim();
				}
				if (q.charAt(0) === '=') {
					mode = 'eq';
					q = q.slice(1);
				}
				if (!q && mode !== 'eq') return null;
				return { neg: neg, mode: mode, q: q };
			}

			function cellMatchesExpr(s, expr) {
				if (!expr) return true;
				var hit;
				if (expr.mode === 'eq') hit = s.toLowerCase() === expr.q.toLowerCase();
				else hit = s.toLowerCase().indexOf(expr.q.toLowerCase()) >= 0;
				return expr.neg ? !hit : hit;
			}

			/**
			 * 列筛选 + 全列搜索匹配（客户端，不提交）：
			 * - 空：不过滤
			 * - 默认：包含（忽略大小写）
			 * - 以 = 开头：精确相等
			 * - 以 ! 或 <> 开头：不包含 / 不等于
			 * - 全列搜索：任一侧业务列包含关键字
			 */
			function rowMatchesColFilter(dataIdx) {
				var c, fv, raw, s, expr;
				for (c = 0; c < cols.length; c++) {
					fv = colFilterVals[c];
					expr = parseFilterExpr(fv);
					if (!expr) continue;
					if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
					raw = getCell(dataIdx, c);
					s = raw == null ? '' : String(raw);
					if (!cellMatchesExpr(s, expr)) return false;
				}
				// 全列搜索：任一业务列包含
				var gq = globalSearch != null ? String(globalSearch).trim() : '';
				if (gq) {
					var gLower = gq.toLowerCase(), any = false;
					for (c = 0; c < cols.length; c++) {
						if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
						raw = getCell(dataIdx, c);
						s = raw == null ? '' : String(raw);
						if (s.toLowerCase().indexOf(gLower) >= 0) { any = true; break; }
					}
					if (!any) return false;
				}
				return true;
			}

			/** 唯一值列表；达到 limit 个则返回 null（表示太多，不提供下拉） */
			function collectUniqueIfFew(colIdx, limit) {
				var seen = {}, list = [], r, v, s, n = dataArr.length;
				for (r = 0; r < n; r++) {
					v = getCell(r, colIdx);
					if (v == null || v === '') continue;
					s = String(v);
					if (seen[s]) continue;
					seen[s] = 1;
					list.push(s);
					if (list.length >= limit) return null;
				}
				return list;
			}

			function escHtml(s) {
				return String(s == null ? '' : s)
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;')
					.replace(/"/g, '&quot;');
			}

			/** 收集某列应高亮的关键词（正向匹配才高亮） */
			function highlightTermsForCol(colIdx) {
				var terms = [], expr, gq;
				if (colIdx >= 0 && colIdx < colFilterVals.length) {
					expr = parseFilterExpr(colFilterVals[colIdx]);
					if (expr && !expr.neg && expr.q) terms.push(expr.q);
				}
				gq = globalSearch != null ? String(globalSearch).trim() : '';
				if (gq) terms.push(gq);
				return terms;
			}

			/** 在纯文本中高亮多个关键词（忽略大小写），返回 HTML */
			function highlightTextHtml(text, terms) {
				var s = text == null ? '' : String(text);
				if (!terms || !terms.length || s === '') return escHtml(s);
				// 合并去重，按长度降序避免短词抢先
				var uniq = [], seen = {}, i, t, reParts = [], re, out, last, m;
				for (i = 0; i < terms.length; i++) {
					t = String(terms[i]);
					if (!t || seen[t.toLowerCase()]) continue;
					seen[t.toLowerCase()] = 1;
					uniq.push(t);
				}
				if (!uniq.length) return escHtml(s);
				uniq.sort(function(a, b) { return b.length - a.length; });
				for (i = 0; i < uniq.length; i++) {
					reParts.push(uniq[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
				}
				try {
					re = new RegExp('(' + reParts.join('|') + ')', 'gi');
				} catch (err) {
					return escHtml(s);
				}
				out = '';
				last = 0;
				while ((m = re.exec(s)) !== null) {
					out += escHtml(s.slice(last, m.index));
					out += '<mark class="xvr-hl">' + escHtml(m[0]) + '</mark>';
					last = m.index + m[0].length;
					if (m[0].length === 0) { re.lastIndex++; if (re.lastIndex > s.length) break; }
				}
				out += escHtml(s.slice(last));
				return out;
			}

			function fillCellDisplay(span, dataIdx, colIdx) {
				var col = cols[colIdx];
				var val = getCell(dataIdx, colIdx);
				if (col.render) {
					var node = col.render(val, dataArr[dataIdx], null);
					if (node && node.nodeType) span.appendChild(node);
					return;
				}
				var text = getDisplayVal(dataIdx, colIdx);
				// 自定义 fmt 可能已是 HTML，不做高亮
				if (col.fmt) {
					span.innerHTML = text == null ? '' : String(text);
					return;
				}
				var terms = highlightTermsForCol(colIdx);
				if (terms.length && hasActiveColFilter()) {
					span.innerHTML = highlightTextHtml(text, terms);
				} else {
					span.textContent = text == null ? '' : String(text);
				}
			}

			function updateSort() {
				_syncLegacySort();
				var srcLen = dataArr.length;
				var hasF = hasActiveColFilter();
				// serverSort 时数据顺序由服务端保证，客户端只做列筛选
				var hasS = !!(sortable && sortKeys.length && !serverSort);
				var base = [];
				var i;
				for (i = 0; i < srcLen; i++) {
					if (!hasF || rowMatchesColFilter(i)) base.push(i);
				}
				if (hasS) {
					var keys = sortKeys;
					base.sort(function(a, b) {
						var k, cmp, d;
						for (k = 0; k < keys.length; k++) {
							d = keys[k].dir;
							cmp = _cmpCells(a, b, keys[k].col);
							if (cmp !== 0) return d * cmp;
						}
						return a - b;
					});
				}
				if (!hasS && !hasF) {
					sortIdx = null;
					dataToVirtual = null;
					TOTAL = srcLen;
				} else {
					sortIdx = base;
					TOTAL = base.length;
					dataToVirtual = new Array(srcLen);
					for (var j = 0; j < base.length; j++) dataToVirtual[base[j]] = j;
				}
				// 虚拟滚动高度
				if (typeof body !== 'undefined' && body && body.style) {
					body.style.height = (TOTAL * ROW_H) + 'px';
				}
			}

			function runSortUI() {
				updateHeaderSort();
				// 服务端排序：立即通知外层拉数，本地仅保留表头标记与列筛选视图
				if (serverSort) {
					updateSort(); // 仅列筛选，不按 sortKeys 排数据
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
					return;
				}
				if (typeof showLoading === 'function') showLoading();
				setTimeout(function() {
					updateSort();
					if (typeof hideLoading === 'function') hideLoading();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
				}, 10);
			}

			function applyColFiltersFromInputs(immediate) {
				function go() {
					var i;
					for (i = 0; i < filterInps.length; i++) {
						if (filterInps[i] && filterInps[i].tagName === 'INPUT') {
							colFilterVals[i] = filterInps[i].value;
						}
					}
					updateSort();
					_lastST = -2;
					render();
					updateStatus();
					if (filterRowEl) {
						if (hasActiveColFilter()) filterRowEl.classList.add('has-filter');
						else filterRowEl.classList.remove('has-filter');
					}
					if (typeof syncFilterToggleBtn === 'function') syncFilterToggleBtn();
				}
				if (immediate) {
					if (_filterTimer) { clearTimeout(_filterTimer); _filterTimer = null; }
					go();
				} else {
					if (_filterTimer) clearTimeout(_filterTimer);
					_filterTimer = setTimeout(function() { _filterTimer = null; go(); }, 120);
				}
			}

			function clearAllColFilters() {
				var i;
				for (i = 0; i < colFilterVals.length; i++) colFilterVals[i] = '';
				for (i = 0; i < filterInps.length; i++) {
					if (filterInps[i] && filterInps[i].tagName === 'INPUT') filterInps[i].value = '';
				}
				// 清除列筛选时一并清除底部全表搜索
				globalSearch = '';
				if (globalSearchInp) globalSearchInp.value = '';
				applyColFiltersFromInputs(true);
			}

			function setGlobalSearch(q, immediate) {
				globalSearch = q == null ? '' : String(q);
				if (globalSearchInp && globalSearchInp.value !== globalSearch) {
					globalSearchInp.value = globalSearch;
				}
				if (immediate === false) {
					if (_filterTimer) clearTimeout(_filterTimer);
					_filterTimer = setTimeout(function() {
						_filterTimer = null;
						updateSort();
						_lastST = -2;
						render();
						updateStatus();
					}, 120);
				} else {
					if (_filterTimer) { clearTimeout(_filterTimer); _filterTimer = null; }
					updateSort();
					_lastST = -2;
					render();
					updateStatus();
				}
			}

			function clearGlobalSearch() {
				setGlobalSearch('', true);
			}

			function getDataIdx(vPos) { return sortIdx ? sortIdx[vPos] : vPos; }

			function getVirtualPos(dataIdx) {
				if (!sortIdx) return dataIdx;
				if (dataToVirtual && dataIdx >= 0 && dataIdx < dataToVirtual.length) {
					var vp = dataToVirtual[dataIdx];
					return vp != null ? vp : -1;
				}
				// 回退线性查找
				for (var i = 0; i < TOTAL; i++) {
					if (sortIdx[i] === dataIdx) return i;
				}
				return -1;
			}

			function inSelection(d, c) {
				if (!selAnchor || !selActive) return false;
				// 按屏幕行序判断选区矩形（排序后 dataIdx 大小与视觉上下无关）
				var vpA = getVirtualPos(selAnchor.d), vpB = getVirtualPos(selActive.d);
				if (vpA < 0) vpA = selAnchor.d;
				if (vpB < 0) vpB = selActive.d;
				var minVP = Math.min(vpA, vpB), maxVP = Math.max(vpA, vpB);
				var vp = getVirtualPos(d);
				if (vp < 0) vp = d;
				var minC = Math.min(selAnchor.c, selActive.c);
				var maxC = Math.max(selAnchor.c, selActive.c);
				return vp >= minVP && vp <= maxVP && c >= minC && c <= maxC;
			}

			function isActiveCell(d, c) { return selActive && selActive.d === d && selActive.c === c; }

			function moveSelection(rowDir, colDir, extend) {
				if (editState) return;
				if (!selActive) {
					selAnchor = { d: 0, c: _firstEditableCol() };
					selActive = { d: 0, c: _firstEditableCol() };
					_ensureVisible(0); render(); return;
				}
				var vPos = getVirtualPos(selActive.d);
				var newD = selActive.d, newC = selActive.c + colDir;
				if (colDir !== 0) {
					if (newC >= cols.length) {
						var nvp = vPos + 1;
						if (nvp >= TOTAL) return;
						newD = getDataIdx(nvp);
						newC = 1;
					} else if (newC < 0) {
						var nvp = vPos - 1;
						if (nvp < 0) return;
						newD = getDataIdx(nvp);
						newC = cols.length - 1;
					} else if (newC <= 0) {
						newC = 1;
					}
				} else {
					newC = selActive.c;
					var newVP = vPos + rowDir;
					if (newVP < 0 || newVP >= TOTAL) return;
					newD = getDataIdx(newVP);
				}
				if (extend) { selActive = { d: newD, c: newC }; }
				else { selAnchor = { d: newD, c: newC }; selActive = { d: newD, c: newC }; }
				_ensureVisible(getVirtualPos(newD));
				_renderSelection();
			}

			function _firstEditableCol() {
				for (var i = 1; i < cols.length; i++) { if (cols[i].editable !== false) return i; }
				return cols.length - 1;
			}

			function _ensureVisible(vPos) {
				var st = sc.scrollTop, vh = sc.clientHeight, top = vPos * ROW_H;
				if (top < st || top + ROW_H > st + vh) { sc.scrollTop = top - Math.floor(vh / 4); }
			}

			// ─── DOM 构建 ───
			var el = document.createElement('div');
			el.className = 'xvr-root';
			el.style.cssText = 'overflow:hidden;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;width:100%;';
			var _totalColW = 0;
			for (var _tw = 0; _tw < cols.length; _tw++) _totalColW += (cols[_tw].w || 80);
			if (_totalColW < 100) _totalColW = 100;

			// ─── 工具栏 ───
			if (showToolbar) {
				var tbar = document.createElement('div');
				tbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:4px 10px;background:var(--x-panel-hd-bg);border-bottom:1px solid var(--x-border);flex-shrink:0;';
				tbar.innerHTML = toolbarText ||
					'<span style="font-weight:bold;color:var(--x-text);font-size:var(--x-font-size)">▦ 虚拟滚动表格</span>' +
					'<span style="color:var(--x-text-muted);font-size:var(--x-font-size-sm)">总行数: ' + TOTAL.toLocaleString() + ' | 行高: ' + ROW_H + 'px</span>' +
					'<span style="margin-left:auto;font-size:var(--x-font-size-sm);color:var(--x-text-muted)">' +
					'拖动选区 | 点击编辑 | Ctrl+C/V 复制粘贴 | ←↑→↓ 导航</span>';
				el.appendChild(tbar);
			}

			// ─── 表头 ───
			var hdr = document.createElement('div');
			hdr.className = 'xvr-hdr';
			hdr.style.cssText = 'display:flex;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;';
			var hdrWrap = document.createElement('div');
			hdrWrap.className = 'xvr-hdr-wrap';
			hdrWrap.style.cssText = 'width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;will-change:transform;';
			var colEls = [];

			for (var ci = 0; ci < cols.length; ci++) {
				var col = cols[ci];
				var d = document.createElement('div');
				d._col = col;
				d.className = 'xvr-th' + (_isSortableCol(ci) ? ' is-sortable' : '');
				// overflow 交给内部 label；悬停操作钮需可见
				d.style.cssText = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left') + ';flex-shrink:0;padding:4px 6px;cursor:pointer;font-weight:bold;font-size:var(--x-font-size);border-right:1px solid var(--x-border);user-select:none;overflow:visible;white-space:nowrap;line-height:' + (ROW_H - 8) + 'px;';
				(function(el) {
					function getColIdx() {
						return colEls.indexOf(el);
					}
					d.onmouseenter = function () {
						var idx = getColIdx();
						showHeaderFloatActs(idx, el);
					};
					d.onmouseleave = function () {
						scheduleHideHeaderFloatActs();
					};
					d.onclick = function(e) {
						// 列宽拖拽柄：即使未拖动也不排序
						if (_suppressHeaderSortClick) {
							_suppressHeaderSortClick = false;
							return;
						}
						if (_dragWasDragged) { _dragWasDragged = false; return; }
						// 点在 resizer / Adminer 风格操作钮上忽略整格排序
						var tg = e && e.target;
						if (tg && tg.classList && tg.classList.contains('xvr-col-resizer')) return;
						if (tg && tg.closest && tg.closest('.xvr-col-resizer')) return;
						if (tg && tg.classList && tg.classList.contains('xvr-th-act')) return;
						if (tg && tg.closest && tg.closest('.xvr-th-act')) return;
						if (editState) commitEdit();
						if (!sortable) return;
						var idx = getColIdx();
						if (idx < 0) return;
						// Ctrl/Meta+点击：追加/切换该列；普通点击：单列排序
						var multi = !!(e && (e.ctrlKey || e.metaKey));
						if (multi) e.preventDefault();
						if (!applyHeaderSort(idx, multi)) return;
						runSortUI();
					};
					d.oncontextmenu = function(e) {
						e.preventDefault();
						if (!sortable) return;
						var idx = getColIdx();
						if (idx < 0 || !_isSortableCol(idx)) return;
						var sk = _findSortKeyIdx(idx);
						var curDir = sk >= 0 ? sortKeys[sk].dir : 0;
						var menu = X.mk({xtype:'menu',contextMenu:true,menu:[
							{text:'\u6B63\u5E8F \u25B2',act:curDir===1,handler:function(){
								if (editState) commitEdit();
								sortKeys = [{ col: idx, dir: 1, field: _colField(idx) }];
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u5012\u5E8F \u25BC',act:curDir===-1,handler:function(){
								if (editState) commitEdit();
								sortKeys = [{ col: idx, dir: -1, field: _colField(idx) }];
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u8FFD\u52A0\u6B63\u5E8F (Ctrl)',handler:function(){
								if (editState) commitEdit();
								var f=_findSortKeyIdx(idx);
								if(f>=0){ sortKeys[f].dir=1; } else { sortKeys.push({col:idx,dir:1,field:_colField(idx)}); }
								_syncLegacySort();
								runSortUI();
							}},
							{text:'\u8FFD\u52A0\u5012\u5E8F (Ctrl)',handler:function(){
								if (editState) commitEdit();
								var f=_findSortKeyIdx(idx);
								if(f>=0){ sortKeys[f].dir=-1; } else { sortKeys.push({col:idx,dir:-1,field:_colField(idx)}); }
								_syncLegacySort();
								runSortUI();
							}},
							'-',
							{text:'\u53D6\u6D88\u6392\u5E8F',handler:function(){
								if (editState) commitEdit();
								// 走 api.clearSort，保证 UI + fireSortChange 一致
								if (typeof api !== 'undefined' && api && typeof api.clearSort === 'function') {
									api.clearSort();
								} else {
									clearSort();
									updateHeaderSort();
									_lastST = -2; render(); updateStatus();
									fireSortChange();
								}
							}},
							{text:'\u6E05\u9664\u5217\u7B5B\u9009',handler:function(){
								if (editState) commitEdit();
								clearAllColFilters();
							}},
						]});
						menu.showAt(e.clientX, e.clientY);
					};
				})(d);
				hdr.appendChild(d);
				colEls.push(d);
				// 列宽拖拽柄（列间边缘）；点击/拖拽均不得触发表头排序
				(function(cellEl, colIndex){
					cellEl.style.position = 'relative';
					var hz = document.createElement('div');
					hz.className = 'xvr-col-resizer';
					hz.title = '拖拽调整列宽';
					hz.onmousedown = function(e){
						e.preventDefault();
						e.stopPropagation();
						// 标记：随后 mouseup/click 即使未拖动也不排序
						_suppressHeaderSortClick = true;
						var startX = e.clientX;
						var startW = cols[colIndex].w || 80;
						document.body.style.cursor = 'col-resize';
						document.body.style.userSelect = 'none';
						function onMove(ev){
							var nw = startW + (ev.clientX - startX);
							if (nw < 40) nw = 40;
							if (nw > 480) nw = 480;
							setColumnWidth(colIndex, nw);
						}
						function onUp(){
							document.removeEventListener('mousemove', onMove);
							document.removeEventListener('mouseup', onUp);
							document.body.style.cursor = '';
							document.body.style.userSelect = '';
							// 无 click 时（移出后松开）延迟清标记，避免误伤下一次真实排序点击
							setTimeout(function () {
								_suppressHeaderSortClick = false;
							}, 80);
						}
						document.addEventListener('mousemove', onMove);
						document.addEventListener('mouseup', onUp);
					};
					// 阻止 resizer 上的 click 冒泡到表头
					hz.onclick = function (e) {
						e.preventDefault();
						e.stopPropagation();
						_suppressHeaderSortClick = false;
					};
					// 双击等也不要冒泡
					hz.ondblclick = function (e) {
						e.preventDefault();
						e.stopPropagation();
					};
					cellEl.appendChild(hz);
				})(d, ci);
			}
			hdrWrap.appendChild(hdr);

			// ─── 列筛选行（客户端即时过滤，不提交服务端） ───
			if (enableFilterRow) {
				filterRowEl = document.createElement('div');
				filterRowEl.className = 'xvr-filter-row';
				filterRowEl.style.cssText = 'display:flex;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;background:var(--x-panel-hd-bg,#f8fafc);border-bottom:1px solid var(--x-border,#e2e8f0);';
				for (var fi = 0; fi < cols.length; fi++) {
					(function(colIdx) {
						var cell = document.createElement('div');
						cell.className = 'xvr-filter-cell';
						cell.style.cssText = 'width:' + (cols[colIdx].w || 80) + 'px;min-width:' + (cols[colIdx].w || 80) + 'px;flex-shrink:0;box-sizing:border-box;padding:2px 3px;border-right:1px solid var(--x-border,#e2e8f0);';
						if (cols[colIdx] && (cols[colIdx].is_select || cols[colIdx].field === '__sel__')) {
							var clr = document.createElement('button');
							clr.type = 'button';
							clr.className = 'xvr-filter-clear';
							clr.title = vgT('grid.colFilterClear', '清除全部列筛选');
							clr.innerHTML = '<i class="fa-solid fa-filter-circle-xmark"></i>';
							clr.onclick = function(e) {
								if (e) { e.preventDefault(); e.stopPropagation(); }
								clearAllColFilters();
							};
							cell.appendChild(clr);
							filterInps[colIdx] = clr;
						} else {
							var inp = document.createElement('input');
							inp.type = 'text';
							inp.className = 'xvr-filter-inp';
							inp.placeholder = vgT('grid.colFilterPh', '筛选…');
							inp.title = vgT('grid.colFilterPh', '筛选…');
							inp.autocomplete = 'off';
							inp.spellcheck = false;
							inp.onmousedown = function(e) { e.stopPropagation(); };
							inp.onclick = function(e) { e.stopPropagation(); };
							inp.onkeydown = function(e) {
								e.stopPropagation();
								if (e.key === 'Escape') {
									inp.value = '';
									applyColFiltersFromInputs(true);
									inp.blur();
								} else if (e.key === 'Enter') {
									applyColFiltersFromInputs(true);
								} else if (e.ctrlKey && (e.key === 'Backspace' || e.keyCode === 8)) {
									e.preventDefault();
									inp.value = '';
									applyColFiltersFromInputs(true);
								}
							};
							inp.oninput = function() { applyColFiltersFromInputs(false); };
							// 下拉仅当唯一值少于 10 个
							var uniques = collectUniqueIfFew(colIdx, 10);
							if (uniques && uniques.length > 0) {
								var listId = 'xvr-fl-' + colIdx + '-' + Math.random().toString(36).slice(2, 8);
								inp.setAttribute('list', listId);
								var dl = document.createElement('datalist');
								dl.id = listId;
								var ui, opt;
								for (ui = 0; ui < uniques.length; ui++) {
									opt = document.createElement('option');
									opt.value = uniques[ui];
									dl.appendChild(opt);
								}
								cell.appendChild(inp);
								cell.appendChild(dl);
							} else {
								cell.appendChild(inp);
							}
							filterInps[colIdx] = inp;
						}
						filterRowEl.appendChild(cell);
					})(fi);
				}
				// 默认折叠筛选行
				filterRowEl.style.display = filterRowVisible ? 'flex' : 'none';
				hdrWrap.appendChild(filterRowEl);
			}

			function syncFilterToggleBtn() {
				if (!filterToggleBtn) return;
				if (filterRowVisible) filterToggleBtn.classList.add('is-on');
				else filterToggleBtn.classList.remove('is-on');
				var hasF = hasActiveColFilter();
				filterToggleBtn.title = filterRowVisible
					? (hasF ? vgT('grid.filterHideActive', '隐藏筛选行（当前有筛选条件）')
						: vgT('grid.filterHide', '隐藏筛选行'))
					: (hasF ? vgT('grid.filterShowActive', '显示筛选行（当前有筛选条件）')
						: vgT('grid.filterShow', '显示筛选行'));
				if (hasF) filterToggleBtn.classList.add('has-filter');
				else filterToggleBtn.classList.remove('has-filter');
			}

			/** 仅清除列筛选（不影响底栏全列搜索） */
			function clearColFiltersOnly() {
				var i;
				for (i = 0; i < colFilterVals.length; i++) colFilterVals[i] = '';
				for (i = 0; i < filterInps.length; i++) {
					if (filterInps[i] && filterInps[i].tagName === 'INPUT') filterInps[i].value = '';
				}
				applyColFiltersFromInputs(true);
			}

			function setFilterRowVisible(on) {
				var next = !!on;
				var wasOn = filterRowVisible;
				filterRowVisible = next;
				if (filterRowEl) {
					filterRowEl.style.display = filterRowVisible ? 'flex' : 'none';
				}
				// 关闭筛选行时取消所有列筛选
				if (wasOn && !filterRowVisible) {
					clearColFiltersOnly();
				} else {
					syncFilterToggleBtn();
				}
				// 展开后同步列宽
				if (filterRowVisible && filterRowEl) {
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
			}

			// 表头区域（含筛选行）挂到 root；body 滚动与 translateX 同步
			// （原逻辑曾直接 append hdrWrap，现统一走 clip）

			// ─── 列头拖拽排序 ───
			var _dragCol = null, _dragStartX = 0, _dragStartY = 0, _dragStartIdx = -1, _dragIndicator = null, _dragProxy = null, _dragWasDragged = false;
			function _initColDrag(){
				if(_dragIndicator)return;
				_dragIndicator=document.createElement('div');
				_dragIndicator.style.cssText='position:absolute;top:0;bottom:0;width:1px;background:#1a73e8;z-index:999;display:none;pointer-events:none;';
				hdrWrap.appendChild(_dragIndicator);
				_dragProxy=document.createElement('div');
				_dragProxy.style.cssText='position:fixed;display:none;pointer-events:none;z-index:10000;background:var(--x-menu-bg,#fff);border:1px solid var(--x-border,#ccc);border-radius:4px;padding:4px 10px;font-size:var(--x-font-size,13px);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.15);align-items:center;gap:6px;';
				document.body.appendChild(_dragProxy);
			}
			function _getInsertIdx(x){
				for(var i=0;i<colEls.length;i++){
					if (_dragCol && colEls[i] === _dragCol) continue;
					var r=colEls[i].getBoundingClientRect();
					if(x<r.left+r.width/2)return i;
				}
				return colEls.length;
			}
			function _isInHdr(y){
				var r=hdrWrap.getBoundingClientRect();
				return y>=r.top&&y<r.bottom;
			}
			function _showIndicator(x){
				var idx=_getInsertIdx(x);
				if(idx>=colEls.length){
					var last=colEls[colEls.length-1].getBoundingClientRect();
					_dragIndicator.style.left=(last.right-hdrWrap.getBoundingClientRect().left)+'px';
				}else{
					_dragIndicator.style.left=(colEls[idx].getBoundingClientRect().left-hdrWrap.getBoundingClientRect().left)+'px';
				}
				_dragIndicator.style.display='block';
			}
			function _syncColOrder() {
				var newCols = [];
				var newColEls = [];
				var oldCols = cols.slice();
				var oldFilterVals = colFilterVals.slice();
				var oldFilterInps = filterInps.slice();
				var i, el, oldIdx, newFilterInps = [], newFilterVals = [];
				for (i = 0; i < hdr.children.length; i++) {
					el = hdr.children[i];
					if (el && el._col) {
						newCols.push(el._col);
						newColEls.push(el);
						oldIdx = oldCols.indexOf(el._col);
						if (oldIdx < 0) oldIdx = i;
						newFilterVals.push(oldFilterVals[oldIdx] != null ? oldFilterVals[oldIdx] : '');
						newFilterInps.push(oldFilterInps[oldIdx] || null);
					}
				}
				cols = newCols;
				colEls = newColEls;
				colFilterVals = newFilterVals;
				filterInps = newFilterInps;
				// 同步筛选行 DOM 顺序
				if (filterRowEl) {
					for (i = 0; i < filterInps.length; i++) {
						if (filterInps[i] && filterInps[i].parentNode) {
							filterRowEl.appendChild(filterInps[i].parentNode);
						}
					}
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
			}
			_initColDrag();
			for(var ci=0;ci<colEls.length;ci++){
				(function(el){
					function getColIdx() {
						return colEls.indexOf(el);
					}
					el.addEventListener('mousedown',function(e){
						if(e.button!==0)return;
						_dragWasDragged=false;
						_dragCol=el;
						_dragStartX=e.clientX;
						_dragStartY=e.clientY;
						_dragStartIdx=getColIdx();
						document.addEventListener('mousemove',_onColDragMove);
						document.addEventListener('mouseup',_onColDragUp);
					});
				})(colEls[ci]);
			}
			function _onColDragMove(e){
				if(Math.abs(e.clientX-_dragStartX)<8)return;
				_dragWasDragged=true;
				if(!_dragCol.classList.contains('xvr-hdr-dragging')){
					_dragCol.classList.add('xvr-hdr-dragging');
					_dragCol.style.opacity='0.5';
				}
				_dragProxy.style.display='flex';
				_dragProxy.style.left=(e.clientX+12)+'px';
				_dragProxy.style.top=(e.clientY+12)+'px';
				if(_isInHdr(e.clientY)){
					_dragProxy.innerHTML='<i class="fa-solid fa-check" style="color:#107c10"></i><span>'+cols[_dragStartIdx].t+'</span>';
					_showIndicator(e.clientX);
				}else{
					_dragProxy.innerHTML='<i class="fa-solid fa-xmark" style="color:#e81123"></i><span>'+cols[_dragStartIdx].t+'</span>';
					_dragIndicator.style.display='none';
				}
			}
			function _onColDragUp(e){
				document.removeEventListener('mousemove',_onColDragMove);
				document.removeEventListener('mouseup',_onColDragUp);
				if(_dragIndicator)_dragIndicator.style.display='none';
				if(_dragProxy)_dragProxy.style.display='none';
				if(_dragCol){
					_dragCol.classList.remove('xvr-hdr-dragging');
					_dragCol.style.opacity='';
				}
				if(_dragWasDragged&&_isInHdr(e.clientY)&&Math.abs(e.clientX-_dragStartX)>=8){
					var toIdx=_getInsertIdx(e.clientX);
					if(toIdx!==_dragStartIdx){
						var col=cols[_dragStartIdx];
						var cel=colEls[_dragStartIdx];
						hdr.insertBefore(cel, hdr.children[toIdx] || null);
						_syncColOrder();
						remapSortKeys();
						updateSort();
						_lastST=-2;render();
						updateStatus();
					}
				}
				_dragCol=null;
			}

			// Adminer 风格列头操作：fixed 浮层挂到 body，避免被 overflow:hidden 裁切
			var floatActs = null;
			var floatActsCol = -1;
			var floatActsCell = null;
			var floatHideTimer = null;

			function hideHeaderFloatActs() {
				if (floatHideTimer) {
					clearTimeout(floatHideTimer);
					floatHideTimer = null;
				}
				if (floatActs) floatActs.style.display = 'none';
				floatActsCol = -1;
				floatActsCell = null;
			}

			function scheduleHideHeaderFloatActs() {
				if (floatHideTimer) clearTimeout(floatHideTimer);
				floatHideTimer = setTimeout(hideHeaderFloatActs, 120);
			}

			function ensureHeaderFloatActs() {
				if (floatActs) return floatActs;
				floatActs = document.createElement('span');
				floatActs.className = 'xvr-th-acts xvr-th-acts-float';
				floatActs.style.display = 'none';
				var aDesc = document.createElement('a');
				aDesc.href = 'javascript:void(0)';
				aDesc.className = 'xvr-th-act xvr-th-act-desc';
				aDesc.title = vgT('table.headerSortDesc', '倒序');
				aDesc.textContent = '\u2193';
				aDesc.onclick = function (ev) {
					if (ev) {
						ev.preventDefault();
						ev.stopPropagation();
					}
					var idx = floatActsCol;
					hideHeaderFloatActs();
					if (editState) commitEdit();
					if (!sortable || idx < 0 || !_isSortableCol(idx)) return;
					sortKeys = [{ col: idx, dir: -1, field: _colField(idx) }];
					_syncLegacySort();
					runSortUI();
				};
				var aWhere = document.createElement('a');
				aWhere.href = 'javascript:void(0)';
				aWhere.className = 'xvr-th-act xvr-th-act-where';
				aWhere.title = vgT('table.headerWhere', '筛选到 WHERE');
				aWhere.textContent = '=';
				aWhere.onclick = function (ev) {
					if (ev) {
						ev.preventDefault();
						ev.stopPropagation();
					}
					var idx = floatActsCol;
					hideHeaderFloatActs();
					if (idx < 0) return;
					if (typeof opts.onHeaderWhere === 'function') {
						opts.onHeaderWhere(idx, cols[idx]);
					}
				};
				floatActs.appendChild(aDesc);
				floatActs.appendChild(aWhere);
				floatActs.onmouseenter = function () {
					if (floatHideTimer) {
						clearTimeout(floatHideTimer);
						floatHideTimer = null;
					}
				};
				floatActs.onmouseleave = function () {
					scheduleHideHeaderFloatActs();
				};
				document.body.appendChild(floatActs);
				return floatActs;
			}

			function positionHeaderFloatActs() {
				if (!floatActs || !floatActsCell || floatActs.style.display === 'none') return;
				var rect = floatActsCell.getBoundingClientRect();
				floatActs.style.left = (rect.left + rect.width / 2) + 'px';
				floatActs.style.top = rect.top + 'px';
			}

			function showHeaderFloatActs(colIdx, cellEl) {
				if (floatHideTimer) {
					clearTimeout(floatHideTimer);
					floatHideTimer = null;
				}
				if (!sortable || !_isSortableCol(colIdx) || !cellEl) {
					hideHeaderFloatActs();
					return;
				}
				ensureHeaderFloatActs();
				floatActsCol = colIdx;
				floatActsCell = cellEl;
				floatActs.style.display = 'inline-block';
				positionHeaderFloatActs();
			}

			function updateHeaderSort() {
				var i, j, cell, resizer, ch, next, mark, sk, titleBase, nameEl, markEl, labelEl, canAct;
				for (i = 0; i < colEls.length; i++) {
					mark = '';
					for (j = 0; j < sortKeys.length; j++) {
						if (sortKeys[j].col === i) {
							// 多列时加优先级序号：▲1 ▼2
							sk = sortKeys[j].dir === 1 ? ' ▲' : ' ▼';
							if (sortKeys.length > 1) sk += String(j + 1);
							mark = sk;
							break;
						}
					}
					titleBase = cols[i].t != null ? String(cols[i].t) : '';
					canAct = sortable && _isSortableCol(i);
					if (canAct) {
						if (mark) {
							colEls[i].title = titleBase + ' · 排序优先级 ' + (j + 1)
								+ (sortKeys[j].dir === 1 ? ' 正序' : ' 倒序')
								+ '（点击切换；悬停：倒序 / 筛选）';
						} else {
							colEls[i].title = titleBase + ' · 点击排序；悬停可倒序或填入 WHERE';
						}
					} else {
						colEls[i].title = titleBase;
					}
					cell = colEls[i];
					if (canAct) cell.classList.add('is-sortable');
					else cell.classList.remove('is-sortable');
					resizer = cell.querySelector('.xvr-col-resizer');
					ch = cell.firstChild;
					while (ch) {
						next = ch.nextSibling;
						if (!(ch.nodeType === 1 && ch.classList && ch.classList.contains('xvr-col-resizer'))) {
							cell.removeChild(ch);
						}
						ch = next;
					}
					labelEl = document.createElement('span');
					labelEl.className = 'xvr-th-label';
					nameEl = document.createElement('span');
					nameEl.className = 'xvr-th-name';
					nameEl.textContent = titleBase;
					labelEl.appendChild(nameEl);
					if (mark) {
						markEl = document.createElement('span');
						markEl.className = 'xvr-th-mark';
						markEl.textContent = mark;
						labelEl.appendChild(markEl);
					}
					if (resizer) cell.insertBefore(labelEl, resizer);
					else cell.appendChild(labelEl);
				}
				// 排序刷新后若浮层仍开着，跟住列头
				positionHeaderFloatActs();
			}
			_syncColOrder();
			updateHeaderSort();

			// ─── 表头裁剪层 + 表体滚动；横向 translateX 同步 ───
			var hdrClip = document.createElement('div');
			hdrClip.className = 'xvr-hdr-clip';
			hdrClip.style.cssText = 'flex-shrink:0;overflow:hidden;position:relative;width:100%;';
			hdrClip.appendChild(hdrWrap);
			el.appendChild(hdrClip);

			var sc = document.createElement('div');
			sc.className = 'xvr-sc';
			sc.tabIndex = -1;
			sc.style.cssText = 'flex:1;min-height:0;overflow:auto;position:relative;width:100%;';
			el.appendChild(sc);

			var body = document.createElement('div');
			body.className = 'xvr-body';
			body.style.cssText = 'position:relative;height:' + (TOTAL * ROW_H) + 'px;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;';
			sc.appendChild(body);

			var surface = document.createElement('div');
			surface.style.cssText = 'position:absolute;left:0;top:0;width:' + _totalColW + 'px;min-width:' + _totalColW + 'px;will-change:top;';
			body.appendChild(surface);

			function _syncHdrScroll() {
				hideHeaderFloatActs();
				hdrWrap.style.transform = 'translateX(' + (-sc.scrollLeft) + 'px)';
				var sbw = sc.offsetWidth - sc.clientWidth;
				if (sbw < 0) sbw = 0;
				hdrClip.style.paddingRight = sbw + 'px';
			}
			sc.addEventListener('scroll', _syncHdrScroll, false);
			setTimeout(_syncHdrScroll, 0);

			function setColumnWidth(idx, w) {
				if (idx < 0 || idx >= cols.length) return;
				w = Math.round(w);
				if (w < 40) w = 40;
				if (w > 480) w = 480;
				cols[idx].w = w;
				_totalColW = 0;
				var i;
				for (i = 0; i < cols.length; i++) _totalColW += (cols[i].w || 80);
				if (_totalColW < 100) _totalColW = 100;
				// 更新表头
				if (colEls[idx]) {
					colEls[idx].style.width = w + 'px';
					colEls[idx].style.minWidth = w + 'px';
				}
				// 更新筛选格
				if (filterInps[idx] && filterInps[idx].parentNode) {
					filterInps[idx].parentNode.style.width = w + 'px';
					filterInps[idx].parentNode.style.minWidth = w + 'px';
				}
				hdr.style.width = _totalColW + 'px';
				hdr.style.minWidth = _totalColW + 'px';
				hdrWrap.style.width = _totalColW + 'px';
				hdrWrap.style.minWidth = _totalColW + 'px';
				if (filterRowEl) {
					filterRowEl.style.width = _totalColW + 'px';
					filterRowEl.style.minWidth = _totalColW + 'px';
				}
				if (typeof body !== 'undefined' && body) {
					body.style.width = _totalColW + 'px';
					body.style.minWidth = _totalColW + 'px';
				}
				surface.style.width = _totalColW + 'px';
				surface.style.minWidth = _totalColW + 'px';
				_lastST = -2;
				render();
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			}


			var loadingEl = document.createElement('div');
			loadingEl.className = 'xvr-load';
			loadingEl.textContent = '排序中...';
			sc.appendChild(loadingEl);

			function showLoading() { loadingEl.style.display = 'flex'; }
			function hideLoading() { loadingEl.style.display = 'none'; }

			// ─── 右键菜单 ───
			var ctxMenu = null;
			if (contextMenuItems && contextMenuItems.length) {
				function _wrapCtxItems(items){
					var out=[];
					for(var ci=0;ci<items.length;ci++){
						var it=items[ci];
						if(it==='-'){
							out.push('-');
						}else if(typeof it==='string'){
							(function(txt){
								out.push({text:txt,handler:function(v,dom){
									if(onContextMenuItem) onContextMenuItem(v,dom);
								}});
							})(it);
						}else if(it.menu){
							out.push({text:it.text,icon:it.icon,menu:_wrapCtxItems(it.menu)});
						}else{
							out.push(it);
						}
					}
					return out;
				}
				ctxMenu = X.mk({xtype:'menu',contextMenu:true,menu:_wrapCtxItems(contextMenuItems)});
				el.appendChild(ctxMenu.el);
				sc.oncontextmenu = function(e) { e.preventDefault(); };
			}

			// ─── 状态栏：左统计（共N行+显示行+用时…）→ 全列搜索 →（弹性空白）→ 扩展槽/导出 ───
			var sb = null, sbL = null, sbTextEl = null, sbR = null, sbSearch = null, sbExtra = null;
			if (showStatusBar) {
				sb = document.createElement('div');
				sb.className = 'xvr-sb';
				sbL = document.createElement('span');
				sbL.className = 'xvr-sb-l';
				// 左下：筛选开关（仅 filterRow 启用时）—— 与统计文本分元素，避免 textContent 冲掉按钮
				if (enableFilterRow) {
					filterToggleBtn = document.createElement('button');
					filterToggleBtn.type = 'button';
					filterToggleBtn.className = 'xvr-filter-toggle' + (filterRowVisible ? ' is-on' : '');
					filterToggleBtn.innerHTML = '<i class="fa-solid fa-filter"></i><span>'
						+ vgT('grid.filter', '筛选') + '</span>';
					filterToggleBtn.onclick = function(e) {
						if (e) { e.preventDefault(); e.stopPropagation(); }
						setFilterRowVisible(!filterRowVisible);
						if (filterRowVisible) {
							// 聚焦第一个筛选输入
							var fi0, el0;
							for (fi0 = 0; fi0 < filterInps.length; fi0++) {
								el0 = filterInps[fi0];
								if (el0 && el0.tagName === 'INPUT') {
									try { el0.focus(); } catch (exF) { /* */ }
									break;
								}
							}
						}
					};
					sbL.appendChild(filterToggleBtn);
					syncFilterToggleBtn();
				}
				sbTextEl = document.createElement('span');
				sbTextEl.className = 'xvr-sb-text';
				sbL.appendChild(sbTextEl);
				// 紧挨统计右侧：全列搜索
				sbSearch = document.createElement('span');
				sbSearch.className = 'xvr-sb-search';
				sbSearch.innerHTML =
					'<label class="xvr-gsearch-label">' + vgT('grid.search', '搜索:') + '</label>' +
					'<input type="text" class="xvr-gsearch-inp" placeholder="'
						+ String(vgT('grid.searchPh', '全列关键字…')).replace(/"/g, '&quot;')
						+ '" autocomplete="off" spellcheck="false" />' +
					'<button type="button" class="xvr-gsearch-clear">'
						+ vgT('grid.searchCancel', '取消') + '</button>';
				globalSearchInp = sbSearch.querySelector('.xvr-gsearch-inp');
				var gClearBtn = sbSearch.querySelector('.xvr-gsearch-clear');
				globalSearchInp.oninput = function() {
					setGlobalSearch(globalSearchInp.value, false);
				};
				globalSearchInp.onkeydown = function(e) {
					e.stopPropagation();
					if (e.key === 'Escape') {
						e.preventDefault();
						clearGlobalSearch();
						globalSearchInp.blur();
					} else if (e.key === 'Enter') {
						e.preventDefault();
						setGlobalSearch(globalSearchInp.value, true);
					}
				};
				gClearBtn.onclick = function(e) {
					if (e) { e.preventDefault(); e.stopPropagation(); }
					clearGlobalSearch();
					try { globalSearchInp.focus(); } catch (ex) { /* */ }
				};
				// 扩展槽：宿主可挂导出等控件（靠右）
				sbExtra = document.createElement('span');
				sbExtra.className = 'xvr-sb-extra';
				// 可选右侧自定义文案（共 N 行已并入左侧统计，不再默认占用）
				sbR = document.createElement('span');
				sbR.className = 'xvr-sb-r';
				if (statusBarText) sbR.textContent = statusBarText;
				sb.appendChild(sbL);
				sb.appendChild(sbSearch);
				sb.appendChild(sbExtra);
				sb.appendChild(sbR);
				el.appendChild(sb);
			}

			// ══════════ 行内编辑 ══════════
			function startEdit(span, colIdx, dataIdx) {
				if (!editable) return;
				if (colIdx < 0 || colIdx >= cols.length) return;
				if (cols[colIdx].editable === false) return;
				if (editState) commitEdit();
				editState = { colIdx: colIdx, dataIdx: dataIdx };
				_attachInput(span, colIdx, dataIdx, true);
			}

			function setEditable(on) {
				editable = !!on;
				if (!editable && editState) {
					try { cancelEdit(); } catch (eEd) { /* */ }
				}
			}

			/** 统一识别编辑导航键（兼容 key / keyCode） */
			function _editNavKey(e) {
				var k = e.key, c = e.keyCode || e.which;
				if (k === 'Tab' || c === 9) return e.shiftKey ? 'ShiftTab' : 'Tab';
				if (k === 'Enter' || c === 13) return 'Enter';
				if (k === 'Escape' || c === 27) return 'Escape';
				if (k === 'ArrowUp' || c === 38) return 'Up';
				if (k === 'ArrowDown' || c === 40) return 'Down';
				if (k === 'ArrowLeft' || c === 37) return 'Left';
				if (k === 'ArrowRight' || c === 39) return 'Right';
				return null;
			}

			/** 列是否可进入编辑 */
			function _colEditable(cidx) {
				if (cidx < 0 || cidx >= cols.length) return false;
				var c = cols[cidx];
				if (!c) return false;
				if (c.editable === false) return false;
				if (c.is_select || c.field === '__sel__') return false;
				return true;
			}

			/**
			 * 从 (dataIdx, colIdx) 起沿 colDir(+1/-1) 找下一个可编辑列；
			 * 跨行时 wrap；找不到返回 null
			 */
			function _findNextEditCell(dataIdx, colIdx, colDir) {
				var vp = getVirtualPos(dataIdx);
				if (vp < 0) vp = dataIdx;
				var c = colIdx + colDir;
				var guard = 0, maxG = (TOTAL + 1) * (cols.length + 1);
				while (guard++ < maxG) {
					if (c >= cols.length) {
						vp++;
						if (vp >= TOTAL) return null;
						dataIdx = getDataIdx(vp);
						c = 0;
						continue;
					}
					if (c < 0) {
						vp--;
						if (vp < 0) return null;
						dataIdx = getDataIdx(vp);
						c = cols.length - 1;
						continue;
					}
					if (_colEditable(c)) {
						return { d: dataIdx, c: c };
					}
					c += colDir;
				}
				return null;
			}

			function _attachInput(span, colIdx, dataIdx, doFocus) {
				var col = cols[colIdx], raw = getCell(dataIdx, colIdx);
				span.textContent = '';
				span.className = 'xvr-ced';
				span.style.cssText = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left') + ';padding:0;overflow:visible;border-right:1px solid var(--x-border);';

				function bindEditNav(eInp, isCombo, ed, comboOrig) {
					eInp.onkeydown = function(e) {
						var nav = _editNavKey(e);
						if (!nav) {
							if (isCombo && comboOrig) comboOrig.call(ed, e);
							return;
						}
						// combo 下拉打开时：上下键先交给列表
						if (isCombo && ed && ed._opened && (nav === 'Up' || nav === 'Down')) {
							var oldHl = ed._highlight;
							if (comboOrig) comboOrig.call(ed, e);
							if (ed._highlight === oldHl) {
								e.preventDefault();
								e.stopPropagation();
								moveFromEdit(nav === 'Down' ? 1 : -1, 0);
							}
							return;
						}
						if (nav === 'Escape') {
							e.preventDefault();
							e.stopPropagation();
							if (isCombo && ed && ed._opened) { ed.collapse(); }
							if (editState) cancelEdit();
							return;
						}
						if (nav === 'Enter') {
							e.preventDefault();
							e.stopPropagation();
							if (isCombo && comboOrig) comboOrig.call(ed, e);
							// 提交并跳到下一可编辑格
							if (editState) moveFromEdit(0, 1);
							return;
						}
						if (nav === 'Tab' || nav === 'ShiftTab') {
							e.preventDefault();
							e.stopPropagation();
							if (editState) moveFromEdit(0, nav === 'ShiftTab' ? -1 : 1);
							return;
						}
						if (nav === 'Up') {
							e.preventDefault();
							e.stopPropagation();
							moveFromEdit(-1, 0);
							return;
						}
						if (nav === 'Down') {
							e.preventDefault();
							e.stopPropagation();
							moveFromEdit(1, 0);
							return;
						}
						// 左右：光标在边缘或全文选中时跳格，否则原生移动光标
						if (nav === 'Left' || nav === 'Right') {
							var ss = eInp.selectionStart, se = eInp.selectionEnd, len = (eInp.value || '').length;
							var allSel = (ss === 0 && se === len && len > 0);
							var atEdge = nav === 'Left'
								? (ss === 0 && se === 0) || allSel
								: (ss === len && se === len) || allSel;
							if (atEdge) {
								e.preventDefault();
								e.stopPropagation();
								moveFromEdit(0, nav === 'Left' ? -1 : 1);
							}
							return;
						}
					};
				}

				if (col.editor) {
					var ed = col.editor.xtype ? X.mk(col.editor) : col.editor;
					if (ed.setValue) ed.setValue(raw);
					span.appendChild(ed.el);
					editState._editor = ed;
					var eInp = ed.el.querySelector('input,textarea,select');
					if (!eInp) { eInp = ed.el; }
					if (doFocus) { setTimeout(function() { if (eInp) eInp.focus(); if (eInp && eInp.select) eInp.select(); if (ed.open) ed.open(); }, 0); }
					eInp.onblur = function(e) {
						if (_rendering || _suppressEditBlur) return;
						var rt = e.relatedTarget || document.activeElement;
						if (rt && ed.el.contains(rt)) return;
						// 编辑器中带有弹出层（如下拉框）时，点击滚动条或触发按钮不应停止编辑
						if (ed._opened) return;
						commitEdit();
					};
					var isCombo = (ed._allItems !== undefined);
					var comboOrig = isCombo ? eInp.onkeydown : null;
					bindEditNav(eInp, isCombo, ed, comboOrig);
				} else {
					var inp = document.createElement('input');
					inp.value = raw == null ? '' : String(raw);
					inp.style.cssText = 'width:100%;height:100%;border:none;padding:0 4px;font:inherit;background:var(--x-input-bg);outline:none;display:block;';
					span.appendChild(inp);
					if (doFocus) { inp.focus(); inp.select(); }
					inp.onblur = function() {
						if (_rendering || _suppressEditBlur) return;
						commitEdit();
					};
					bindEditNav(inp, false, null, null);
				}
			}

			function moveFromEdit(rowDir, colDir) {
				if (!editState) return;
				var curD = editState.dataIdx, curC = editState.colIdx;
				var target = null;

				if (colDir !== 0) {
					target = _findNextEditCell(curD, curC, colDir);
				} else if (rowDir !== 0) {
					var vp = getVirtualPos(curD), nvp = vp + rowDir;
					if (nvp < 0 || nvp >= TOTAL) return;
					var newD = getDataIdx(nvp);
					// 同行同列；若不可编辑则向右/左找
					if (_colEditable(curC)) {
						target = { d: newD, c: curC };
					} else {
						target = _findNextEditCell(newD, curC - 1, 1)
							|| _findNextEditCell(newD, curC + 1, -1);
					}
				}
				if (!target) return;

				_suppressEditBlur = true;
				try {
					commitEdit();
				} catch (exM) { /* */ }
				selAnchor = { d: target.d, c: target.c };
				selActive = { d: target.d, c: target.c };
				_ensureVisible(getVirtualPos(target.d));
				_pendingEdit = { d: target.d, c: target.c };
				_lastST = -2;
				render();
				// 下一帧再允许 blur，避免旧 input 的 blur 提交新格
				setTimeout(function () {
					_suppressEditBlur = false;
					// 若 render 时单元格尚未挂上，再试一次进编辑
					if (!editState && _pendingEdit == null && selActive) {
						var pec = surface.querySelector(
							'span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]'
						);
						if (pec && editable) startEdit(pec, selActive.c, selActive.d);
					}
				}, 0);
			}

			function commitEdit() {
				if (!editState) return;
				var didx = editState.dataIdx, cidx = editState.colIdx, col = cols[cidx];
				var raw = getCell(didx, cidx), newVal;
				if (editState._editor) {
					newVal = editState._editor.getValue ? editState._editor.getValue() : raw;
				} else {
					var cell = surface.querySelector('span[data-didx="' + didx + '"][data-col="' + cidx + '"]');
					var inp = cell ? cell.querySelector('input') : null;
					newVal = inp ? inp.value : raw;
				}
				if (col.parse) newVal = col.parse(newVal, raw);
				setCell(didx, cidx, newVal);
				editState = null;
				_restoreCell(didx, cidx);
			}

			function cancelEdit() {
				if (!editState) return;
				var didx = editState.dataIdx, cidx = editState.colIdx;
				editState = null;
				_ensureVisible(getVirtualPos(didx));
				_restoreCell(didx, cidx);
				_updateSelectionClasses();
				updateStatus();
			}

			function _restoreCell(dataIdx, colIdx) {
			var cell = surface.querySelector('span[data-didx="' + dataIdx + '"][data-col="' + colIdx + '"]');
			if (!cell) return;
			var col = cols[colIdx];
			var val = getCell(dataIdx, colIdx);
			var extraStyle = getCellStyle(dataIdx, colIdx, val);
			var extraCls = getCellClass(dataIdx, colIdx, val) || '';
			var cCls = extraCls;
			if (inSelection(dataIdx, colIdx)) cCls = (cCls ? cCls + ' ' : '') + 'xvr-sel';
			if (isActiveCell(dataIdx, colIdx)) cCls += ' xvr-act';
			cell.className = (cCls || '').replace(/^\s+/, '');
			cell.innerHTML = '';
			var stl = 'width:' + (col.w||80) + 'px;min-width:' + (col.w||80) + 'px;text-align:' + (col.a || 'left');
			if (extraStyle) stl += ';' + extraStyle;
			cell.style.cssText = stl;
			fillCellDisplay(cell, dataIdx, colIdx);
			}

			// ══════════ 文档级键盘/粘贴 ══════════
			// 仅当焦点在本表格内且不在筛选/搜索等普通输入框时接管，
			// 避免抢走 SQL 编辑器、WHERE 框、其它页签输入框的 Ctrl+V / 方向键等。
			function isNativeEditable(node) {
				if (!node || !node.tagName) return false;
				var tag = node.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
				if (node.isContentEditable) return true;
				return false;
			}
			/** 本表格是否应接管当前文档级快捷键/粘贴 */
			function shouldCaptureDocEvent() {
				if (!surface.isConnected) return false;
				var ae = document.activeElement;
				if (!ae || !el.contains(ae)) return false;
				// 单元格编辑中：粘贴需走块粘贴逻辑；keydown 在 onDocKeyDown 开头已 early-return
				if (editState) return true;
				// 表头筛选、底部搜索等 input：交给原生
				if (isNativeEditable(ae)) return false;
				return true;
			}
			function onDocKeyDown(e) {
				if (!surface.isConnected) return;
				if (editState) return;
				if (!shouldCaptureDocEvent()) return;
				if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
					if (selAnchor && selActive) { e.preventDefault(); copyBlock(); }
					return;
				}
				if (e.key === 'F2') {
					e.preventDefault();
					if (selActive) {
						var cell = surface.querySelector('span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]');
						if (cell) startEdit(cell, selActive.c, selActive.d);
					}
					return;
				}
				if (e.key === 'Tab') { e.preventDefault(); if (selActive) moveSelection(0, e.shiftKey ? -1 : 1); return; }
				if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelection(-1, 0, e.shiftKey); }
				if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelection(1, 0, e.shiftKey); }
				if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelection(0, -1, e.shiftKey); }
				if (e.key === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1, e.shiftKey); }
				if (e.key === 'Enter') {
					e.preventDefault();
					if (selActive) {
						var cell = surface.querySelector('span[data-didx="' + selActive.d + '"][data-col="' + selActive.c + '"]');
						if (cell) startEdit(cell, selActive.c, selActive.d);
					}
				}
			}
			document.addEventListener('keydown', onDocKeyDown);

			// ══════════ 鼠标拖拽选区 ══════════
			function _cellFromPoint(clientX, clientY) {
				var el = document.elementFromPoint(clientX, clientY);
				if (el && el.tagName === 'SPAN' && el.dataset.didx !== undefined) {
					return { d: parseInt(el.dataset.didx, 10), c: parseInt(el.dataset.col, 10) };
				}
				// 回退：按坐标换算（需计入横向 scrollLeft，否则水平滚动后列命中偏左）
				var rect = sc.getBoundingClientRect();
				var y = clientY - rect.top + sc.scrollTop;
				var x = clientX - rect.left + sc.scrollLeft;
				if (y < 0 || y >= TOTAL * ROW_H || x < 0) return null;
				var vPos = Math.floor(y / ROW_H);
				if (vPos < 0 || vPos >= TOTAL) return null;
				var accX = 0, c = -1;
				for (var i = 0; i < cols.length; i++) {
					accX += (cols[i].w || 80);
					if (x < accX) { c = i; break; }
				}
				if (c === -1) return null;
				return { d: getDataIdx(vPos), c: c };
			}

			var _autoScrollTimer = null, _autoScrollDir = 0, _dragState = null;

			function _stopAutoScroll() {
				if (_autoScrollTimer) { clearInterval(_autoScrollTimer); _autoScrollTimer = null; }
				_autoScrollDir = 0;
			}
			function _startAutoScroll() {
				if (_autoScrollTimer) return;
				_autoScrollTimer = setInterval(function() {
					if (!_dragState || !_dragState.moved || _autoScrollDir === 0) return;
					sc.scrollTop += _autoScrollDir;
					var cell = _cellFromPoint(_dragState.lastX, _dragState.lastY);
					if (cell) {
						selAnchor = { d: _dragState.startD, c: _dragState.startC };
						selActive = { d: cell.d, c: cell.c };
						_renderSelection();
					}
				}, 16);
			}

			function onDocMouseMove(e) {
				if (!_dragState) return;
				_dragState.lastX = e.clientX; _dragState.lastY = e.clientY;
				var dx = e.clientX - _dragState.startX, dy = e.clientY - _dragState.startY;
				if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragState.moved = true;
				if (!_dragState.moved) return;
				var rect = sc.getBoundingClientRect(), margin = 30;
				if (e.clientY < rect.top + margin) { _autoScrollDir = -Math.ceil((rect.top + margin - e.clientY) / 3); _startAutoScroll(); }
				else if (e.clientY > rect.bottom - margin) { _autoScrollDir = Math.ceil((e.clientY - (rect.bottom - margin)) / 3); _startAutoScroll(); }
				else { _stopAutoScroll(); }
				var cell = _cellFromPoint(e.clientX, e.clientY);
				if (cell) { selAnchor = { d: _dragState.startD, c: _dragState.startC }; selActive = { d: cell.d, c: cell.c }; }
				_renderSelection();
			}

			function onDocMouseUp(e) {
				if (!_dragState) return;
				_stopAutoScroll();
				var st = _dragState; _dragState = null;
				if (!st.moved && !st.shiftKey) {
					var col0 = cols[st.startC];
					if (col0 && (col0.is_select || col0.field === '__sel__')) return;
					if (col0 && col0.editable === false && col0.xtype !== 'checkbox') return;
					// Ctrl/Cmd+点击：通知宿主进入修改模式后直接编辑该单元格
					var ctrlEdit = !!(st.ctrlKey || st.metaKey);
					if (ctrlEdit && typeof opts.onCtrlClickEdit === 'function') {
						try { opts.onCtrlClickEdit(st.startD, st.startC); } catch (exCtrl) { /* */ }
					}
					if (ctrlEdit || clicksToEdit === 1) {
						var cell = surface.querySelector('span[data-didx="' + st.startD + '"][data-col="' + st.startC + '"]');
						if (cell) startEdit(cell, st.startC, st.startD);
					}
				}
			}
			document.addEventListener('mousemove', onDocMouseMove);
			document.addEventListener('mouseup', onDocMouseUp);

			// ══════════ 块复制/粘贴 ══════════
			// 复制：按屏幕可见顺序（排序后的虚拟行序）从上到下、从左到右
			function copyBlock() {
				if (!selAnchor || !selActive) return;
				var vpA = getVirtualPos(selAnchor.d), vpB = getVirtualPos(selActive.d);
				if (vpA < 0) vpA = selAnchor.d;
				if (vpB < 0) vpB = selActive.d;
				var minVP = Math.min(vpA, vpB), maxVP = Math.max(vpA, vpB);
				var minC = Math.min(selAnchor.c, selActive.c), maxC = Math.max(selAnchor.c, selActive.c);
				var lines = [];
				for (var vp = minVP; vp <= maxVP; vp++) {
					var d = getDataIdx(vp);
					var parts = [];
					for (var c = minC; c <= maxC; c++) {
						// 跳过选择列（checkbox），避免把勾选状态写进剪贴板
						if (cols[c] && (cols[c].is_select || cols[c].field === '__sel__')) continue;
						var raw = getCell(d, c);
						parts.push(raw == null ? '' : String(raw));
					}
					lines.push(parts.join('\t'));
				}
				var text = lines.join('\n');
				var ta = document.createElement('textarea');
				ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
				document.body.appendChild(ta); ta.focus(); ta.select();
				try { document.execCommand('copy'); } catch (err) {}
				document.body.removeChild(ta); sc.focus();
			}

			// 粘贴：从「当前活动单元格」起，向右、向下（按屏幕行序）写入
			// 不再用选区左上角 Math.min，避免从下方往上拖选后粘贴起点跑到顶部
			function _doPaste(text) {
				if (!text || !selActive) return;
				var rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
				if (rows.length && rows[rows.length - 1] === '') rows.pop();
				if (!rows.length) return;

				var startC = selActive.c;
				// 落在多选列上则改到第一个业务列
				if (cols[startC] && (cols[startC].is_select || cols[startC].field === '__sel__')) {
					startC = _firstEditableCol();
				}
				if (startC < 0) startC = Math.min(1, cols.length - 1);
				if (startC < 0) startC = 0;

				var startVP = getVirtualPos(selActive.d);
				if (startVP < 0) startVP = selActive.d;

				var endD = selActive.d, endC = startC;
				var firstD = getDataIdx(startVP);

				for (var r = 0; r < rows.length; r++) {
					var vp = startVP + r;
					if (vp >= TOTAL) break;
					var td = getDataIdx(vp);
					var cells = rows[r].split('\t');
					for (var c = 0; c < cells.length; c++) {
						var tc = startC + c;
						if (tc >= cols.length) break;
						// 列位置对齐：不可写列跳过写入，但剪贴板列下标仍与列一一对应
						if (cols[tc].editable === false && cols[tc].xtype !== 'checkbox') continue;
						var v = cells[c];
						if (cols[tc].xtype === 'checkbox') { v = (v !== '' && v !== '0' && v !== 'false') ? 1 : 0; }
						else if (cols[tc].parse) v = cols[tc].parse(v, getCell(td, tc));
						setCell(td, tc, v);
						endD = td;
						endC = tc;
					}
				}
				selAnchor = { d: firstD, c: startC };
				selActive = { d: endD, c: endC };
				_lastST = -2; render();
			}

			function onDocPaste(e) {
				if (!surface.isConnected) return;
				// 焦点在 SQL 编辑器等外部输入、或本表筛选/搜索框：不拦截
				if (!shouldCaptureDocEvent()) return;
				var text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
				if (!text) return;
				// 编辑中：多行/多列块粘贴时退出编辑，按活动格向下粘贴；单行无 tab 则交给 input
				if (editState) {
					if (text.indexOf('\t') >= 0 || text.indexOf('\n') >= 0 || text.indexOf('\r') >= 0) {
						e.preventDefault();
						// 丢弃未提交的编辑内容，以活动格为原点块粘贴
						var ad = editState.dataIdx, ac = editState.colIdx;
						cancelEdit();
						selAnchor = { d: ad, c: ac };
						selActive = { d: ad, c: ac };
						_doPaste(text);
					}
					return;
				}
				if (!selActive) return;
				e.preventDefault();
				_doPaste(text);
			}
			document.addEventListener('paste', onDocPaste);

			// ══════════ 核心渲染 ══════════
			var _rafPending = false, _lastST = -1, _rendering = false, _selRender = false;

			function render() {
				// 仅选择变化时跳过 DOM 重建
				if (_selRender) {
					_selRender = false;
					_updateSelectionClasses();
					updateStatus();
					return;
				}
				var editStillVisible = false;
				if (editState) {
					var st0 = sc.scrollTop, vh0 = sc.clientHeight;
					var fr0 = Math.floor(st0 / ROW_H), vr0 = Math.ceil(vh0 / ROW_H) + 1;
					var s0 = Math.max(0, fr0 - BUFFER), e0 = Math.min(TOTAL, fr0 + vr0 + BUFFER);
					if (sortIdx) { for (var t = s0; t < e0; t++) { if (sortIdx[t] === editState.dataIdx) { editStillVisible = true; break; } } }
					else { editStillVisible = (editState.dataIdx >= s0 && editState.dataIdx < e0); }
				}
				var st = sc.scrollTop;
				if (st === _lastST) { _rafPending = false; return; }
				_lastST = st;
				var vh = sc.clientHeight;
				if (vh === 0) { _rafPending = false; return; }
				var firstRow = Math.floor(st / ROW_H);
				var visibleRows = Math.ceil(vh / ROW_H) + 1;
				var start = Math.max(0, firstRow - BUFFER);
				var end = Math.min(TOTAL, firstRow + visibleRows + BUFFER);
				var count = end - start;

				var savedEditValue = null;
				if (editStillVisible && editState) {
					var oe = surface.querySelector('span[data-didx="' + editState.dataIdx + '"][data-col="' + editState.colIdx + '"]');
					if (oe) { var oi = oe.querySelector('input'); if (oi) savedEditValue = oi.value; }
				}

				surface.style.top = (start * ROW_H) + 'px';
				var frag = document.createDocumentFragment();

				for (var i = 0; i < count; i++) {
					var ri = start + i, dataIdx = getDataIdx(ri);
					var row = document.createElement('div');
					var rowCls = 'xvr-row', extCls = getRowClass(dataIdx, ri);
					if (extCls) rowCls += ' ' + extCls;
					row.className = rowCls; row.dataset.didx = dataIdx;
					for (var j = 0; j < cols.length; j++) {
						var col = cols[j], val = getCell(dataIdx, j);
						var cCls = '', extraStyle = getCellStyle(dataIdx, j, val), extraCls = getCellClass(dataIdx, j, val);
						var stl = 'width:' + col.w + 'px;min-width:' + col.w + 'px;text-align:' + (col.a || 'left');
						if (extraStyle) stl += ';' + extraStyle;
						if (inSelection(dataIdx, j)) cCls = 'xvr-sel';
						if (isActiveCell(dataIdx, j)) cCls += ' xvr-act';
						if (extraCls) cCls += ' ' + extraCls;
						var span = document.createElement('span');
						span.className = cCls;
						span.dataset.ri = ri;
						span.dataset.col = j;
						span.dataset.didx = dataIdx;
						span.style.cssText = stl;
						fillCellDisplay(span, dataIdx, j);
						row.appendChild(span);
					}
					var chkInps = row.querySelectorAll('input[type=checkbox]');
					for (var ci = 0; ci < chkInps.length; ci++) {
						(function(inp) {
							inp.onchange = function(e) {
								e.stopPropagation();
								var sp = inp.closest('span');
								if (!sp) return;
								var d = parseInt(sp.dataset.didx), c = parseInt(sp.dataset.col);
								setCell(d, c, inp.checked ? 1 : 0);
								selAnchor = { d: d, c: c }; selActive = { d: d, c: c };
								_lastST = -2; render();
							};
						})(chkInps[ci]);
					}
					var spans = row.querySelectorAll('span');
					for (var j = 0; j < spans.length; j++) {
						(function(sp) {
							sp.onmousedown = function(e) {
								if (e.button !== 0) return;
								if (e.target.tagName === 'INPUT') return;
								// Click inside the active editor (combo popup, scrollbar, etc.) — let the editor handle it, do not commit
								if (editState && editState._editor && editState._editor.el && editState._editor.el.contains(e.target)) return;
								e.preventDefault(); sc.focus();
								if (editState) commitEdit();
								var c = parseInt(sp.dataset.col), d = parseInt(sp.dataset.didx);
								if (e.shiftKey && selAnchor) { selActive = { d: d, c: c }; }
								else { selAnchor = { d: d, c: c }; selActive = { d: d, c: c }; }
								_dragState = {
									startX: e.clientX, startY: e.clientY,
									startD: d, startC: c,
									moved: false,
									shiftKey: e.shiftKey,
									ctrlKey: !!e.ctrlKey,
									metaKey: !!e.metaKey,
									lastX: e.clientX, lastY: e.clientY
								};
								_renderSelection();
							};
							if (ctxMenu) {
								sp.oncontextmenu = function(e) {
									e.preventDefault();
									if (e.target.tagName === 'INPUT') return;
									sc.focus(); if (editState) commitEdit();
									var c = parseInt(sp.dataset.col), d = parseInt(sp.dataset.didx);
									selAnchor = { d: d, c: c }; selActive = { d: d, c: c };
									_dragState = null; _renderSelection();
									ctxMenu.showAt(e.clientX, e.clientY);
								};
							}
						})(spans[j]);
						if(clicksToEdit===2){
							(function(sp){
								sp.ondblclick=function(e){
									e.preventDefault();
									if(e.target.tagName==='INPUT')return;
									if(editState&&editState._editor&&editState._editor.el&&editState._editor.el.contains(e.target))return;
									sc.focus();if(editState)commitEdit();
									var c=parseInt(sp.dataset.col),d=parseInt(sp.dataset.didx);
									selAnchor={d:d,c:c};selActive={d:d,c:c};
									_dragState=null;_renderSelection();
									startEdit(sp,c,d);
								};
							})(spans[j]);
						}
					}
					frag.appendChild(row);
				}

				_rendering = true;
				var savedST = sc.scrollTop;
				surface.innerHTML = '';
				surface.appendChild(frag);

				if (editStillVisible && editState) {
					var nc = surface.querySelector('span[data-didx="' + editState.dataIdx + '"][data-col="' + editState.colIdx + '"]');
					if (nc) {
						if (savedEditValue !== null) setCell(editState.dataIdx, editState.colIdx, savedEditValue);
						_attachInput(nc, editState.colIdx, editState.dataIdx, false);
					} else { editState = null; }
				} else if (editState && !editStillVisible) { commitEdit(); }

				if (_pendingEdit) {
					var pe = _pendingEdit; _pendingEdit = null;
					if (!editState) {
						var pec = surface.querySelector('span[data-didx="' + pe.d + '"][data-col="' + pe.c + '"]');
						if (pec) {
							startEdit(pec, pe.c, pe.d);
						} else {
							// 虚拟滚动尚未画出目标格：保留一次重试
							_pendingEdit = pe;
							setTimeout(function () {
								if (editState || !_pendingEdit) return;
								var pe2 = _pendingEdit; _pendingEdit = null;
								var pec2 = surface.querySelector('span[data-didx="' + pe2.d + '"][data-col="' + pe2.c + '"]');
								if (pec2 && editable) startEdit(pec2, pe2.c, pe2.d);
							}, 30);
						}
					}
				}
				_rendering = false;
				sc.scrollTop = savedST;
				_rafPending = false;
				updateStatus();
			}

			function formatElapsedMs(ms) {
				if (ms == null || ms === '') return '';
				var n = Number(ms);
				if (isNaN(n) || n < 0) return '';
				// 整数 ms；≥1000 可带一位小数秒感，仍统一 ms 便于对照 SQL 页
				var s = (Math.round(n) === n) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1);
				return vgT('grid.elapsed', '用时 {ms} ms', { ms: s });
			}

			function updateStatus() {
				if (!sb || !sbL) return;
				var st = sc.scrollTop;
				var first = TOTAL > 0 ? Math.min(TOTAL, Math.floor(st / ROW_H) + 1) : 0;
				var last = TOTAL > 0 ? Math.min(TOTAL, Math.ceil((st + sc.clientHeight) / ROW_H)) : 0;
				// 共 N 行 + 显示行合并到左侧
				var sbText = vgT('grid.rows', '共 {n} 行', { n: TOTAL.toLocaleString() })
					+ ' | ' + vgT('grid.displayRows', '显示行: {first} - {last}', {
						first: first.toLocaleString(),
						last: last.toLocaleString()
					});
				var elTxt = formatElapsedMs(elapsedMs);
				if (elTxt) sbText += ' | ' + elTxt;
				if (selActive && selActive.c >= 0 && selActive.c < cols.length) {
					var vpSa = getVirtualPos(selAnchor.d), vpSb = getVirtualPos(selActive.d);
					if (vpSa < 0) vpSa = selAnchor.d;
					if (vpSb < 0) vpSb = selActive.d;
					var minVP = Math.min(vpSa, vpSb), maxVP = Math.max(vpSa, vpSb);
					var minC = Math.min(selAnchor.c, selActive.c);
					var maxC = Math.max(selAnchor.c, selActive.c);
					var rowCount = maxVP - minVP + 1;
					var colCount = maxC - minC + 1;
					sbText += ' | ' + vgT('grid.select', '选择: {r}x{c}', { r: rowCount, c: colCount });
					var allNumeric = true;
					var sum = 0;
					var numericCount = 0;
					for (var svp = minVP; svp <= maxVP; svp++) {
						var sd = getDataIdx(svp);
						for (var sc2 = minC; sc2 <= maxC; sc2++) {
							var cv = getCell(sd, sc2);
							var cs = cv != null ? String(cv).trim() : '';
							if (cs !== '') {
								var cn = parseFloat(cs);
								if (isNaN(cn)) {
									allNumeric = false;
								} else {
									sum += cn;
									numericCount++;
								}
							}
						}
					}
					if (allNumeric && numericCount > 0) {
						var avg = sum / numericCount;
						var sumStr = (Math.abs(sum - Math.floor(sum)) < 1e-10 ? Math.floor(sum).toLocaleString() : sum.toLocaleString());
						var avgStr = (Math.abs(avg - Math.round(avg * 100) / 100) < 1e-10 ? avg.toLocaleString() : avg.toFixed(2).replace(/\.?0+$/, ''));
						sbText += ' \u00A0\u00A0' + vgT('grid.sum', '合计: {n}', { n: sumStr })
							+ ' \u00A0\u00A0' + vgT('grid.avg', '平均: {n}', { n: avgStr });
					}
				}
				if (editState) sbText += ' | ' + vgT('grid.editing', '编辑中');
				if (hasActiveColFilter()) {
					sbText += ' | ' + vgT('grid.filterStat', '筛选: {shown}/{total} 行', {
						shown: TOTAL.toLocaleString(),
						total: dataArr.length.toLocaleString()
					});
					if (globalSearch && String(globalSearch).trim()) {
						sbText += ' · ' + vgT('grid.globalQ', '全列:"{q}"', { q: String(globalSearch).trim() });
					}
				}
				if (sbSearch) {
					if (globalSearch && String(globalSearch).trim()) sbSearch.classList.add('is-on');
					else sbSearch.classList.remove('is-on');
				}
				if (sortKeys.length) {
					var sp = [], si;
					for (si = 0; si < sortKeys.length; si++) {
						var scCol = cols[sortKeys[si].col];
						sp.push((scCol && scCol.t != null ? scCol.t : ('#' + sortKeys[si].col))
							+ (sortKeys[si].dir === 1 ? '↑' : '↓'));
					}
					sbText += ' | ' + vgT('grid.sort', '排序: {list}', { list: sp.join(', ') });
				}
				if (sbTextEl) sbTextEl.textContent = sbText;
				else if (sbL) sbL.textContent = sbText;
				// 右侧仅保留自定义 statusBarText；空则隐藏
				if (sbR && !statusBarText) {
					sbR.textContent = '';
				}
			}

			// 仅更新选中类名（不重建 DOM）
			function _updateSelectionClasses() {
				var spans = surface.querySelectorAll('span[data-didx]');
				for (var i = 0; i < spans.length; i++) {
					var sp = spans[i];
					var d = parseInt(sp.dataset.didx), c = parseInt(sp.dataset.col);
					var sel = inSelection(d, c);
					var act = isActiveCell(d, c);
					if (sel) sp.classList.add('xvr-sel');
					else sp.classList.remove('xvr-sel');
					if (act) sp.classList.add('xvr-act');
					else sp.classList.remove('xvr-act');
				}
			}

			// 仅选择变化时调用（轻量更新）
			function _renderSelection() {
				_selRender = true;
				render();
			}

			// 滚动事件（rAF 节流）
			sc.onscroll = function() { if (!_rafPending) { _rafPending = true; requestAnimationFrame(render); } };

			// ══════════ 窗口自适应 ══════════
			var _resizeTimer = null;
			function onResize() {
				hideHeaderFloatActs();
				if (_resizeTimer) clearTimeout(_resizeTimer);
				_resizeTimer = setTimeout(function() { _lastST = -2; render(); }, 200);
			}
			window.addEventListener('resize', onResize);

			// ══════════ 初始渲染 ══════════
			function initRender() {
				var vh = sc.clientHeight;
				if (vh > 0) { render(); updateStatus(); }
				else { setTimeout(initRender, 16); }
			}
			setTimeout(initRender, 16);

			// ══════════ 自动插入容器 ══════════
			if (container) container.appendChild(el);

			// ══════════ 返回 API ══════════

			var api = {
				data: dataArr,
				onCellValueChange: opts.onCellValueChange || null,
				el: el,
				destroy: function() {
					hideHeaderFloatActs();
					if (floatActs && floatActs.parentNode) {
						floatActs.parentNode.removeChild(floatActs);
						floatActs = null;
					}
					_stopAutoScroll();
					window.removeEventListener('resize', onResize);
					if (_resizeTimer) clearTimeout(_resizeTimer);
					document.removeEventListener('keydown', onDocKeyDown);
					document.removeEventListener('mousemove', onDocMouseMove);
					document.removeEventListener('mouseup', onDocMouseUp);
					document.removeEventListener('paste', onDocPaste);
					document.removeEventListener('mousemove', _onColDragMove);
					document.removeEventListener('mouseup', _onColDragUp);
					if(_dragProxy&&_dragProxy.parentNode)_dragProxy.parentNode.removeChild(_dragProxy);
				},
				refresh: function(preserveScroll) {
				var _ks = sc.scrollLeft, _kt = sc.scrollTop;
				_lastST = -2;
				render();
				if (preserveScroll) { sc.scrollLeft = _ks; sc.scrollTop = _kt; }
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			},
			forceRender: function() {
				var _ks = sc.scrollLeft, _kt = sc.scrollTop;
				_lastST = -2;
				render();
				sc.scrollLeft = _ks; sc.scrollTop = _kt;
				if (typeof _syncHdrScroll === 'function') _syncHdrScroll();
			},
			setColumnWidth: setColumnWidth,
				getSelection: function() {
					if (!selActive) return null;
					return { anchor: selAnchor ? { row: selAnchor.d, col: selAnchor.c } : null, active: { row: selActive.d, col: selActive.c } };
				},
				setSelection: function(row, col) {
					selAnchor = { d: row, c: col }; selActive = { d: row, c: col };
					_ensureVisible(getVirtualPos(row)); _renderSelection();
				},
				clearSelection: function() { selAnchor = null; selActive = null; _renderSelection(); },
				scrollTo: function(row) { var vp = getVirtualPos(row); if (vp >= 0) sc.scrollTop = vp * ROW_H; },
				/** 当前排序；无排序 null。含 keys[] 多列；并保留首关键字 col/field/name/dir 兼容 */
				getSort: function() {
					if (!sortKeys.length) return null;
					var keys = [], i, c, k;
					for (i = 0; i < sortKeys.length; i++) {
						k = sortKeys[i];
						c = cols[k.col];
						keys.push({
							col: k.col,
							field: c && c.field != null ? c.field : k.col,
							name: c ? (c.name != null ? c.name : c.t) : null,
							dir: k.dir
						});
					}
					return {
						keys: keys,
						col: keys[0].col,
						field: keys[0].field,
						name: keys[0].name,
						dir: keys[0].dir
					};
				},
				/**
				 * 恢复排序。
				 * - 多列：{ keys:[{field|name|col, dir}, ...] }
				 * - 单列：{ col?, field?, name?, dir }
				 */
				setSort: function(spec) {
					if (!spec || !sortable) return false;
					function resolveCol(item) {
						var idx = -1, i, col, fStr, nStr;
						if (!item) return -1;
						if (item.field != null || item.name != null) {
							fStr = item.field != null ? String(item.field) : null;
							nStr = item.name != null ? String(item.name) : null;
							for (i = 0; i < cols.length; i++) {
								col = cols[i];
								if (col.is_select || col.field === '__sel__') continue;
								// field 可能是数字下标，name/t 为列名
								if (fStr != null) {
									if (String(col.field) === fStr || String(col.name) === fStr || String(col.t) === fStr) {
										idx = i; break;
									}
								}
								if (nStr != null) {
									if (String(col.name) === nStr || String(col.t) === nStr || String(col.field) === nStr) {
										idx = i; break;
									}
								}
							}
						}
						if (idx < 0 && item.col != null && item.col >= 0 && item.col < cols.length) idx = item.col;
						return idx;
					}
					var next = [], list, li, idx, dir;
					if (spec.keys && spec.keys.length) {
						list = spec.keys;
					} else {
						list = [spec];
					}
					for (li = 0; li < list.length; li++) {
						idx = resolveCol(list[li]);
						if (idx < 0 || !_isSortableCol(idx)) continue;
						// 去重：同列只保留最后一次
						for (var di = next.length - 1; di >= 0; di--) {
							if (next[di].col === idx) next.splice(di, 1);
						}
						dir = list[li].dir === -1 ? -1 : 1;
						next.push({ col: idx, dir: dir, field: _colField(idx) });
					}
					if (!next.length) return false;
					sortKeys = next;
					_syncLegacySort();
					updateSort();
					if (typeof updateHeaderSort === 'function') updateHeaderSort();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
					return true;
				},
				clearSort: function() {
					clearSort();
					if (typeof updateHeaderSort === 'function') updateHeaderSort();
					_lastST = -2;
					render();
					updateStatus();
					fireSortChange();
				},
				commitEdit: commitEdit,
				cancelEdit: cancelEdit,
				setEditable: setEditable,
				/** 列内筛选值：{ field|col: string } */
				getColFilters: function() {
					var out = {}, i, col, key;
					for (i = 0; i < cols.length; i++) {
						if (!colFilterVals[i] || String(colFilterVals[i]).trim() === '') continue;
						col = cols[i];
						if (col && (col.is_select || col.field === '__sel__')) continue;
						key = col && col.name != null ? col.name : (col && col.field != null ? col.field : i);
						out[String(key)] = String(colFilterVals[i]);
					}
					return out;
				},
				setColFilters: function(map) {
					if (!map || typeof map !== 'object') return false;
					var i, col, key, val, hit;
					for (i = 0; i < cols.length; i++) {
						col = cols[i];
						if (col && (col.is_select || col.field === '__sel__')) continue;
						val = '';
						hit = false;
						if (col && col.name != null && map[col.name] != null) { val = map[col.name]; hit = true; }
						else if (col && col.field != null && map[col.field] != null) { val = map[col.field]; hit = true; }
						else if (col && col.t != null && map[col.t] != null) { val = map[col.t]; hit = true; }
						else if (map[String(i)] != null) { val = map[String(i)]; hit = true; }
						if (!hit) continue;
						colFilterVals[i] = val == null ? '' : String(val);
						if (filterInps[i] && filterInps[i].tagName === 'INPUT') {
							filterInps[i].value = colFilterVals[i];
						}
					}
					applyColFiltersFromInputs(true);
					return true;
				},
				clearColFilters: clearAllColFilters,
				setFilterRowVisible: setFilterRowVisible,
				isFilterRowVisible: function() { return !!filterRowVisible; },
				getGlobalSearch: function() { return globalSearch; },
				setGlobalSearch: function(q) { setGlobalSearch(q, true); },
				clearGlobalSearch: clearGlobalSearch,
				/** 状态栏右侧扩展槽（导出等），无状态栏时为 null */
				getStatusBarExtra: function() { return sbExtra; },
				/** 设置查询用时（ms），null 清除；立即刷新底栏 */
				setElapsedMs: function(ms) {
					if (ms == null || ms === '') elapsedMs = null;
					else {
						var n = Number(ms);
						elapsedMs = isNaN(n) ? null : n;
					}
					updateStatus();
				},
				getElapsedMs: function() { return elapsedMs; }
			};
			return api;
		};
	}

	// ─── X.mbox / X.confirm / X.prompt ─── 常用消息弹窗

/* ==== 30-initmbox.js ==== */
/* XUI component: initmbox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initmbox(){
		function _normalizeBtns(btns){
			if(!btns||!btns.length)btns=[{text:'确定'}];
			else if(typeof btns[0]==='string')btns=btns.map(function(t){return {text:t};});
			return btns;
		}
		function _mkMsgEl(iconHtml,msg){
			return {xtype:'hbox',cls:'x-mbox-body',items:[
				{xtype:'box',cls:'x-mbox-icon-wrap',html:iconHtml||''},
				{xtype:'box',cls:'x-mbox-msg',html:msg}
			]};
		}
		X.showmbox = function(cfg){
			return new Promise(function(resolve){
				var btns=_normalizeBtns(cfg.btns);
				var btnItems=btns.map(function(b){
					var btnCfg=typeof b==='string'?{text:b}:b;
					return {xtype:'button',text:btnCfg.text,handler:function(){
						var win=this.up('window');
						win.close();
						if(btnCfg.handler)btnCfg.handler();
						resolve(btnCfg.value!==undefined?btnCfg.value:btnCfg.text);
					}};
				});
				var iconHtml=cfg.icon!==undefined?cfg.icon:'<i class="fa-solid fa-info-circle" style="color:var(--x-accent)"></i>';
				X.WinMgr.create({
					xtype:'window',title:cfg.title||'提示',modal:true,toolBtns:false,
					width:cfg.width||420,height:cfg.height||160,
					cls:'x-mbox xwin-autoh',
					resizable:false,
					items:[
						_mkMsgEl(iconHtml,cfg.msg),
						{xtype:'hbox',cls:'x-mbox-btns',items:btnItems}
					]
				});
			});
		}

		X.mbox=function(msg,title,icon,btns,fn){
			var p=X.showmbox({msg:msg,title:title,icon:icon,btns:btns});
			if(fn)p.then(fn);
			return p;
		};

		X.mboxerror=function(msg,title,fn){
			return X.mbox(msg,title||'错误','<i class="fa-solid fa-circle-xmark" style="color:var(--x-danger)"></i>&nbsp;',
				[{text:'确定',value:false}],fn);
		};

		X.confirm=function(msg,title,fn){
			return X.mbox(msg,title||'确认','<i class="fa-solid fa-question-circle" style="color:var(--x-accent)"></i>&nbsp;',
				[
					{text:'是',value:true},
					{text:'否',value:false}
				],fn);
		};

		X.prompt=function(value,title,fn){
			return new Promise(function(resolve){
				X.WinMgr.create({
					xtype:'window',title:title||'请输入',modal:true,toolBtns:false,width:480,height:280,
					cls:'x-mbox',resizable:false,
					items:[
						{xtype:'textarea',value:value||'',cls:'x-mbox-ta x-mbox-ta-prompt'},
						{xtype:'hbox',cls:'x-mbox-btns',items:[
							{xtype:'button',text:'确定',handler:function(){
								var win=this.up('window');
								var ta=win.ch[0];
								var val=ta.getValue();
								win.close();
								if(fn)fn(val);
								resolve(val);
							}},
							{xtype:'button',text:'取消',handler:function(){
								var win=this.up('window');
								win.close();
								if(fn)fn(null);
								resolve(null);
							}}
						]}
					]
				});
			});
		};

		// ─── Toast：顶部居中轻提示 ───
		var _toastHost=null,_toastTimer=null,_toastHideTimer=null;
		function _toastEnsureHost(){
			if(_toastHost&&_toastHost.parentNode)return _toastHost;
			_toastHost=document.createElement('div');
			_toastHost.className='x-toast-host';
			_toastHost.setAttribute('aria-live','polite');
			document.body.appendChild(_toastHost);
			return _toastHost;
		}
		/**
		 * 顶部居中 Toast
		 * @param {string} msg
		 * @param {'ok'|'err'|'info'|'success'|'error'|string} [kind] 默认 ok
		 * @param {number} [ms] 显示毫秒，默认 2400
		 */
		X.toast=function(msg,kind,ms){
			msg=msg==null?'':String(msg);
			if(!msg)return;
			// 兼容 X.toast('msg', {type:'ok', duration:2000})
			if(kind&&typeof kind==='object'){
				ms=kind.duration!=null?kind.duration:kind.ms;
				kind=kind.type||kind.kind||'ok';
			}
			kind=String(kind||'ok').toLowerCase();
			if(kind==='success')kind='ok';
			if(kind==='error'||kind==='danger')kind='err';
			if(kind!=='ok'&&kind!=='err'&&kind!=='info')kind='ok';
			ms=ms==null?2400:ms;

			var host=_toastEnsureHost();
			var el=document.createElement('div');
			el.className='x-toast x-toast-'+kind;
			var icon='fa-circle-check';
			if(kind==='err')icon='fa-circle-xmark';
			else if(kind==='info')icon='fa-circle-info';
			el.innerHTML='<i class="fa-solid '+icon+' x-toast-ico" aria-hidden="true"></i><span class="x-toast-msg"></span>';
			el.querySelector('.x-toast-msg').textContent=msg;

			// 只保留最新一条
			host.innerHTML='';
			host.appendChild(el);
			host.classList.add('is-show');

			// 入场动画
			if(typeof requestAnimationFrame==='function'){
				requestAnimationFrame(function(){ el.classList.add('is-in'); });
			}else{
				setTimeout(function(){ el.classList.add('is-in'); },0);
			}

			if(_toastTimer){ clearTimeout(_toastTimer); _toastTimer=null; }
			if(_toastHideTimer){ clearTimeout(_toastHideTimer); _toastHideTimer=null; }
			_toastTimer=setTimeout(function(){
				el.classList.remove('is-in');
				el.classList.add('is-out');
				_toastHideTimer=setTimeout(function(){
					if(el.parentNode)el.parentNode.removeChild(el);
					if(host&&!host.children.length)host.classList.remove('is-show');
					_toastHideTimer=null;
				},280);
				_toastTimer=null;
			},ms);
		};
		X.toastOk=function(msg,ms){ return X.toast(msg,'ok',ms); };
		X.toastErr=function(msg,ms){ return X.toast(msg,'err',ms); };
		X.toastInfo=function(msg,ms){ return X.toast(msg,'info',ms); };
	}

	// ─── Fld (表单字段基类) ───

/* ==== 31-initFld.js ==== */
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

/* ==== 32-initTextfield.js ==== */
/* XUI component: initTextfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTextfield(){
		X.Textfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Textfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Textfield.prototype, {
			constructor:X.Textfield,
			build(){
				var cfg=this.cfg,self=this,triggers=cfg.triggers;
				if(!triggers||(Array.isArray(triggers)&&!triggers.length)||(typeof triggers==='object'&&!Object.keys(triggers).length)){
					var d=this._mkinp('input');
					d.type=cfg.inputType||'text';
					if(cfg.placeholder)d.placeholder=cfg.placeholder;
					if(this._v!=null)d.value=this._v;
					return d;
				}
				var leftBtns=[],rightBtns=[];
				function eachTrigger(fn){
					var i,t;
					if(Array.isArray(triggers)){
						for(i=0;i<triggers.length;i++)fn(triggers[i],i);
					}else{
						for(var k in triggers){if(triggers.hasOwnProperty(k))fn(triggers[k],k);}
					}
				}
				eachTrigger(function(t){
					if(!t)return;
					var side=t.side||'right';
					var btn=X.CreateDOM(null,{
						x:'button.xtrg-btn'+(side==='left'?'.xtrg-l':'')+(side==='right'?'.xtrg-r':''),
						type:'button',
						html:t.icon||t.text||'',
						title:t.title||'',
						onclick:(function(_t){return function(e){e.stopPropagation();if(_t.handler)_t.handler.call(self);};})(t)
					});
					if(side==='left')leftBtns.push(btn);
					else rightBtns.push(btn);
				});
				var inpCls='xin';
				if(leftBtns.length&&!rightBtns.length)inpCls+=' xin-nol';
				else if(!leftBtns.length&&rightBtns.length)inpCls+=' xin-nor';
				else if(leftBtns.length&&rightBtns.length)inpCls+=' xin-nolr';
				this._inp=X.CreateDOM(null,{
					x:'input',className:inpCls,
					type:cfg.inputType||'text',
					placeholder:cfg.placeholder||'',
					value:this._v!=null?this._v:'',
					oninput:function(){self._fire();}
				});
				if(cfg.readOnly)this._inp.readOnly=true;
				if(cfg.disabled)this._inp.disabled=true;
				var children=[];
				for(var j=0;j<leftBtns.length;j++)children.push(leftBtns[j]);
				children.push(this._inp);
				for(var j=0;j<rightBtns.length;j++)children.push(rightBtns[j]);
				var w=X.CreateDOM(null,{x:'div.xtrgfld',c:children});
				return w;
			},
			getValue(){
				return this._inp?this._inp.value:(this.el?this.el.value:this._v);
			},
			setValue(v){
				this._v=v;
				if(this._inp)this._inp.value=v==null?'':v;
				else if(this.el&&this.el.tagName==='INPUT')this.el.value=v==null?'':v;
			},
		});
		X.reg('textfield', X.Textfield);
	}

	// ─── Numberfield ───

/* ==== 33-initNumberfield.js ==== */
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

/* ==== 34-initTextarea.js ==== */
/* XUI component: initTextarea — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTextarea(){
		X.Textarea = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Textarea.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Textarea.prototype, {
			constructor:X.Textarea,
			build(){
				var d=this._mkinp('textarea');
				if(this.cfg.rows)d.rows=this.cfg.rows;
				if(this._v!=null)d.value=this._v;
				return d;
			},
		});
		X.reg('textarea', X.Textarea);
	}

	// ─── Checkbox ───

/* ==== 35-initCheckbox.js ==== */
/* XUI component: initCheckbox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initCheckbox(){
		X.Checkbox = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Checkbox.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Checkbox.prototype, {
			constructor:X.Checkbox,
			build(){
				var self=this,w=X.CreateDOM(null,{x:'label.xchk',c:[
					{x:'input',type:'checkbox',checked:!!(this.cfg.checked||this._v)},
					{x:'span',c:this.cfg.boxLabel||''}
				]});
				this._inp=w.firstElementChild;
				this._inp.onchange=function(){self._fire();};
				return w;
			},
			getValue(){ return this._inp.checked; },
			setValue(v){ this._v=v;this._inp.checked=!!v; },
		});
		X.reg('checkbox', X.Checkbox);
	}

	// ─── Checkboxgroup ───

/* ==== 36-initCheckboxgroup.js ==== */
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

/* ==== 37-initRadio.js ==== */
/* XUI component: initRadio — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initRadio(){
		X.Radio = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Radio.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Radio.prototype, {
			constructor:X.Radio,
			build(){
				var self=this,w=X.CreateDOM(null,{x:'label.xrad',c:[
					{x:'input',type:'radio',value:this.cfg.inputValue||'',checked:!!this.cfg.checked},
					{x:'span',c:this.cfg.boxLabel||''}
				]});
				this._inp=w.firstElementChild;
				this._inp.name=this.cfg.name||'rad'+X.gid();
				this._inp.onchange=function(){self._fire();};
				return w;
			},
		});
		X.reg('radio', X.Radio);
	}

	// ─── Radiogroup ───

/* ==== 38-initRadiogroup.js ==== */
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

/* ==== 39-initDatefield.js ==== */
/* XUI component: initDatefield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initDatefield(){
		X.Datefield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Datefield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Datefield.prototype, {
			constructor:X.Datefield,
			build(){
				var d=this._mkinp('input');
				d.type='date';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('datefield', X.Datefield);
	}

	// ─── Timefield ───

/* ==== 40-initTimefield.js ==== */
/* XUI component: initTimefield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTimefield(){
		X.Timefield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Timefield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Timefield.prototype, {
			constructor:X.Timefield,
			build(){
				var d=this._mkinp('input');
				d.type='time';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('timefield', X.Timefield);
	}

	// ─── Colorfield ───

/* ==== 41-initColorfield.js ==== */
/* XUI component: initColorfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initColorfield(){
		X.Colorfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Colorfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Colorfield.prototype, {
			constructor:X.Colorfield,
			build(){
				var d=this._mkinp('input');
				d.type='color';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('colorfield', X.Colorfield);
	}

	// ─── Filefield ───

/* ==== 42-initFilefield.js ==== */
/* XUI component: initFilefield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFilefield(){
		X.Filefield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Filefield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Filefield.prototype, {
			constructor:X.Filefield,
			build(){
				var d=this._mkinp('input');
				d.type='file';
				if(this.cfg.accept)d.accept=this.cfg.accept;
				return d;
			},
			getValue(){ return this.el.files; },
		});
		X.reg('filefield', X.Filefield);
	}

	// ─── Displayfield ───

/* ==== 43-initDisplayfield.js ==== */
/* XUI component: initDisplayfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initDisplayfield(){
		X.Displayfield = function(cfg,par){X.Base.call(this,cfg,par);};
		X.Displayfield.prototype=Object.create(X.Base.prototype);
		X.extend(X.Displayfield.prototype, {
			constructor:X.Displayfield,
			build(){ return X.CreateDOM(null,{x:'span.xdsp',c:this.cfg.value||''}); },
			getValue(){ return this.el.textContent; },
			setValue(v){ this.el.textContent=v; },
		});
		X.reg('displayfield', X.Displayfield);
	}

	// ─── Hiddenfield ───

/* ==== 44-initHiddenfield.js ==== */
/* XUI component: initHiddenfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initHiddenfield(){
		X.Hiddenfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Hiddenfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Hiddenfield.prototype, {
			constructor:X.Hiddenfield,
			build(){
				var d=this._mkinp('input');
				d.type='hidden';
				if(this._v!=null)d.value=this._v;
				return d;
			},
		});
		X.reg('hiddenfield', X.Hiddenfield);
	}

	// ─── Sliderfield ───

/* ==== 45-initSliderfield.js ==== */
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

/* ==== 46-initTagfield.js ==== */
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

/* ==== 47-initFormpanel.js ==== */
/* XUI component: initFormpanel — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initFormpanel(){
		X.Formpanel = function(cfg,par){X.Panel.call(this,cfg,par);};
		X.Formpanel.prototype=Object.create(X.Panel.prototype);
		X.extend(X.Formpanel.prototype, {constructor:X.Formpanel});
		X.reg('formpanel', X.Formpanel);
	}

/* ==== 48-initpage.js ==== */
/* XUI component: initpage — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initpage(){
		X.mkpage = function(fn){
			return function(){
				var st={},el=X.CreateDOM(null,{x:'div.xpg'});
				var ctx={st:st,el:el,mk:function(c){var o=X.mk(c);el.appendChild(o.el);return o;},add:function(n){el.appendChild(n);},dom:X.CreateDOM};
				fn(ctx);
				return {st:st,el:el,ctx:ctx};
			};
		};
		X.CreatePage = function(){
			return {destroyed:0,doms:{},destroy:function(){this.destroyed=1;}};
		};
	}

	function loadJs(url) {
		return new Promise(function(resolve) {
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.onload = function() {
				document.body.removeChild(script);
				resolve();
			};
			script.src = url;
			document.body.appendChild(script);
		});
	}

/* ==== 49-initBase.js ==== */
/* XUI component: initBase — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initBase(){
		var Base = function Base(cfg,par){
			this.cfg=cfg||{};
			this.id=this.cfg.id||X.gid();
			this.ch=[];
			this.par=par||null;
			this.el=this.build();
			if(this.cfg.cls)this.el.className+=(this.el.className?' ':'')+this.cfg.cls;
			if(this.cfg.id)this.el.id=this.cfg.id;
			if(this.cfg.height)this.el.style.height=(typeof this.cfg.height==='number'?this.cfg.height+'px':this.cfg.height);
			if(this.cfg.width)this.el.style.width=(typeof this.cfg.width==='number'?this.cfg.width+'px':this.cfg.width);
			var items=this.cfg.items;
			if(items){
			this.ch=X.mks(items,this);
			if(this.cfg.layout!=='table'){
				var bd=this.body()||this.el;
				for(var i=0;i<this.ch.length;i++)bd.appendChild(this.ch[i].el);
			}
			}
			this.init();
			X.mount(this,par,this.cfg.renderTo);
		}
		Base.prototype.body=function(){return this.el;};
		Base.prototype.init=function(){};
		Base.prototype.build=function(){
			return CreateDOM(null,{x:'div'});
		};
		Base.prototype._applyly=function(ly){
			var el=this.body()||this.el,ch=this.ch,i,c,lyel;
			if(ly==='fit'){
				el.classList.add('xly-fit');
				for(i=0;i<ch.length;i++)
					ch[i].el.classList.add('xly-fit-itm');
			}
			else if(ly==='hbox'){
				el.classList.add('xhbox');
				for(i=0;i<ch.length;i++)
					this._applyitm(ch[i],ch[i].cfg);
			}
			else if(ly==='vbox'){
				el.classList.add('xvbox');
				for(i=0;i<ch.length;i++)
					this._applyitm(ch[i],ch[i].cfg);
			}
			else if(ly==='column'){
				el.classList.add('xcolumn');
				for(i=0;i<ch.length;i++)
					{c=ch[i];c.el.classList.add('xcol');this._applyitm(c,c.cfg);}
			}
			else if(ly==='anchor'){
				el.classList.add('xanchor');
				if(!el.style.minHeight&&!this.cfg.height)el.style.minHeight='80px';
				for(i=0;i<ch.length;i++)
					this._applyanc(ch[i],ch[i].cfg);
			}
			else if(ly==='table'){
				el.classList.add('xtbl');
				lyel=CreateDOM(null,{x:'div.xtbl-in'});
				el.appendChild(lyel);
				var maxc=1;
				for(i=0;i<ch.length;i++)
					maxc=Math.max(maxc,(ch[i].cfg.col||0)+(ch[i].cfg.colspan||1));
				lyel.style.gridTemplateColumns='repeat('+maxc+',1fr)';
				for(i=0;i<ch.length;i++)this._applytbl(ch[i],ch[i].cfg,lyel);
			}
			else if(ly==='card'){
				el.classList.add('xcard');
				for(i=0;i<ch.length;i++)
					{c=ch[i];c.el.classList.add('xcitm');if(i===0)c.el.classList.add('act');}
				this._card=0;
			}
		};
		Base.prototype._applyitm=function(c,cfg){
			var e=c.el;
			if(cfg.flex!=null) e.style.flex=cfg.flex;
			if(cfg.width!=null) e.style.width=(typeof cfg.width==='number'?cfg.width+'px':cfg.width);
			if(cfg.height!=null) e.style.height=(typeof cfg.height==='number'?cfg.height+'px':cfg.height);
			if(cfg.margin!=null) e.style.margin=(typeof cfg.margin==='number'?cfg.margin+'px':cfg.margin);
		};
		Base.prototype._applyanc=function(c,cfg){
			var e=c.el,a=cfg.anchor||'100% 100%',p=a.split(/\s+/),s=function(v,k){if(v&&v!=='auto')e.style[k]=/[%px]/.test(v)||isNaN(v)?v:v+'px';};
			e.classList.add('xanc');
			if(p.length===2){e.style.width=p[0];e.style.height=p[1];e.style.left='0';e.style.top='0';}
			else if(p.length===4){s(p[0],'left');s(p[1],'top');s(p[2],'right');s(p[3],'bottom');}
			else{e.style.width=a;e.style.left='0';e.style.top='0';}
		};
		Base.prototype._applytbl=function(c,cfg,lyel){
			lyel.appendChild(CreateDOM(null,{
				x:'div.xtd',
				s:{gridRow:(cfg.row||0)+1,gridColumn:((cfg.col||0)+1)+' / span '+(cfg.colspan||1)},
				c:[c.el]
			}));
		};
		Base.prototype.cardnext=function(){
			if(!this._card&&this._card!==0)return;
			var ch=this.ch,n=(this._card+1)%ch.length;
			ch[this._card].el.classList.remove('act');
			ch[n].el.classList.add('act');
			this._card=n;
		};
		Base.prototype.up=function(sel){
			var p=this.par;
			while(p){
				if(p.cfg.xtype===sel||(p.constructor&&p.constructor.name===sel))return p;
				p=p.par;
			}
			return null;
		};
		return Base;
	}

/* ==== 99-boot.js ==== */
/* XUI component: boot — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	X.extend(X,
		initX()
	);
	CreateDOM = X.CreateDOM;

	initWinMgr();
	initContainer();
	initViewport();
	initTitlebar();
	initStatusbar();
	initBorderlayout();
	initButton();
	initSep();
	initMenu();
	initTree();
	initTabpanel();
	initPanel();
	initFieldset();
	initFieldrow();
	initWindow();
	initBox();
	initlybox();

	initpage();
	initFld();
	initTextfield();
	initNumberfield();
	initTextarea();
	initCheckbox();
	initCheckboxgroup();
	initRadio();
	initRadiogroup();
	initDatefield();
	initTimefield();
	initColorfield();
	initFilefield();
	initDisplayfield();
	initHiddenfield();
	initSliderfield();
	initTagfield();
	initFormpanel();

	initCombo();
	initVirtualgrid();
	initmbox();

	return X;
})(window);
