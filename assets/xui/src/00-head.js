/* XUI component: head — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
window.pr = console.log;
X = (function(w){
	var X={
		extend(){
			var o=arguments[0],i,vobj,k;
			for(i=1;i<arguments.length;i++){
			vobj=arguments[i];
			if(vobj)for(k in vobj)o[k]=vobj[k];
			}
			return o;
		},
	};
	var CreateDOM;
