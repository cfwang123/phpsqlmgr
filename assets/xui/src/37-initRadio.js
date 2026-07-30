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
