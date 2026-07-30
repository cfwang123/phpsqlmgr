/* XUI component: initHiddenfield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initHiddenfield(){
		X.Hiddenfield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Hiddenfield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Hiddenfield.prototype, {
			constructor:X.Hiddenfield,
			build(){
				var d=this._mkinp('input');
				d.type='hidden';
				if(this._v!=null)d.value=this._v;
				return d;
			},
		});
		X.reg('hiddenfield', X.Hiddenfield);
	}

	// ─── Sliderfield ───
