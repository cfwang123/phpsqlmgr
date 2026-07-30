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
