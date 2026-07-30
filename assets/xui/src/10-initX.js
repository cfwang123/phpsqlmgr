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
