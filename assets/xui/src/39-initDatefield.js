/* XUI component: initDatefield — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initDatefield(){
		X.Datefield = function(cfg,par){X.Fld.call(this,cfg,par);};
		X.Datefield.prototype=Object.create(X.Fld.prototype);
		X.extend(X.Datefield.prototype, {
			constructor:X.Datefield,
			build(){
				var d=this._mkinp('input');
				d.type='date';
				if(this._v)d.value=this._v;
				return d;
			},
		});
		X.reg('datefield', X.Datefield);
	}

	// ─── Timefield ───
