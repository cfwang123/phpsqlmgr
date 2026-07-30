<?php
/**
 * TDS 包头读写（移植自 TCP/testmssql TdsPacket.cs）
 * 兼容 PHP 5.5+
 */
if (!defined('SQLMNGER_TDS_PACKET')) {
	define('SQLMNGER_TDS_PACKET', 1);

	class SqlmngerTdsPacket {
		const TYPE_SQLBATCH = 0x01;
		const TYPE_RPC = 0x03;
		const TYPE_TABULAR = 0x04;
		const TYPE_ATTENTION = 0x06;
		const TYPE_BULK = 0x07;
		const TYPE_TDS7LOGIN = 0x10;
		const TYPE_SSPI = 0x11;
		const TYPE_PRELOGIN = 0x12;

		const STATUS_EOM = 0x01;
		const HEADER_LEN = 8;
		const DEFAULT_PACKET_SIZE = 4096;

		/**
		 * @param resource $stream
		 * @param int $type
		 * @param string $payload binary
		 * @param int $packetSize
		 */
		public static function send($stream, $type, $payload, $packetSize) {
			if ($packetSize < self::HEADER_LEN + 1) {
				$packetSize = self::DEFAULT_PACKET_SIZE;
			}
			$maxPayload = $packetSize - self::HEADER_LEN;
			$offset = 0;
			$plen = strlen($payload);
			$packetId = 1;
			while (true) {
				$remain = $plen - $offset;
				$chunk = $remain > $maxPayload ? $maxPayload : $remain;
				$last = ($offset + $chunk >= $plen);
				$total = self::HEADER_LEN + $chunk;
				$pkt = chr($type)
					. chr($last ? self::STATUS_EOM : 0)
					. chr(($total >> 8) & 0xFF)
					. chr($total & 0xFF)
					. "\x00\x00"
					. chr($packetId & 0xFF)
					. "\x00";
				if ($chunk > 0) {
					$pkt .= substr($payload, $offset, $chunk);
				}
				$packetId++;
				if ($packetId === 0) {
					$packetId = 1;
				}
				$w = @fwrite($stream, $pkt);
				if ($w === false || $w < strlen($pkt)) {
					throw new Exception('TDS 写包失败');
				}
				@fflush($stream);
				$offset += $chunk;
				if ($last) {
					break;
				}
			}
		}

		/**
		 * @param resource $stream
		 * @param int|null $typeOut 首包类型
		 * @return string binary payload（已拼包）
		 */
		public static function recv($stream, &$typeOut = null) {
			$ms = '';
			$first = true;
			$typeOut = 0;
			while (true) {
				$header = self::readFull($stream, self::HEADER_LEN);
				if ($first) {
					$typeOut = ord($header[0]);
					$first = false;
				}
				$total = (ord($header[2]) << 8) | ord($header[3]);
				if ($total < self::HEADER_LEN) {
					throw new Exception('非法 TDS 包长度: ' . $total);
				}
				$payloadLen = $total - self::HEADER_LEN;
				if ($payloadLen > 0) {
					$ms .= self::readFull($stream, $payloadLen);
				}
				if ((ord($header[1]) & self::STATUS_EOM) !== 0) {
					break;
				}
			}
			return $ms;
		}

		/**
		 * @param resource $stream
		 * @param int $len
		 * @return string
		 */
		public static function readFull($stream, $len) {
			$buf = '';
			while (strlen($buf) < $len) {
				$n = @fread($stream, $len - strlen($buf));
				if ($n === false || $n === '') {
					throw new Exception('连接已关闭（读 TDS 包时）');
				}
				$buf .= $n;
			}
			return $buf;
		}

		/** 密码混淆：每字节 nibble 交换后 XOR 0xA5（UCS-2 LE） */
		public static function obfuscatePassword($password) {
			$raw = self::ucs2le($password === null ? '' : strval($password));
			$out = '';
			$n = strlen($raw);
			for ($i = 0; $i < $n; $i++) {
				$b = ord($raw[$i]);
				$out .= chr(((($b >> 4) | (($b << 4) & 0xF0)) ^ 0xA5) & 0xFF);
			}
			return $out;
		}

		public static function ucs2le($s) {
			$s = strval($s);
			if ($s === '') {
				return '';
			}
			if (function_exists('mb_convert_encoding')) {
				$b = @mb_convert_encoding($s, 'UTF-16LE', 'UTF-8');
				if ($b !== false) {
					return $b;
				}
			}
			if (function_exists('iconv')) {
				$b = @iconv('UTF-8', 'UTF-16LE//IGNORE', $s);
				if ($b !== false) {
					return $b;
				}
			}
			// 退化：ASCII
			$out = '';
			$n = strlen($s);
			for ($i = 0; $i < $n; $i++) {
				$out .= $s[$i] . "\x00";
			}
			return $out;
		}

		public static function fromUcs2le($bin) {
			if ($bin === '' || $bin === null) {
				return '';
			}
			if (function_exists('mb_convert_encoding')) {
				$s = @mb_convert_encoding($bin, 'UTF-8', 'UTF-16LE');
				if ($s !== false) {
					return $s;
				}
			}
			if (function_exists('iconv')) {
				$s = @iconv('UTF-16LE', 'UTF-8//IGNORE', $bin);
				if ($s !== false) {
					return $s;
				}
			}
			return $bin;
		}
	}
}
