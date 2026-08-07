# sqlmnger

轻量 Web 数据库管理（MySQL / SQLite / SQL Server），交互参考 Adminer。

**版本**：v1.0.4 · **状态**：可运行原型 / 接近 MVP 主体

> English: [README.md](README.md) · 变更：[CHANGELOG.md](CHANGELOG.md)

![sqlmnger 截图](docs/1.png)

## 1. 核心特性

1. **三引擎、五驱动** — MySQL · SQLite · SQL Server（微软 PHP 扩展、**纯 PHP 实现的 SQL Server 连接**，**或** Windows 上的 **.NET 辅助 CLI**，免装 PHP 扩展）。
2. **运行时零 Composer** — 兼容 PHP **≥ 5.5.12**，拷贝即用；Web 根 = 项目根。
3. **全站 SPA + AJAX JSON** — 登录 / 树 / 表格 / SQL / 导入导出均无整页回帖；登录后凭证在服务端 **Session Vault**，不反复明文回传。
4. **大表可用** — 一次拉取多行，**VirtualGrid** 只渲染可视区；脏格编辑、Ctrl+Enter 提交、客户端列筛选。
5. **改表即草稿** — 拖拽排序 / 增删列，**先预览 SQL**，只对**有变更**的列生成 ALTER（外加增删）。
6. **真·多连接** — 多个浏览器 Tab 可同时连不同引擎/主机；连接 ID 写在 URL（`?c=`）。
7. **页内导出导入** — 表级 SQL/CSV/XLSX/JSON；**库级** dump / 导入（SQL/CSV/TSV、gzip SQL），不必另开工具。
8. **更稳妥的 SQL 控制台** — 应用层拆多语句；**危险 SQL** 二次确认；可选 `storage/logs/` 审计日志。
9. **前端轻量** — 普通 JS 模块，无 React / Vue / jQuery，也无需 npm 构建即可改业务脚本。

## 2. 功能清单

### 连接与导航

- **登录**：选择引擎 / 主机 / 账号密码（可配置允许空密码）→ Session 凭证 Vault 加密
- **连接配置**：登录页可保存多条连接（`localStorage`）；可选记住密码（**仅前端混淆，非加密**）
- **引擎**
  - MySQL — PDO MySQL
  - SQLite — PDO SQLite（路径限制在 `sqlite_root`）
  - SQL Server（扩展）— 微软 PHP SQL Server 扩展
  - SQL Server（纯 PHP）— **纯 PHP 实现的 SQL Server 连接**（无需微软扩展；可选加密）
  - SQL Server（.NET CLI）— Windows 助手进程 `bin/SqlmngerMsCli.exe`（.NET 4.8 SqlClient，Schannel TLS 1.2）；常驻单例 TCP 服务：PHP 需要时启动，多请求共用同一进程，无连接 60 秒后自动退出（可配 `mssql_net_idle_sec`）
  - Oracle（.NET CLI）— 同一 `SqlmngerMsCli` 进程（`engine=oracle`，exe 旁需 `Oracle.ManagedDataAccess.dll` 及其依赖 DLL）；登录以 **Service Name** 为主（`host:port/service`，默认端口 1521）；驱动 `oracle_net` 支持库表浏览 / SQL / 分页网格与增删改
- **多 Tab 多连接**：连接 ID 写入 URL `?c=…`
- **库 / 表**：顶栏可过滤选库；左侧表树（**右键**：查看数据 / 结构 / 修改结构）
- **Hash 路由**：恢复活动表、WHERE、排序、LIMIT、页码，以及 **模式**（`m=struct` / `m=alter`）
- **多语言**：**中文 / English / 日本語 / 한국어** — 登录页与主界面顶栏**下拉**切换（`localStorage` 记忆）

### 表数据

