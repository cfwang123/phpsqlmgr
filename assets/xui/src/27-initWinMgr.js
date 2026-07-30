/* XUI component: initWinMgr — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initWinMgr(){
		function WinMgr(){this._wins=[];}
		WinMgr.prototype={
			create(cfg){
				var win=X.mk(cfg);
				win._z=this._nextZ();
				win.el.style.zIndex=win._z;
				win._mgr=this;
				document.body.appendChild(win.el);
				// Default positioning - center window
				if(cfg.left==null&&cfg.top==null){
					var w=parseInt(win.el.style.width)||400,h=parseInt(win.el.style.height)||300;
					win.el.style.left=Math.max(0,(window.innerWidth-w)/2)+'px';
					win.el.style.top=Math.max(0,(window.innerHeight-h)/2)+'px';
				}
				if(cfg.modal&&win.enableModal)win.enableModal(win._z);
				this._wins.push(win);
				return win;
			},
			_remove(win){
				var idx=this._wins.indexOf(win);
				if(idx>-1)this._wins.splice(idx,1);
			},
			_nextZ(){
				var max=1000,i;
				for(i=0;i<this._wins.length;i++){var z=parseInt(this._wins[i].el.style.zIndex)||0;if(z>max)max=z;}
				return max+1;
			},
		};
		X.WinMgr=new WinMgr();
	}

	// ─── Box ─── 通用 HTML 容器
