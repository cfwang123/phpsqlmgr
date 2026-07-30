/* XUI component: boot — 由 split_xui.py 从 core.js 拆分，请改此源文件后由 PHP 合并 */
	X.extend(X,
		initX()
	);
	CreateDOM = X.CreateDOM;

	initWinMgr();
	initContainer();
	initViewport();
	initTitlebar();
	initStatusbar();
	initBorderlayout();
	initButton();
	initSep();
	initMenu();
	initTree();
	initTabpanel();
	initPanel();
	initFieldset();
	initFieldrow();
	initWindow();
	initBox();
	initlybox();

	initpage();
	initFld();
	initTextfield();
	initNumberfield();
	initTextarea();
	initCheckbox();
	initCheckboxgroup();
	initRadio();
	initRadiogroup();
	initDatefield();
	initTimefield();
	initColorfield();
	initFilefield();
	initDisplayfield();
	initHiddenfield();
	initSliderfield();
	initTagfield();
	initFormpanel();

	initCombo();
	initVirtualgrid();
	initmbox();

	return X;
})(window);