- **VirtualGrid**：虚拟滚动、脏格、提交 / Ctrl+Enter、增删、WHERE + LIMIT + 分页
- **编辑**：工具栏「修改」，或 **Ctrl+点击**（Mac：Cmd+点击）单元格直接进入修改模式并编辑
- **取消修改**：不再二次确认；有脏数据时重载丢弃
- **勾选行**：整行高亮
- **客户端筛选**：底栏「筛选」展开列筛选；**关闭筛选行时清空列筛选**（全列搜索保留）
- **全列搜索**：底栏，位于统计文案（显示行 / 选择 / 合计 / 平均）右侧
- **导出**（表格底栏右下）：SQL / CSV / XLSX / JSON — 打开预览、下载、导出 zip；范围本页 / 筛选全部

### 表结构

- 显示结构 · **改表**草稿（拖拽排序、在上方插入列、提交时删除）
- 类型 / 默认值 **combobox**（输入过滤 + 匹配高亮；可手输）
- 默认值：字符串带引号，与 `NULL` / 函数区分
- **预览 SQL**（不写库）；仅对 **有变更** 的列生成 `ALTER`（外加增删）
- 索引（即时写库）· 新建表弹窗

### 库级导入 / 导出

在 **数据库概览** 页工具栏：

- **导出**（`api/db_export.php`）：SQL / CSV / TSV；打开 / 保存 / ZIP；按表勾选结构与数据；可选 DROP+CREATE、自动增量、触发器、存储过程/函数、事件；数据模式 INSERT / INSERT IGNORE / REPLACE / 不导出
- **导入**（`api/db_import.php`）：上传 `.sql` / `.sql.gz`（或 JSON 正文）；多语句拆分执行；出错停止；体积与语句数上限

### SQL 命令

- **多语句**脚本（应用层拆分；批量结果；遇错停止）
- **危险 SQL 二次确认**（DROP / TRUNCATE / 无 WHERE 的 DELETE·UPDATE 等；由 `sql_require_danger_confirm` 控制）
- **结果导出**：SQL / CSV / TSV / JSON — 预览、下载、ZIP
- 默认行数由 `default_sql_limit` 控制（`0` 表示不自动加 LIMIT）

### 其它

- **服务器**管理页（权限 / 进程 / 变量 / 状态，按引擎尽力）
- 可选 **操作审计日志**（`log_operations` → `storage/logs/` 下 JSON 行）
- 全站 **AJAX + JSON**

## 环境要求

- PHP **5.5.12+**
- 按需扩展：
  - MySQL：`pdo_mysql`
  - SQLite：`pdo_sqlite`
  - SQL Server（扩展路径）：微软 SQL Server PHP 扩展
  - SQL Server（纯 PHP 连接）：仅需 PHP 自带网络能力；若开启加密建议有 **openssl**
- 导出 XLSX / 多文件 ZIP 需要 `ZipArchive`
- 导入 `.sql.gz` 需要 `gzdecode`（可选）

## 快速运行

Web 文档根指向**项目根目录**（含 `index.php`），或：

```bash
php -S 127.0.0.1:8080 -t .
```

浏览器打开后若脚本有更新，请 **Ctrl+F5** 强刷。

```text
sqlmnger/
├── index.php              # 入口
├── api/                   # JSON API
│   └── tds/               # 纯 PHP 实现的 SQL Server 连接
├── assets/
│   ├── css/               # 业务样式
│   ├── js/                # 业务模块（sqlmnger.*.js）
│   ├── favicon.*
│   └── xui/               # 界面资源（布局 / 表格 / 弹窗等，一般无需改）
├── config/                # config.php（勿提交密钥）
├── docs/
├── storage/
│   ├── logs/              # 审计日志（内容默认忽略）
│   └── sqlite/            # SQLite jail
└── tmp/                   # 本地临时（默认忽略）
```

> **v1.0.2+**：原 `public/` 下内容已提升到项目根，部署时文档根改为项目根即可。

## 配置

```bash
cp config/config.example.php config/config.php
```

