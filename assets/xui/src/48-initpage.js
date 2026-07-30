/* XUI component: initpage — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	function initpage(){
		X.mkpage = function(fn){
			return function(){
				var st={},el=X.CreateDOM(null,{x:'div.xpg'});
				var ctx={st:st,el:el,mk:function(c){var o=X.mk(c);el.appendChild(o.el);return o;},add:function(n){el.appendChild(n);},dom:X.CreateDOM};
				fn(ctx);
				return {st:st,el:el,ctx:ctx};
			};
		};
		X.CreatePage = function(){
			return {destroyed:0,doms:{},destroy:function(){this.destroyed=1;}};
		};
	}

	function loadJs(url) {
		return new Promise(function(resolve) {
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.onload = function() {
				document.body.removeChild(script);
				resolve();
			};
			script.src = url;
			document.body.appendChild(script);
		});
	}
