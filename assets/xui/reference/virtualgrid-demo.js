// ─── 虚拟滚动表格页面 ───
// 使用 X.Grid（定义于 modules/base.js）
async function pagevirtualgrid() {
	var TOTAL = 1000000;
	var ROW_H = 28;

	var M = '张伟,王芳,李娜,刘洋,陈静,杨丽,赵敏,黄磊,周杰,吴婷,徐明,孙磊,马超,朱婷,胡兵,郭靖'.split(',');
	var CI = '北京,上海,广州,深圳,杭州,成都,武汉,南京,西安,重庆,天津,苏州,长沙,郑州,东莞,青岛'.split(',');
	var DE = '技术部,市场部,财务部,人事部,运营部,研发部,销售部,客服部,行政部,采购部,法务部,审计部'.split(',');
	var ST = ['在职', '在职', '在职', '在职', '在职', '在职', '离职', '试用'];

	var SE = ['男','女'];

	var el = X.CreateDOM(null, { x: 'div.xpg', s: { overflow: 'hidden', display: 'flex', flexDirection: 'column' } });

	var dataArr = new Array(TOTAL);
	for (var i = 0; i < TOTAL; i++) {
		dataArr[i] = [
			i + 1,
			i % 2,
			i % 2,
			20 + ((i * 7 + 3) % 40),
			CI[(i * 3 + 5) % CI.length],
			DE[(i * 5 + 7) % DE.length],
			5000 + ((i * 131 + 997) % 45000),
			(i * 17 + 31) % 101,
			ST[i % ST.length],
			(i % 3 === 0) ? 1 : 0
		];
	}

	var cols = [
		{ field: 0, t: 'ID',     w: 60,  a: 'center', editable: false },
		{ field: 1, t: '姓名',   w: 85,  editor: { xtype: 'textfield' } },
		{ field: 2, t: '性别',   w: 60,  a: 'center',
			fmt: function(v) { return SE[v] != null ? SE[v] : v; },
			editor: { xtype: 'combo',width:'100%', store: [[0,'男'],[1,'女']], editable: 1 } },
		{ field: 3, t: '年龄',   w: 60,  a: 'right',
			editor: { xtype: 'numberfield', step: 1, minValue: 0, maxValue: 150 },
			parse: function(v, raw) { var n = parseFloat(v); return isNaN(n) ? raw : Math.round(n); } },
		{ field: 4, t: '城市',   w: 80,
			editor: { xtype: 'combo', store: CI, editable: 1 } },
		{ field: 5, t: '部门',   w: 90,
			editor: { xtype: 'combo', store: DE, editable: 1 } },
		{ field: 6, t: '薪资',   w: 100, a: 'right',
			editor: { xtype: 'numberfield', step: 100 },
			fmt: function(v) { return '$' + Number(v).toFixed(0); },
			parse: function(v, raw) { var n = parseFloat(v); return isNaN(n) ? raw : n; } },
		{ field: 9, t: '已选',   w: 50,  a: 'center', editable: false, xtype: 'checkbox',
			render: function(s, v, dom) {
				if(!dom) dom = X.CreateDOM(null, { x: 'label.xvr-chk',c:{x:'input',type:'checkbox'}});
				dom.querySelector('input').checked = !!s;
				return dom;
			}
		},
		{ field: 7, t: '完成度', w: 115, a: 'center',
			editor: { xtype: 'numberfield', step: 1, minValue: 0, maxValue: 100 },
			render: function(s, v, dom) {
				if(!dom) dom = X.CreateDOM(null, { x: '.xvr-pct',c:[{x:'.xvr-pct-bar'},{x:'span'}]});
				dom.querySelector('.xvr-pct-bar').style.width = s + '%';
				dom.querySelector('span').textContent = s + '%';
				return dom;
			},
		},
		{ field: 8, t: '状态',   w: 65,
			editor: { xtype: 'combo', store: ['在职','离职','试用'], editable: false },
			fmt: function(v) {
				if (v === '离职') return '<span style="color:#e81123;font-weight:bold">' + v + '</span>';
				if (v === '试用') return '<span style="color:#e68a00">' + v + '</span>';
				return '<span style="color:#107c10">' + v + '</span>';
			}
		}
	];

	var lv = X.Grid({
		container: el,
		total: TOTAL,
		columns: cols,
		data: dataArr,
		getRowClass: function(r, vp) { return (vp & 1) === 1 ? 'alt' : ''; },
		contextMenu: [
			{text:'Item1',icon:'fa-solid fa-file',handler:function(v,dom){console.log('Item1 clicked',v,dom);}},
			{
				text: '子菜单',
				icon:'fa-solid fa-folder',
				menu: [
					{text:'SubItem1',icon:'fa-solid fa-file-lines',handler:function(v,dom){console.log('SubItem1 clicked',v,dom);}},
					{text:'SubItem2',icon:'fa-solid fa-file-pen',handler:function(v,dom){console.log('SubItem2 clicked',v,dom);}},
					{
						text: '二级子菜单',
						icon:'fa-solid fa-folder-open',
						menu: [
							{text:'SubSub1',icon:'fa-solid fa-code',handler:function(v,dom){console.log('SubSub1 clicked',v,dom);}},
							{text:'SubSub2',icon:'fa-solid fa-bug',handler:function(v,dom){console.log('SubSub2 clicked',v,dom);}},
							{text:'SubSub3',icon:'fa-solid fa-gear',handler:function(v,dom){console.log('SubSub3 clicked',v,dom);}}
						]
					}
				]
			},
			'-',
			{text:'Item3',icon:'fa-solid fa-trash-can',handler:function(v,dom){console.log('Item3 clicked',v,dom);}}
		],
		onContextMenu: function(label, row, col) {
			console.log('Context menu: ' + label + ' at (' + row + ',' + col + ')');
		},
		editable: true,
		sortable: true,
		toolbar: true,
		statusBar: true,
		rowHeight: ROW_H,
		buffer: 15,
		clicksToEdit:1,
	});

	return {
		el:el,
		lv:lv,
		destroy: function() { lv.destroy(); }
	};
}