| 键 | 说明 |
|----|------|
| `app_key` | 凭证加密密钥（≥32 字符），**生产务必修改** |
| `debug` | 登录失败是否返回 detail |
| `allow_empty_password` | 是否允许空密码登录（本地开发常用） |
| `session_ttl` | Cookie 秒数（默认 7 天） |
| `enabled_drivers` | MySQL / SQLite / SQL Server（扩展）/ SQL Server（纯 PHP）/ SQL Server（.NET CLI） |
| `mssql_net_idle_sec` | .NET CLI 无客户端连接后自动退出秒数（默认 60；`mssql_net` 与 `oracle_net` 共用） |
| `sqlite_root` | SQLite 路径 jail |
| `default_table_limit` / `default_sql_limit` | 默认行数（`0` = 不限 / 不自动 LIMIT） |
| `max_fetch_rows` / `unlimited_soft_max` | 上限 / 不限时软顶 |
| `login_max_attempts` / `login_window_sec` | 登录限流 |
| `sql_require_danger_confirm` | 危险 SQL 是否要求二次确认 |
| `log_operations` / `log_path` | 操作审计日志 |
| 纯 PHP SQL Server 加密 | 加密模式：自动 / 强制 / 关闭 |
| 纯 PHP SQL Server 信任证书 | 是否信任服务器证书（自签/内网） |
| `import_max_bytes` / `import_max_statements` | 导入体积 / 语句数上限 |
| `sql_exec_max_statements` | SQL 命令页单次最大语句数 |

代码读取：`sqlmnger_cfg('key', $default)`。

**请勿把真实密钥、密码提交到公开仓库。** 以 `config.example.php` 为模板。

## 语言

| 代码 | 界面 |
|------|------|
| `zh` | 中文 |
| `en` | English |
| `ja` | 日本語 |
| `ko` | 한국어 |

保存在 `localStorage` 的 `sqlmnger_lang`。词条见 `assets/js/sqlmnger.i18n.js`（部分次要页面仍有硬编码中文，可逐步补全）。

## Hash 示例

```text
#v=1&k=t&db=mydb&t=mytable&l=10000
#v=1&k=t&db=mydb&t=mytable&m=struct
#v=1&k=t&db=mydb&t=mytable&m=alter
#v=1&k=sql&db=mydb
#v=1&k=server
```

表页签标题：同一库只显示表名；打开多个库的表时显示 `库.表`。

## 主要 API（`api/` 目录）

| 端点 | 说明 |
|------|------|
| `auth_login` / `auth_logout` / `auth_me` | 登录会话；多连接靠 `c` |
| `db_list` / `db_select` / `db_create` / `db_overview` | 库 |
| `db_export` / `db_import` | 库级导出 / SQL 导入 |
| `table_list` / `table_data` / `table_structure` / `table_export` | 表与行导出 |
| `table_row_save` / `table_row_insert` / `table_row_delete` | 行 CRUD |
| `table_column`（`apply` / **`preview`**）/ `table_index` | 列 / 索引 |
| `sql_exec` | 执行 SQL（单条或批量） |
| `server_info` / `server_admin` | 服务器 |
| `ping` | 健康检查 |

## 安全提示

- 生产修改 `app_key`，`debug=false`
- 建议 HTTPS 与最小权限数据库账号
- 公网部署将 `allow_empty_password` 设为 `false`
- SQLite 文件仅允许在 `sqlite_root` 内
- 浏览器保存的登录密码仅为**混淆**，共享电脑勿勾选记住密码
- 纯 PHP 的 SQL Server 连接：内网可信任服务器证书；生产环境请收紧证书校验
- 审计日志与真实 `config.php` 不要提交到公开仓库

## 开发说明

- 业务前端在 `assets/js/`，**IIFE** 全局模块（`SqlmngerApp`、`SqlmngerTablePage`、`SqlmngerDbIO` 等），日常改功能不必上打包工具
- 布局 / 网格 / 对话框等壳层资源在 `assets/xui/`，一般不用动
- 一次性脚本与备份放 `tmp/`（默认被 git 忽略）；协作约定见根目录 `AGENTS.md`（若有）

## 许可

内部项目使用，除非另行说明。
