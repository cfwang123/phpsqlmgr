# SqlmngerMsCli（.NET Framework 4.8）

常驻单例服务，供 PHP **`mssql_net`** 驱动调用。`System.Data.SqlClient` + Schannel。

## 行为

1. **单例**：`Mutex Local\SqlmngerMsCli_v1`，多 PHP 请求共用一个进程  
2. **端口**：`127.0.0.1` 随机端口，写入 `--port-file`（默认由 PHP 指定 `storage/run/SqlmngerMsCli.port`）  
3. **协议**：TCP 上每行一条 JSON（connect / query / close / quit / ping）  
4. **连接池**：进程内按连接串缓存 `SqlConnection`，请求结束 `close` 归还  
5. **空闲退出**：**无任何 TCP 客户端** 连续 `--idle` 秒（默认 **10**）后进程退出并删除 port 文件  

## 编译

```bat
C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe tools\SqlmngerMsCli\SqlmngerMsCli.csproj /p:Configuration=Release
copy /Y tools\SqlmngerMsCli\bin\Release\SqlmngerMsCli.exe bin\SqlmngerMsCli.exe
```

远程需 **.NET Framework 4.8**，并发布 `bin/SqlmngerMsCli.exe`。

## 参数

| 参数 | 说明 |
|------|------|
| `--port-file path` | 写入端口与 PID |
| `--idle 10` | 无连接空闲退出秒数 |
| `--once` | 调试：stdin 单次 JSON |

## PHP

`api/tds/MssqlNetClient.php`：先读 port 文件并 `fsockopen`；失败再 `start /B` 启动 CLI。  
`disconnect` 只关 TCP，不杀进程。
