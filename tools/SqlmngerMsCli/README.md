# SqlmngerMsCli（.NET Framework 4.8）

常驻单例服务，供 PHP **`mssql_net`** / **`oracle_net`** 驱动调用。

- SQL Server：`System.Data.SqlClient` + Schannel  
- Oracle：同进程 `Oracle.ManagedDataAccess`（需随 exe 发布 `Oracle.ManagedDataAccess.dll`）

请求 JSON 字段 `engine`：`mssql`（默认）或 `oracle`。旧客户端不传则仍按 SQL Server。

## 行为

1. **单例**：`Mutex Local\SqlmngerMsCli_v1`，多 PHP 请求共用一个进程  
2. **端口**：`127.0.0.1` 随机端口，写入 `--port-file`（默认由 PHP 指定 `storage/run/SqlmngerMsCli.port`）  
3. **协议**：TCP 上每行一条 JSON（connect / query / close / quit / ping）；`connect`/`query` 可带 `engine`  
4. **连接池**：进程内按 `engine`+连接串缓存 `IDbConnection`，请求结束 `close` 归还  
5. **空闲退出**：**无任何 TCP 客户端** 连续 `--idle` 秒（默认 **60**）后进程退出并删除 port 文件  

## 编译

`tools/SqlmngerMsCli/lib/` 下的 **dll 不进 Git**（见根目录 `.gitignore`）。编译 Oracle 前请自行放入：

- `Oracle.ManagedDataAccess.dll`（4.122.x，.NET Framework）
- 及传递依赖：`System.Buffers` / `System.Memory` / `System.Numerics.Vectors` / `System.Runtime.CompilerServices.Unsafe` / `System.Threading.Tasks.Extensions` / `System.Diagnostics.DiagnosticSource` / `System.Formats.Asn1` / `System.Text.Encodings.Web` / `System.Text.Json`

然后：

```bat
slx SqlmngerMsCli rebuild
```

或：

```bat
C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe tools\SqlmngerMsCli\SqlmngerMsCli.csproj /p:Configuration=Release
```

发布目录需同时包含：

- `bin/SqlmngerMsCli.exe`
- `bin/SqlmngerMsCli.exe.config`（bindingRedirect）
- `bin/Oracle.ManagedDataAccess.dll`
- 上述 Oracle 传递依赖（与 exe 同目录）

远程需 **.NET Framework 4.8**。`slx SqlmngerMsCli rebuild` 会把上述文件同步到项目根 `bin/`。

## Oracle 连接

- 以 **Service Name** 为主：`Data Source=host:port/service`（`database` 字段 = Service Name；默认端口 **1521**）
- 可选协议字段 `sid`（一般 UI 不用）
- 空闲配置仍用 `mssql_net_idle_sec`（对整个 CLI 进程全局生效）

## 参数

| 参数 | 说明 |
|------|------|
| `--port-file path` | 写入端口与 PID |
| `--idle 60` | 无连接空闲退出秒数 |
| `--once` | 调试：stdin 单次 JSON |

## PHP

`api/tds/MssqlNetClient.php`：`SqlmngerMssqlNetClient::create('mssql'|'oracle')`；先读 port 文件并 `fsockopen`；失败再 `start /B` 启动 CLI。  
`disconnect` 只关 TCP，不杀进程。
