/*
 * SqlmngerMsCli — .NET Framework 4.8 常驻服务
 *
 * - 单例：同机仅一个实例（Mutex）
 * - 监听 127.0.0.1 随机端口，写 port 文件；stdout: READY <port>
 * - 多客户端并发 TCP，每连接内 NDJSON；进程内可按连接串缓存 SqlConnection
 * - 无活动连接满 idle 秒（默认 10）后自动退出
 *
 * 参数：
 *   --port-file <path>   写入端口号的文件（PHP 读取）
 *   --idle <sec>         无连接空闲退出秒数，默认 60
 *   --once               旧：stdin 单次 JSON 后退出
 */
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace SqlmngerMsCli
{
	internal static class Program
	{
		private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
		private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);
		private static readonly object Gate = new object();

		private static int idleSec = 60;
		private static string portFile = "";
		private static int activeClients;
		private static DateTime lastActivityUtc = DateTime.UtcNow;
		private static volatile bool shuttingDown;

		// 连接池：连接串 -> 包装（简单复用，减少 Open）
		private static readonly Dictionary<string, PoolEntry> Pool = new Dictionary<string, PoolEntry>(StringComparer.Ordinal);

		private sealed class PoolEntry
		{
			public SqlConnection Conn;
			public bool Tls;
			public DateTime LastUseUtc;
		}

		private static int Main(string[] args)
		{
			bool once = false;
			for (int i = 0; i < args.Length; i++)
			{
				string a = args[i];
				if (string.Equals(a, "--once", StringComparison.OrdinalIgnoreCase))
					once = true;
				else if (string.Equals(a, "--idle", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
				{
					int.TryParse(args[++i], out idleSec);
					if (idleSec < 2) idleSec = 2;
					if (idleSec > 600) idleSec = 600;
				}
				else if (string.Equals(a, "--port-file", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
					portFile = args[++i];
			}

			try
			{
				if (once)
					return RunOnce();
				return RunServer();
			}
			catch (Exception ex)
			{
				try { Console.Error.WriteLine(ex.ToString()); } catch { }
				return 1;
			}
			finally
			{
				ClearPool();
				TryDeletePortFile();
			}
		}

		private static int RunServer()
		{
			bool created;
			// 本机用户会话内单例，避免多 PHP 请求各起一个进程
			using (var mutex = new Mutex(true, "Local\\SqlmngerMsCli_v1", out created))
			{
				if (!created)
				{
					// 已有实例：直接退出，PHP 会连已有 port
					return 0;
				}

				var listener = new TcpListener(IPAddress.Loopback, 0);
				listener.Start();
				int port = ((IPEndPoint)listener.LocalEndpoint).Port;
				WritePort(port);
				WriteStdoutReady(port);
				TouchActivity();

				// 异步 Accept：避免 Thread.Sleep 受 Windows 15.6ms 时钟粒度影响导致建连变慢
				IAsyncResult acceptAr = null;
				try
				{
					acceptAr = listener.BeginAcceptTcpClient(null, null);
					while (!shuttingDown)
					{
						// 最多等 200ms 做一次空闲检查；有连接时 WaitOne 立即返回
						bool signaled = acceptAr.AsyncWaitHandle.WaitOne(200);
						if (signaled)
						{
							TcpClient client = null;
							try
							{
								client = listener.EndAcceptTcpClient(acceptAr);
							}
							catch
							{
								if (shuttingDown) break;
							}
							// 立刻挂起下一次 Accept，减少漏接
							try { acceptAr = listener.BeginAcceptTcpClient(null, null); }
							catch { if (shuttingDown) break; }

							if (client != null)
							{
								client.NoDelay = true;
								try { client.Client.NoDelay = true; } catch { }
								Interlocked.Increment(ref activeClients);
								TouchActivity();
								ThreadPool.QueueUserWorkItem(state =>
								{
									var c = (TcpClient)state;
									try { HandleClient(c); }
									catch { }
									finally
									{
										try { c.Close(); } catch { }
										Interlocked.Decrement(ref activeClients);
										TouchActivity();
									}
								}, client);
							}
							continue;
						}

						// 超时：空闲退出 + 扫池
						if (Volatile.Read(ref activeClients) == 0)
						{
							double idle = (DateTime.UtcNow - lastActivityUtc).TotalSeconds;
							if (idle >= idleSec)
							{
								shuttingDown = true;
								break;
							}
						}
						SweepPool();
					}
				}
				finally
				{
					try { listener.Stop(); } catch { }
					// 解除可能挂起的 BeginAccept
					try
					{
						if (acceptAr != null && !acceptAr.IsCompleted)
						{
							// Stop 后 End 会抛，忽略
							try { listener.EndAcceptTcpClient(acceptAr); } catch { }
						}
					}
					catch { }
					ClearPool();
					TryDeletePortFile();
				}

				// 持有 mutex 直到退出
				GC.KeepAlive(mutex);
				return 0;
			}
		}

		private static void HandleClient(TcpClient client)
		{
			using (client)
			using (NetworkStream ns = client.GetStream())
			using (var reader = new StreamReader(ns, Utf8NoBom, false, 8192, true))
			using (var writer = new StreamWriter(ns, Utf8NoBom, 8192, true) { AutoFlush = true, NewLine = "\n" })
			{
				// 本 TCP 会话上「逻辑会话」持有的连接键（disconnect 时归还池）
				string heldKey = null;
				SqlConnection heldConn = null;
				bool heldTls = false;

				string line;
				while ((line = reader.ReadLine()) != null)
				{
					TouchActivity();
					line = line.Trim();
					if (line.Length == 0) continue;

					Dictionary<string, object> req;
					try { req = Json.Deserialize<Dictionary<string, object>>(line); }
					catch (Exception ex)
					{
						WriteLine(writer, ErrDict("bad_json", ex.Message, false));
						continue;
					}
					if (req == null)
					{
						WriteLine(writer, ErrDict("bad_json", "null", false));
						continue;
					}

					string op = GetStr(req, "op", "").ToLowerInvariant();
					if (op == "quit" || op == "exit")
					{
						// 客户端退出连接，不关闭服务端进程
						WriteLine(writer, OkEmpty(heldTls));
						break;
					}
					if (op == "ping")
					{
						var p = OkEmpty(heldTls);
						p["pong"] = true;
						p["server"] = true;
						p["active_clients"] = Volatile.Read(ref activeClients);
						WriteLine(writer, p);
						continue;
					}
					if (op == "shutdown")
					{
						// 可选：显式关服务
						WriteLine(writer, OkEmpty(false));
						shuttingDown = true;
						break;
					}
					if (op == "connect" || op == "open")
					{
						// 释放本会话旧连接回池
						ReleaseHeld(ref heldKey, ref heldConn, ref heldTls);
						Dictionary<string, object> cr = OpenForSession(req, out heldKey, out heldConn, out heldTls);
						WriteLine(writer, cr);
						continue;
					}
					if (op == "query" || op == "exec")
					{
						if (heldConn == null || heldConn.State != ConnectionState.Open)
						{
							ReleaseHeld(ref heldKey, ref heldConn, ref heldTls);
							Dictionary<string, object> cr = OpenForSession(req, out heldKey, out heldConn, out heldTls);
							if (!IsTrue(cr, "ok"))
							{
								WriteLine(writer, cr);
								continue;
							}
						}
						WriteLine(writer, ExecQuery(heldConn, heldTls, req));
						continue;
					}
					if (op == "close")
					{
						ReleaseHeld(ref heldKey, ref heldConn, ref heldTls);
						WriteLine(writer, OkEmpty(false));
						continue;
					}
					WriteLine(writer, ErrDict("bad_op", "未知 op: " + op, heldTls));
				}

				ReleaseHeld(ref heldKey, ref heldConn, ref heldTls);
			}
		}

		private static Dictionary<string, object> OpenForSession(
			Dictionary<string, object> req,
			out string key,
			out SqlConnection conn,
			out bool tls)
		{
			key = null;
			conn = null;
			tls = false;
			string cs;
			bool encryptUsed;
			string err;
			if (!TryBuildCs(req, out cs, out encryptUsed, out err))
				return ErrDict("connect", err, false);

			int timeout = GetInt(req, "timeout", 15);
			if (timeout < 1) timeout = 15;

			// 先从池取（进程内复用，避免每次 PHP 请求都 SqlConnection.Open）
			lock (Gate)
			{
				PoolEntry pe;
				if (Pool.TryGetValue(cs, out pe) && pe.Conn != null)
				{
					if (pe.Conn.State == ConnectionState.Open)
					{
						key = cs;
						conn = pe.Conn;
						tls = pe.Tls;
						Pool.Remove(cs);
						pe.LastUseUtc = DateTime.UtcNow;
						var ok = OkEmpty(tls);
						// 池命中不查版本（PHP 侧会缓存首次 connect 的 server_version）
						ok["server_version"] = "";
						ok["tls"] = tls;
						ok["pooled"] = true;
						return ok;
					}
					try { pe.Conn.Dispose(); } catch { }
					Pool.Remove(cs);
				}
			}

			try
			{
				var c = new SqlConnection(cs);
				c.Open();
				// 仅冷连接查一次版本；need_version=false 时可跳过额外往返
				string ver = "";
				bool needVer = GetBool(req, "need_version", true);
				if (needVer)
				{
					using (var cmd = new SqlCommand("SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(32))", c))
					{
						cmd.CommandTimeout = timeout;
						object o = cmd.ExecuteScalar();
						if (o != null && o != DBNull.Value) ver = Convert.ToString(o);
					}
				}
				key = cs;
				conn = c;
				tls = encryptUsed;
				var resp = OkEmpty(tls);
				resp["server_version"] = ver;
				resp["tls"] = encryptUsed;
				resp["pooled"] = false;
				return resp;
			}
			catch (Exception ex)
			{
				string encMode = GetStr(req, "encrypt", "auto").ToLowerInvariant();
				if (encMode == "auto" && encryptUsed)
				{
					req["encrypt"] = "disable";
					return OpenForSession(req, out key, out conn, out tls);
				}
				return ErrDict("connect", ex.Message, false);
			}
		}

		private static void ReleaseHeld(ref string key, ref SqlConnection conn, ref bool tls)
		{
			if (conn == null)
			{
				key = null;
				tls = false;
				return;
			}
			// 连接仍可用则放回池，否则丢掉
			if (!string.IsNullOrEmpty(key) && conn.State == ConnectionState.Open)
			{
				lock (Gate)
				{
					// 池内已有同 key 则关当前
					if (Pool.ContainsKey(key))
					{
						try { conn.Close(); } catch { }
						try { conn.Dispose(); } catch { }
					}
					else
					{
						Pool[key] = new PoolEntry
						{
							Conn = conn,
							Tls = tls,
							LastUseUtc = DateTime.UtcNow
						};
					}
				}
			}
			else
			{
				try { conn.Close(); } catch { }
				try { conn.Dispose(); } catch { }
			}
			key = null;
			conn = null;
			tls = false;
		}

		private static Dictionary<string, object> ExecQuery(SqlConnection conn, bool tls, Dictionary<string, object> req)
		{
			string sql = GetStr(req, "sql", "");
			if (string.IsNullOrEmpty(sql))
				return ErrDict("sql", "缺少 sql", tls);

			int timeout = GetInt(req, "timeout", 60);
			if (timeout < 1) timeout = 60;

			// row_format=array（默认）：rows 为二维数组，JSON 更小更快；object 兼容旧字典行
			string rowFmt = GetStr(req, "row_format", "array").ToLowerInvariant();
			bool asArray = rowFmt != "object" && rowFmt != "dict";

			try
			{
				if (conn.State != ConnectionState.Open)
					conn.Open();

				using (var cmd = new SqlCommand(sql, conn))
				{
					cmd.CommandTimeout = timeout;
					var cols = new List<string>();
					var rowsArr = asArray ? new List<object[]>(64) : null;
					var rowsDict = asArray ? null : new List<Dictionary<string, object>>(64);
					int affected = 0;
					int fieldCount = 0;

					using (var reader = cmd.ExecuteReader())
					{
						do
						{
							if (reader.FieldCount > 0)
							{
								if (cols.Count == 0)
								{
									fieldCount = reader.FieldCount;
									for (int i = 0; i < fieldCount; i++)
										cols.Add(reader.GetName(i));
								}
								while (reader.Read())
								{
									if (asArray)
									{
										var cells = new object[fieldCount];
										for (int i = 0; i < fieldCount; i++)
										{
											object v = reader.IsDBNull(i) ? null : reader.GetValue(i);
											cells[i] = NormalizeCell(v);
										}
										rowsArr.Add(cells);
									}
									else
									{
										var row = new Dictionary<string, object>(fieldCount);
										for (int i = 0; i < fieldCount; i++)
										{
											string name = i < cols.Count ? cols[i] : reader.GetName(i);
											object v = reader.IsDBNull(i) ? null : reader.GetValue(i);
											row[name] = NormalizeCell(v);
										}
										rowsDict.Add(row);
									}
								}
							}
						} while (reader.NextResult());
						try
						{
							if (reader.RecordsAffected >= 0)
								affected = reader.RecordsAffected;
						}
						catch { }
					}

					var resp = OkEmpty(tls);
					resp["tls"] = tls;
					resp["columns"] = cols;
					resp["rows"] = asArray ? (object)rowsArr : rowsDict;
					resp["row_format"] = asArray ? "array" : "object";
					resp["rows_affected"] = affected;
					return resp;
				}
			}
			catch (Exception ex)
			{
				return ErrDict("sql", ex.Message, tls);
			}
		}

		private static void SweepPool()
		{
			DateTime now = DateTime.UtcNow;
			lock (Gate)
			{
				var dead = new List<string>();
				foreach (var kv in Pool)
				{
					if ((now - kv.Value.LastUseUtc).TotalSeconds > idleSec * 2
						|| kv.Value.Conn == null
						|| kv.Value.Conn.State != ConnectionState.Open)
					{
						dead.Add(kv.Key);
						try { if (kv.Value.Conn != null) kv.Value.Conn.Dispose(); } catch { }
					}
				}
				foreach (string k in dead)
					Pool.Remove(k);
			}
		}

		private static void ClearPool()
		{
			lock (Gate)
			{
				foreach (var kv in Pool)
				{
					try { if (kv.Value.Conn != null) kv.Value.Conn.Dispose(); } catch { }
				}
				Pool.Clear();
			}
		}

		private static void TouchActivity()
		{
			lastActivityUtc = DateTime.UtcNow;
		}

		private static void WritePort(int port)
		{
			if (string.IsNullOrEmpty(portFile)) return;
			try
			{
				string dir = Path.GetDirectoryName(portFile);
				if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
					Directory.CreateDirectory(dir);
				File.WriteAllText(portFile, port.ToString() + "\n" + System.Diagnostics.Process.GetCurrentProcess().Id, Utf8NoBom);
			}
			catch { }
		}

		private static void TryDeletePortFile()
		{
			if (string.IsNullOrEmpty(portFile)) return;
			try
			{
				if (File.Exists(portFile))
					File.Delete(portFile);
			}
			catch { }
		}

		private static void WriteStdoutReady(int port)
		{
			byte[] ready = Utf8NoBom.GetBytes("READY " + port + "\n");
			Stream stdout = Console.OpenStandardOutput();
			stdout.Write(ready, 0, ready.Length);
			stdout.Flush();
		}

		// ---------- once 模式（调试） ----------
		private static int RunOnce()
		{
			string raw;
			using (var sr = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8))
				raw = (sr.ReadToEnd() ?? "").Trim();
			if (raw.Length == 0)
			{
				WriteStdoutJson(ErrDict("empty_input", "stdin 无 JSON", false));
				return 2;
			}
			int nl = raw.IndexOf('\n');
			if (nl > 0) raw = raw.Substring(0, nl).Trim();
			var req = Json.Deserialize<Dictionary<string, object>>(raw);
			string key;
			SqlConnection conn;
			bool tls;
			var cr = OpenForSession(req, out key, out conn, out tls);
			if (!IsTrue(cr, "ok"))
			{
				WriteStdoutJson(cr);
				return 1;
			}
			string op = GetStr(req, "op", "connect").ToLowerInvariant();
			if (op == "query" || op == "exec")
				WriteStdoutJson(ExecQuery(conn, tls, req));
			else
				WriteStdoutJson(cr);
			ReleaseHeld(ref key, ref conn, ref tls);
			ClearPool();
			return 0;
		}

		private static void WriteStdoutJson(Dictionary<string, object> obj)
		{
			byte[] bytes = Utf8NoBom.GetBytes(Json.Serialize(obj) + "\n");
			Stream s = Console.OpenStandardOutput();
			s.Write(bytes, 0, bytes.Length);
			s.Flush();
		}

		private static void WriteLine(StreamWriter w, Dictionary<string, object> obj)
		{
			w.WriteLine(Json.Serialize(obj));
			w.Flush();
		}

		private static bool TryBuildCs(Dictionary<string, object> req, out string cs, out bool encryptUsed, out string err)
		{
			cs = null;
			encryptUsed = false;
			err = null;
			string host = GetStr(req, "host", "127.0.0.1");
			if (string.IsNullOrEmpty(host)) host = "127.0.0.1";
			int port = GetInt(req, "port", 1433);
			if (port <= 0) port = 1433;
			string user = GetStr(req, "user", "");
			string pass = GetStr(req, "password", "");
			string db = GetStr(req, "database", "");
			string encMode = GetStr(req, "encrypt", "auto").ToLowerInvariant();
			bool trust = GetBool(req, "trustServerCertificate", true);
			if (!GetBool(req, "trust_server_certificate", true))
				trust = false;
			int timeout = GetInt(req, "timeout", 15);
			if (timeout < 1) timeout = 15;

			bool encrypt = (encMode != "disable");
			if (encMode == "require") encrypt = true;
			if (encMode == "disable") encrypt = false;
			if (encMode == "auto") encrypt = true;
			encryptUsed = encrypt;

			var sb = new StringBuilder(192);
			sb.Append("Data Source=").Append(host).Append(",").Append(port).Append(";");
			sb.Append("User ID=").Append(EscapeCs(user)).Append(";");
			sb.Append("Password=").Append(EscapeCs(pass)).Append(";");
			if (!string.IsNullOrEmpty(db))
				sb.Append("Initial Catalog=").Append(EscapeCs(db)).Append(";");
			sb.Append("Connect Timeout=").Append(timeout).Append(";");
			sb.Append("Encrypt=").Append(encrypt ? "True" : "False").Append(";");
			if (encrypt && trust)
				sb.Append("TrustServerCertificate=True;");
			// 进程级池复用，SqlClient 池可开
			sb.Append("Pooling=True;");
			sb.Append("Max Pool Size=20;");
			sb.Append("Application Name=SqlmngerMsCli;");
			cs = sb.ToString();
			return true;
		}

		private static object NormalizeCell(object v)
		{
			if (v == null || v is DBNull) return null;
			if (v is DateTime)
				return ((DateTime)v).ToString("yyyy-MM-dd HH:mm:ss.fff");
			if (v is DateTimeOffset)
				return ((DateTimeOffset)v).ToString("yyyy-MM-dd HH:mm:ss.fff");
			if (v is byte[])
				return Convert.ToBase64String((byte[])v);
			if (v is Guid)
				return v.ToString();
			if (v is bool || v is byte || v is sbyte || v is short || v is ushort
				|| v is int || v is uint || v is long || v is ulong || v is float || v is double || v is decimal)
				return v;
			return Convert.ToString(v);
		}

		private static string EscapeCs(string s)
		{
			if (s == null) return "";
			if (s.IndexOf(';') >= 0 || s.IndexOf('"') >= 0 || s.IndexOf('\'') >= 0)
				return "\"" + s.Replace("\"", "\"\"") + "\"";
			return s;
		}

		private static Dictionary<string, object> OkEmpty(bool tls)
		{
			var resp = new Dictionary<string, object>();
			resp["ok"] = true;
			resp["error"] = null;
			resp["tls"] = tls;
			resp["server_version"] = "";
			resp["columns"] = new List<object>();
			resp["rows"] = new List<object>();
			resp["rows_affected"] = 0;
			resp["messages"] = new List<object>();
			return resp;
		}

		private static Dictionary<string, object> ErrDict(string code, string message, bool tls)
		{
			var resp = new Dictionary<string, object>();
			resp["ok"] = false;
			resp["error"] = message ?? "error";
			resp["code"] = code ?? "";
			resp["tls"] = tls;
			resp["server_version"] = "";
			resp["columns"] = new List<object>();
			resp["rows"] = new List<object>();
			resp["rows_affected"] = 0;
			resp["messages"] = new List<object>();
			return resp;
		}

		private static bool IsTrue(Dictionary<string, object> d, string key)
		{
			if (d == null || !d.ContainsKey(key) || d[key] == null) return false;
			object v = d[key];
			if (v is bool) return (bool)v;
			return string.Equals(Convert.ToString(v), "true", StringComparison.OrdinalIgnoreCase)
				|| Convert.ToString(v) == "1";
		}

		private static string GetStr(Dictionary<string, object> d, string key, string def)
		{
			if (d == null || !d.ContainsKey(key) || d[key] == null) return def;
			return Convert.ToString(d[key]);
		}

		private static int GetInt(Dictionary<string, object> d, string key, int def)
		{
			if (d == null || !d.ContainsKey(key) || d[key] == null) return def;
			try { return Convert.ToInt32(d[key]); }
			catch { return def; }
		}

		private static bool GetBool(Dictionary<string, object> d, string key, bool def)
		{
			if (d == null || !d.ContainsKey(key) || d[key] == null) return def;
			object v = d[key];
			if (v is bool) return (bool)v;
			string s = Convert.ToString(v);
			if (s == "1" || string.Equals(s, "true", StringComparison.OrdinalIgnoreCase)) return true;
			if (s == "0" || string.Equals(s, "false", StringComparison.OrdinalIgnoreCase)) return false;
			return def;
		}
	}
}
