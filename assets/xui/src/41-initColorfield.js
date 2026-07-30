/* XUI component: initColorfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initColorfield(){
		X.Colorfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Colorfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Colorfield.prototype, {
			constructor:X.Colorfield,
			build(){
				var d=this._mkinp('input');
				d.type='color';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('colorfield', X.Colorfield);
	}

	// ─── Filefield ───
