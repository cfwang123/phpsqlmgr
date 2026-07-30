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
