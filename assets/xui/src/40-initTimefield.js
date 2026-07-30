/* XUI component: initTimefield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initTimefield(){
		X.Timefield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Timefield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Timefield.prototype, {
			constructor:X.Timefield,
			build(){
				var d=this._mkinp('input');
				d.type='time';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('timefield', X.Timefield);
	}

	// ─── Colorfield ───
