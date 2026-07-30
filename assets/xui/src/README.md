# XUI 源码（组件拆分）

每个 `init*` 组件一个文件，按 `manifest.json` 顺序合并为上级目录的 `core.js`。

## 开发流程

1. **改这里**：编辑 `src/*.js`（不要手改合并后的 `core.js`）
2. **刷新页面**：`index.php` 会调用 `xui_merge.php`  
   - 若任一源文件 mtime **大于** `core.js` mtime → 自动重新合并  
   - 强制重建：`index.php?xui_force=1` 或访问 `xui_merge.php?force=1`
3. CLI 合并：

```text
php assets/xui/xui_merge.php --force
```

## 文件约定

| 前缀 | 含义 |
|------|------|
| `00-head.js` | IIFE 开头、`X` 对象、`CreateDOM` 声明 |
| `10`…`49` | 各 `initXxx` 组件 |
| `99-boot.js` | 注册/初始化调用、`return X`、IIFE 结束 |

新增组件：增加 `initFoo` 源文件，并写入 `manifest.json` 的 `files` 数组（在 `99-boot.js` 之前），且在 `99-boot.js` 中调用 `initFoo()`。

## 与海滨项目对照

海滨 `GetAllJsPage`：`max(源mtime) > 合并文件mtime` 则重编 `allpage.js`。  
本目录同理，产物为 `core.js`。
