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
