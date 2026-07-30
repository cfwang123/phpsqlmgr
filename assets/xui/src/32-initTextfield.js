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
