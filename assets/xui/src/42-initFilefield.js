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
