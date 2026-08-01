<?php
/**
 * SQL Server 驱动：.NET 4.8 SqlmngerMsCli.exe（常驻单例）
 *
 * - 需要时启动 CLI；多 PHP 请求共用同一进程（Mutex + port 文件）
 * - TCP NDJSON；CLI 内连接池复用 SqlConnection
 * - PHP disconnect 只断 TCP，不杀进程；CLI 无连接满 10 秒自动退出
 *
 * 兼容 PHP 5.5+
 */
if (!defined('SQLMNGER_MSSQL_NET_CLIENT')) {
	define('SQLMNGER_MSSQL_NET_CLIENT', 1);

	class SqlmngerMssqlNetClient {
		private $host = '127.0.0.1';
		private $port = 1433;
		private $user = '';
		private $password = '';
		private $database = '';
		private $encrypt = 'auto';
		private $trustServerCertificate = true;
		private $timeoutSec = 15;
		private $connected = false;
		private $tlsEnabled = false;
		private $lastError = null;
		private $serverVersion = null;
		private $exePath = null;

		/** @var resource|null TCP 到常驻 CLI */
		private $sock = null;

		/** @var int 空闲退出秒数（传给 CLI） */
		private static $idleSec = 10;

		public function isConnected() {
			return $this->connected;
		}

		public function isTlsEnabled() {
			return $this->tlsEnabled;
		}

		public function getLastError() {
			return $this->lastError;
		}

		public function getServerVersion() {
			return $this->serverVersion;
		}

		public function connect($host, $port, $user, $password, $database, $timeoutMs = 15000, $opts = null) {
			$this->disconnect();
			$this->lastError = null;
			$this->serverVersion = null;
			$this->tlsEnabled = false;
			$this->host = strval($host);
			$this->port = intval($port) > 0 ? intval($port) : 1433;
			$this->user = $user === null ? '' : strval($user);
			$this->password = $password === null ? '' : strval($password);
			$this->database = $database === null ? '' : strval($database);
			$this->timeoutSec = max(3, intval(ceil($timeoutMs / 1000.0)));
			if (!is_array($opts)) {
				$opts = array();
			}
			if (isset($opts['encrypt']) && strval($opts['encrypt']) !== '') {
				$this->encrypt = strtolower(strval($opts['encrypt']));
			} elseif (function_exists('sqlmnger_cfg')) {
				$this->encrypt = strtolower(strval(sqlmnger_cfg('mssql_tcp_encrypt', 'auto')));
			}
			if ($this->encrypt !== 'require' && $this->encrypt !== 'disable' && $this->encrypt !== 'auto') {
				$this->encrypt = 'auto';
			}
			if (array_key_exists('trustServerCertificate', $opts)) {
				$this->trustServerCertificate = !!$opts['trustServerCertificate'];
			} elseif (array_key_exists('trust_server_certificate', $opts)) {
				$this->trustServerCertificate = !!$opts['trust_server_certificate'];
			} elseif (function_exists('sqlmnger_cfg')) {
				$this->trustServerCertificate = !!sqlmnger_cfg('mssql_tcp_trust_server_certificate', true);
			}
			if (function_exists('sqlmnger_cfg')) {
				$idle = intval(sqlmnger_cfg('mssql_net_idle_sec', 10));
				if ($idle >= 2 && $idle <= 600) {
					self::$idleSec = $idle;
				}
			}

			if (!$this->ensureDaemonAndConnect()) {
				return false;
			}

			$resp = $this->rpc(array(
				'op' => 'connect',
				'host' => $this->host,
				'port' => $this->port,
				'user' => $this->user,
				'password' => $this->password,
				'database' => $this->database,
				'encrypt' => $this->encrypt,
				'trustServerCertificate' => $this->trustServerCertificate,
				'timeout' => $this->timeoutSec,
			));
			if ($resp === false) {
				$this->closeSock();
				return false;
			}
			if (empty($resp['ok'])) {
				$this->lastError = isset($resp['error']) ? strval($resp['error']) : '连接失败';
				$this->closeSock();
				return false;
			}
			$this->connected = true;
			$this->tlsEnabled = !empty($resp['tls']);
			$this->serverVersion = isset($resp['server_version']) ? strval($resp['server_version']) : '';
			return true;
		}

		/**
		 * 只断开到 CLI 的 TCP；不杀常驻进程（由 CLI 空闲 10s 自退）
		 */
		public function disconnect() {
			if (is_resource($this->sock)) {
				// 归还 SQL 连接到 CLI 池
				$this->rpc(array('op' => 'close'), 2);
				$this->rpc(array('op' => 'quit'), 1);
			}
			$this->closeSock();
			$this->connected = false;
		}

		public function execute($sql) {
			$result = array(
				'columns' => array(),
				'rows' => array(),
				'rows_affected' => 0,
				'messages' => array(),
				'error' => null,
			);
			if (!$this->connected || !is_resource($this->sock)) {
				$result['error'] = '未连接';
				return $result;
			}
			$resp = $this->rpc(array(
				'op' => 'query',
				'host' => $this->host,
				'port' => $this->port,
				'user' => $this->user,
				'password' => $this->password,
				'database' => $this->database,
				'encrypt' => $this->encrypt,
				'trustServerCertificate' => $this->trustServerCertificate,
				'timeout' => max($this->timeoutSec, 60),
				'sql' => strval($sql),
			), max(30, $this->timeoutSec + 30));
			if ($resp === false) {
				$result['error'] = $this->lastError !== null ? $this->lastError : 'CLI 调用失败';
				return $result;
			}
			if (empty($resp['ok'])) {
				$result['error'] = isset($resp['error']) ? strval($resp['error']) : '查询失败';
				return $result;
			}
			if (!empty($resp['columns']) && is_array($resp['columns'])) {
				$result['columns'] = $resp['columns'];
			}
			if (!empty($resp['rows']) && is_array($resp['rows'])) {
				$result['rows'] = $resp['rows'];
			}
			if (isset($resp['rows_affected'])) {
				$result['rows_affected'] = intval($resp['rows_affected']);
			}
			if (array_key_exists('tls', $resp)) {
				$this->tlsEnabled = !empty($resp['tls']);
			}
			return $result;
		}

		public static function findExe() {
			$roots = array();
			if (defined('SQLMNGER_ROOT')) {
				$roots[] = SQLMNGER_ROOT;
			}
			$roots[] = dirname(dirname(__DIR__));
			$names = array(
				'bin' . DIRECTORY_SEPARATOR . 'SqlmngerMsCli.exe',
				'tools' . DIRECTORY_SEPARATOR . 'SqlmngerMsCli' . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'Release' . DIRECTORY_SEPARATOR . 'SqlmngerMsCli.exe',
			);
			foreach ($roots as $root) {
				foreach ($names as $rel) {
					$p = $root . DIRECTORY_SEPARATOR . $rel;
					if (is_file($p)) {
						return $p;
					}
				}
			}
			return null;
		}

		public static function isAvailable() {
			if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
				return false;
			}
			return self::findExe() !== null;
		}

		/** port 文件路径 */
		public static function portFilePath() {
			$root = defined('SQLMNGER_ROOT') ? SQLMNGER_ROOT : dirname(dirname(__DIR__));
			$dir = $root . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'run';
			if (!is_dir($dir)) {
				@mkdir($dir, 0755, true);
			}
			return $dir . DIRECTORY_SEPARATOR . 'SqlmngerMsCli.port';
		}

		private function resolveExe() {
			if ($this->exePath !== null && is_file($this->exePath)) {
				return $this->exePath;
			}
			$this->exePath = self::findExe();
			return $this->exePath;
		}

		/**
		 * 连已有守护；没有则启动
		 * @return bool
		 */
		private function ensureDaemonAndConnect() {
			// 1) 尝试已有 port
			$tcpPort = $this->readPortFile();
			if ($tcpPort > 0 && $this->trySock($tcpPort)) {
				// 探活
				$pong = $this->rpc(array('op' => 'ping'), 3);
				if ($pong !== false && !empty($pong['ok'])) {
					return true;
				}
				$this->closeSock();
			}

			// 2) 启动（可能与其它请求竞态；CLI Mutex 保证单例）
			if (!$this->spawnDaemon()) {
				// 启动失败：再试一次 port（别人可能已起好）
				$tcpPort = $this->readPortFile();
				if ($tcpPort > 0 && $this->trySock($tcpPort)) {
					$pong = $this->rpc(array('op' => 'ping'), 3);
					if ($pong !== false && !empty($pong['ok'])) {
						return true;
					}
					$this->closeSock();
				}
				if ($this->lastError === null) {
					$this->lastError = '无法启动或连接 SqlmngerMsCli';
				}
				return false;
			}
			return true;
		}

		/** @return int 0=无 */
		private function readPortFile() {
			$path = self::portFilePath();
			if (!is_file($path)) {
				return 0;
			}
			$raw = @file_get_contents($path);
			if ($raw === false || $raw === '') {
				return 0;
			}
			$lines = preg_split('/\r\n|\n|\r/', trim($raw));
			$port = isset($lines[0]) ? intval($lines[0]) : 0;
			if ($port <= 0 || $port > 65535) {
				return 0;
			}
			// 可选：检查 pid 是否存活
			if (isset($lines[1])) {
				$pid = intval($lines[1]);
				if ($pid > 0 && function_exists('exec') && strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
					// 弱检查：tasklist（可能慢，跳过）；依赖 TCP 探活即可
				}
			}
			return $port;
		}

		/** @return bool */
		private function trySock($tcpPort) {
			$errno = 0;
			$errstr = '';
			$sock = @fsockopen('127.0.0.1', $tcpPort, $errno, $errstr, 1.5);
			if (!is_resource($sock)) {
				return false;
			}
			stream_set_timeout($sock, max(5, $this->timeoutSec + 20));
			$this->sock = $sock;
			return true;
		}

		/** @return bool */
		private function spawnDaemon() {
			$exe = $this->resolveExe();
			if ($exe === null) {
				$this->lastError = '未找到 SqlmngerMsCli.exe';
				return false;
			}

			$portFile = self::portFilePath();
			// 仅当 TCP 不通时清文件（避免误删运行中实例）
			$old = $this->readPortFile();
			if ($old > 0) {
				$errno = 0;
				$errstr = '';
				$t = @fsockopen('127.0.0.1', $old, $errno, $errstr, 0.3);
				if (is_resource($t)) {
					@fclose($t);
					// 仍活着
					if ($this->trySock($old)) {
						return true;
					}
				} else {
					@unlink($portFile);
				}
			} else {
				@unlink($portFile);
			}

			$idle = intval(self::$idleSec);
			// Windows：start /B 分离进程，避免 PHP 结束时带走 CLI
			if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
				// 引号规则：start 第一个引号串是窗口标题
				$cmd = 'start /B "" ' . escapeshellarg($exe)
					. ' --port-file ' . escapeshellarg($portFile)
					. ' --idle ' . $idle;
				// popen 启动后立即 pclose，不等待
				if (function_exists('popen')) {
					$h = @popen($cmd, 'r');
					if (is_resource($h)) {
						@pclose($h);
					}
				} elseif (function_exists('proc_open')) {
					$desc = array(
						0 => array('file', 'NUL', 'r'),
						1 => array('file', 'NUL', 'w'),
						2 => array('file', 'NUL', 'w'),
					);
					$pipes = array();
					$proc = @proc_open($cmd, $desc, $pipes);
					// 不 close 等待；丢弃句柄
					unset($proc);
				} else {
					$this->lastError = '无法启动进程（需 popen/proc_open）';
					return false;
				}
			} else {
				$this->lastError = 'mssql_net 仅支持 Windows';
				return false;
			}

			// 等 port 文件 + TCP
			$deadline = microtime(true) + 10;
			while (microtime(true) < $deadline) {
				$pf = $this->readPortFile();
				if ($pf > 0 && $this->trySock($pf)) {
					return true;
				}
				usleep(40000);
			}

			// 竞态：别人已启动
			$pf = $this->readPortFile();
			if ($pf > 0 && $this->trySock($pf)) {
				return true;
			}
			$this->lastError = '启动 SqlmngerMsCli 超时（未获得端口，请确认已装 .NET 4.8）';
			return false;
		}

		private function closeSock() {
			if (is_resource($this->sock)) {
				@fclose($this->sock);
			}
			$this->sock = null;
		}

		/**
		 * @param array $req
		 * @param int $timeoutSec
		 * @return array|false
		 */
		private function rpc($req, $timeoutSec = 0) {
			if (!is_resource($this->sock)) {
				$this->lastError = '未连接到 CLI';
				return false;
			}
			$payload = json_encode($req);
			if ($payload === false) {
				$this->lastError = '请求 JSON 编码失败';
				return false;
			}
			if ($timeoutSec > 0) {
				@stream_set_timeout($this->sock, $timeoutSec);
			} else {
				@stream_set_timeout($this->sock, max(5, $this->timeoutSec + 20));
			}
			$n = @fwrite($this->sock, $payload . "\n");
			if ($n === false) {
				$this->lastError = 'TCP 写失败（CLI 可能已退出）';
				$this->closeSock();
				return false;
			}
			@fflush($this->sock);

			$line = @fgets($this->sock, 16 * 1024 * 1024);
			$meta = @stream_get_meta_data($this->sock);
			if ($line === false || $line === '') {
				if (!empty($meta['timed_out'])) {
					$this->lastError = 'CLI 读超时';
				} else {
					$this->lastError = 'CLI 无响应（可能已空闲退出）';
				}
				$this->closeSock();
				return false;
			}
			$line = trim($line);
			$resp = json_decode($line, true);
			if (!is_array($resp)) {
				$this->lastError = 'CLI 返回非 JSON：' . substr($line, 0, 200);
				return false;
			}
			return $resp;
		}
	}
}
