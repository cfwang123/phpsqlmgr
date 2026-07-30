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
