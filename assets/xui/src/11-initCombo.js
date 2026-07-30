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
