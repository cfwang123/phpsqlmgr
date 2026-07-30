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
