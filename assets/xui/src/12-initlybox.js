/* XUI component: initlybox — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initlybox(){
		// ─── lybox layout helpers ───
		function lybox(ly){
			function Box(cfg,par){cfg.layout=ly;X.Container.call(this,cfg,par);}
			Box.prototype=Object.create(X.Container.prototype);
			X.extend(Box.prototype, {constructor:Box});
			return Box;
		}
		X.reg('fit',lybox('fit'));
		X.reg('hbox',lybox('hbox'));
		X.reg('vbox',lybox('vbox'));
		X.reg('column',lybox('column'));
		X.reg('anchor',lybox('anchor'));
		X.reg('table',lybox('table'));
		X.reg('card',lybox('card'));
	}

	// ─── Container ───
