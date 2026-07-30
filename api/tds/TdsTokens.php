<?php
/**
 * TDS Token 解析（移植自 TCP/testmssql TdsTokens.cs）
 * 返回 array(columns=>[], rows=>[][] 关联行或顺序值, rows_affected, messages, error)
 * 兼容 PHP 5.5+
 */
if (!defined('SQLMNGER_TDS_TOKENS')) {
	define('SQLMNGER_TDS_TOKENS', 1);

	class SqlmngerTdsTokens {
		const TOK_RETURNSTATUS = 0x79;
		const TOK_COLMETADATA = 0x81;
		const TOK_ALTMETADATA = 0x88;
		const TOK_ORDER = 0xA9;
		const TOK_ERROR = 0xAA;
		const TOK_INFO = 0xAB;
		const TOK_RETURNVALUE = 0xAC;
		const TOK_LOGINACK = 0xAD;
		const TOK_ROW = 0xD1;
		const TOK_NBCROW = 0xD2;
		const TOK_ENVCHANGE = 0xE3;
		const TOK_SSPI = 0xED;
		const TOK_DONE = 0xFD;
		const TOK_DONEPROC = 0xFE;
		const TOK_DONEINPROC = 0xFF;

		const T_NULL = 0x1F;
		const T_INT1 = 0x30;
		const T_BIT = 0x32;
		const T_INT2 = 0x34;
		const T_INT4 = 0x38;
		const T_DATETIM4 = 0x3A;
		const T_FLT4 = 0x3B;
		const T_MONEY = 0x3C;
		const T_DATETIME = 0x3D;
		const T_FLT8 = 0x3E;
		const T_MONEY4 = 0x7A;
		const T_INT8 = 0x7F;
		const T_GUID = 0x24;
		const T_INTN = 0x26;
		const T_BITN = 0x68;
		const T_DECIMALN = 0x6A;
		const T_NUMERICN = 0x6C;
		const T_FLTN = 0x6D;
		const T_MONEYN = 0x6E;
		const T_DATETIMN = 0x6F;
		const T_DATEN = 0x28;
		const T_TIMEN = 0x29;
		const T_DATETIME2N = 0x2A;
		const T_DATETIMEOFFSETN = 0x2B;
		const T_CHAR = 0x2F;
		const T_VARCHAR = 0x27;
		const T_BINARY = 0x2D;
		const T_VARBINARY = 0x25;
		const T_BIGVARBIN = 0xA5;
		const T_BIGVARCHR = 0xA7;
		const T_BIGBINARY = 0xAD;
		const T_BIGCHAR = 0xAF;
		const T_NVARCHAR = 0xE7;
		const T_NCHAR = 0xEF;
		const T_XML = 0xF1;
		const T_UDT = 0xF0;
		const T_TEXT = 0x23;
		const T_IMAGE = 0x22;
		const T_NTEXT = 0x63;
		const T_SSVARIANT = 0x62;

		const KIND_FIXED = 1;
		const KIND_BYTELEN = 2;
		const KIND_USHORTLEN = 3;
		const KIND_LONGLEN = 4;
		const KIND_GUID = 5;
		const KIND_DECIMAL = 6;
		const KIND_SKIP = 7;

		/** @var int */
		public static $defaultAnsiCodePage = 936;

		/**
		 * @param string $data binary
		 * @return array
		 */
		public static function parse($data) {
			$result = array(
				'columns' => array(),
				'rows' => array(), // 每行：关联数组 col=>value
				'rows_affected' => 0,
				'messages' => array(),
				'error' => null,
			);
			if ($data === null || $data === '') {
				return $result;
			}
			$pos = 0;
			$len = strlen($data);
			$cols = null;
			$sawDone = false;
			$rowIndex = 0;

			while ($pos < $len) {
				$tok = ord($data[$pos]);
				$pos++;
				switch ($tok) {
				case self::TOK_COLMETADATA:
					$cols = self::readColMetadata($data, $pos, $result);
					break;
				case self::TOK_ROW:
					if ($cols !== null) {
						$row = self::readRowAssoc($data, $pos, $cols, null);
						$result['rows'][] = $row;
						$rowIndex++;
					} else {
						self::skipUnknown($data, $pos, $tok);
					}
					break;
				case self::TOK_NBCROW:
					if ($cols !== null) {
						$row = self::readNbcRowAssoc($data, $pos, $cols);
						if (is_array($row)) {
							$result['rows'][] = $row;
							$rowIndex++;
						}
					} else {
						self::skipUnknown($data, $pos, $tok);
					}
					break;
				case self::TOK_ERROR:
					$result['error'] = self::readErrorOrInfo($data, $pos, true);
					break;
				case self::TOK_INFO:
					$result['messages'][] = self::readErrorOrInfo($data, $pos, false);
					break;
				case self::TOK_LOGINACK:
					self::skipLoginAck($data, $pos);
					break;
				case self::TOK_ENVCHANGE:
					self::skipEnvChange($data, $pos);
					break;
				case self::TOK_ORDER:
					self::skipUshortLen($data, $pos);
					break;
				case self::TOK_RETURNSTATUS:
					$pos += 4;
					break;
				case self::TOK_RETURNVALUE:
					self::skipReturnValue($data, $pos);
					break;
				case self::TOK_DONE:
				case self::TOK_DONEPROC:
				case self::TOK_DONEINPROC:
					if ($pos + 12 > $len) {
						$pos = $len;
						break;
					}
					$status = self::readU16($data, $pos);
					$pos += 2; // curcmd
					$rowCount = self::readU64($data, $pos);
					if (($status & 0x10) !== 0) {
						$result['rows_affected'] = $rowCount;
					}
					if (($status & 0x01) === 0) {
						$sawDone = true;
					}
					break;
				case self::TOK_SSPI:
					if ($pos + 2 > $len) {
						$pos = $len;
						break;
					}
					$l = self::readU16($data, $pos);
					$pos += $l;
					break;
				case self::TOK_ALTMETADATA:
					self::skipUnknown($data, $pos, $tok);
					break;
				default:
					if (!$sawDone) {
						if ($tok === 0x00) {
							$pos = $len;
							break;
						}
						self::skipUnknown($data, $pos, $tok);
					} else {
						$pos = $len;
					}
					break;
				}
			}
			return $result;
		}

		public static function tryGetPacketSize($data, $current) {
			if ($data === null || $data === '') {
				return $current;
			}
			$pos = 0;
			$len = strlen($data);
			while ($pos < $len) {
				$tok = ord($data[$pos]);
				$pos++;
				if ($tok === self::TOK_ENVCHANGE) {
					if ($pos + 2 > $len) {
						break;
					}
					$elen = self::readU16($data, $pos);
					$end = $pos + $elen;
					if ($end > $len) {
						break;
					}
					if ($pos < $end) {
						$typ = ord($data[$pos]);
						$pos++;
						if ($typ === 4 && $pos < $end) {
							$nlen = ord($data[$pos]);
							$pos++;
							if ($pos + $nlen * 2 <= $end) {
								$s = SqlmngerTdsPacket::fromUcs2le(substr($data, $pos, $nlen * 2));
								$ps = intval($s);
								if ($ps >= 512) {
									return $ps;
								}
							}
						}
					}
					$pos = $end;
				} elseif ($tok === self::TOK_DONE || $tok === self::TOK_DONEPROC || $tok === self::TOK_DONEINPROC) {
					$pos += 12;
				} elseif ($tok === self::TOK_LOGINACK) {
					self::skipLoginAck($data, $pos);
				} elseif ($tok === self::TOK_ERROR || $tok === self::TOK_INFO) {
					self::readErrorOrInfo($data, $pos, false);
				} else {
					break;
				}
			}
			return $current;
		}

		private static function readColMetadata($data, &$pos, &$result) {
			$result['columns'] = array();
			$cols = array();
			$len = strlen($data);
			if ($pos + 2 > $len) {
				return $cols;
			}
			$count = self::readU16($data, $pos);
			if ($count === 0xFFFF) {
				return $cols;
			}
			for ($i = 0; $i < $count; $i++) {
				$col = array(
					'name' => '',
					'type' => 0,
					'size' => 0,
					'precision' => 0,
					'scale' => 0,
					'nullable' => false,
					'kind' => self::KIND_SKIP,
					'codePage' => 0,
					'isUnicode' => false,
					'isUtf8' => false,
				);
				if ($pos + 4 > $len) {
					break;
				}
				$pos += 4; // UserType
				if ($pos + 2 > $len) {
					break;
				}
				$flags = self::readU16($data, $pos);
				$col['nullable'] = ($flags & 0x01) !== 0;
				if ($pos >= $len) {
					break;
				}
				$col['type'] = ord($data[$pos]);
				$pos++;
				self::fillTypeInfo($data, $pos, $col);
				if ($pos >= $len) {
					break;
				}
				$nameChars = ord($data[$pos]);
				$pos++;
				if ($pos + $nameChars * 2 > $len) {
					break;
				}
				$col['name'] = SqlmngerTdsPacket::fromUcs2le(substr($data, $pos, $nameChars * 2));
				$pos += $nameChars * 2;
				if ($col['name'] === '') {
					$col['name'] = 'Col' . ($i + 1);
				}
				$cols[] = $col;
				$result['columns'][] = $col['name'];
			}
			return $cols;
		}

		private static function fillTypeInfo($data, &$pos, &$col) {
			$t = $col['type'];
			$len = strlen($data);
			switch ($t) {
			case self::T_NULL:
				$col['kind'] = self::KIND_FIXED;
				$col['size'] = 0;
				break;
			case self::T_INT1:
			case self::T_BIT:
				$col['kind'] = self::KIND_FIXED;
				$col['size'] = 1;
				break;
			case self::T_INT2:
				$col['kind'] = self::KIND_FIXED;
				$col['size'] = 2;
				break;
			case self::T_INT4:
			case self::T_FLT4:
			case self::T_DATETIM4:
			case self::T_MONEY4:
				$col['kind'] = self::KIND_FIXED;
				$col['size'] = 4;
				break;
			case self::T_FLT8:
			case self::T_MONEY:
			case self::T_DATETIME:
			case self::T_INT8:
				$col['kind'] = self::KIND_FIXED;
				$col['size'] = 8;
				break;
			case self::T_GUID:
				if ($pos < $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
				} else {
					$col['size'] = 16;
				}
				$col['kind'] = self::KIND_GUID;
				break;
			case self::T_INTN:
			case self::T_BITN:
			case self::T_FLTN:
			case self::T_MONEYN:
			case self::T_DATETIMN:
				if ($pos < $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
				}
				$col['kind'] = self::KIND_BYTELEN;
				break;
			case self::T_DECIMALN:
			case self::T_NUMERICN:
				if ($pos + 3 <= $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
					$col['precision'] = ord($data[$pos]);
					$pos++;
					$col['scale'] = ord($data[$pos]);
					$pos++;
				}
				$col['kind'] = self::KIND_DECIMAL;
				break;
			case self::T_DATEN:
				if ($pos < $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
				}
				$col['kind'] = self::KIND_BYTELEN;
				break;
			case self::T_TIMEN:
			case self::T_DATETIME2N:
			case self::T_DATETIMEOFFSETN:
				if ($pos < $len) {
					$col['scale'] = ord($data[$pos]);
					$pos++;
				}
				$col['kind'] = self::KIND_BYTELEN;
				$col['size'] = 0;
				break;
			case self::T_CHAR:
			case self::T_VARCHAR:
				if ($pos < $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
				}
				$col['codePage'] = self::$defaultAnsiCodePage;
				$col['kind'] = self::KIND_BYTELEN;
				break;
			case self::T_BINARY:
			case self::T_VARBINARY:
				if ($pos < $len) {
					$col['size'] = ord($data[$pos]);
					$pos++;
				}
				$col['kind'] = self::KIND_BYTELEN;
				break;
			case self::T_BIGVARBIN:
			case self::T_BIGBINARY:
				if ($pos + 2 <= $len) {
					$col['size'] = self::readU16($data, $pos);
				}
				$col['kind'] = self::KIND_USHORTLEN;
				break;
			case self::T_BIGVARCHR:
			case self::T_BIGCHAR:
				if ($pos + 2 <= $len) {
					$col['size'] = self::readU16($data, $pos);
				}
				self::readCollation($data, $pos, $col);
				$col['kind'] = self::KIND_USHORTLEN;
				break;
			case self::T_NVARCHAR:
			case self::T_NCHAR:
				if ($pos + 2 <= $len) {
					$col['size'] = self::readU16($data, $pos);
				}
				self::readCollation($data, $pos, $col);
				$col['isUnicode'] = true;
				$col['kind'] = self::KIND_USHORTLEN;
				break;
			case self::T_TEXT:
			case self::T_NTEXT:
			case self::T_IMAGE:
				if ($pos + 4 <= $len) {
					$col['size'] = self::readU32($data, $pos);
				}
				if ($t === self::T_NTEXT) {
					$col['isUnicode'] = true;
				}
				if ($t !== self::T_IMAGE) {
					self::readCollation($data, $pos, $col);
				}
				self::skipPartTableName($data, $pos);
				$col['kind'] = self::KIND_LONGLEN;
				break;
			case self::T_XML:
				if ($pos < $len) {
					$sp = ord($data[$pos]);
					$pos++;
					if ($sp !== 0) {
						self::skipBVarchar($data, $pos);
						self::skipBVarchar($data, $pos);
						self::skipUsVarchar($data, $pos);
					}
				}
				$col['kind'] = self::KIND_LONGLEN;
				break;
			case self::T_UDT:
				self::skipBVarchar($data, $pos);
				self::skipBVarchar($data, $pos);
				self::skipBVarchar($data, $pos);
				self::skipUsVarchar($data, $pos);
				$col['kind'] = self::KIND_USHORTLEN;
				break;
			case self::T_SSVARIANT:
				if ($pos + 4 <= $len) {
					$col['size'] = self::readU32($data, $pos);
				}
				$col['kind'] = self::KIND_USHORTLEN;
				break;
			default:
				$col['kind'] = self::KIND_SKIP;
				$col['size'] = 0;
				break;
			}
		}

		private static function readRowAssoc($data, &$pos, $cols, $nullmap) {
			$row = array();
			$n = count($cols);
			for ($i = 0; $i < $n; $i++) {
				$name = isset($cols[$i]['name']) ? $cols[$i]['name'] : ('Col' . ($i + 1));
				if ($nullmap !== null && isset($nullmap[$i]) && $nullmap[$i]) {
					$row[$name] = null;
					continue;
				}
				$row[$name] = self::readCellObject($data, $pos, $cols[$i]);
			}
			return $row;
		}

		private static function readNbcRowAssoc($data, &$pos, $cols) {
			$n = count($cols);
			$nbytes = intval(($n + 7) / 8);
			$len = strlen($data);
			if ($pos + $nbytes > $len) {
				$pos = $len;
				return null;
			}
			$nullmap = array();
			for ($i = 0; $i < $n; $i++) {
				$b = ord($data[$pos + intval($i / 8)]);
				$nullmap[$i] = (($b >> ($i % 8)) & 1) !== 0;
			}
			$pos += $nbytes;
			return self::readRowAssoc($data, $pos, $cols, $nullmap);
		}

		private static function readCellObject($data, &$pos, $col) {
			try {
				$len = strlen($data);
				$kind = $col['kind'];
				switch ($kind) {
				case self::KIND_FIXED:
					if ($col['size'] <= 0) {
						return null;
					}
					if ($pos + $col['size'] > $len) {
						$pos = $len;
						return null;
					}
					return self::decodeFixedObj($data, $pos, $col['type'], $col['size']);
				case self::KIND_BYTELEN:
				case self::KIND_GUID:
				case self::KIND_DECIMAL:
					if ($pos >= $len) {
						return null;
					}
					$clen = ord($data[$pos]);
					$pos++;
					if ($clen === 0) {
						return null;
					}
					if ($pos + $clen > $len) {
						$pos = $len;
						return null;
					}
					if ($kind === self::KIND_GUID) {
						if ($clen === 16) {
							$hex = bin2hex(substr($data, $pos, 16));
							$pos += 16;
							// GUID 字节序简化为 hex 串
							return $hex;
						}
						$pos += $clen;
						return null;
					}
					if ($kind === self::KIND_DECIMAL) {
						return self::decodeDecimalObj($data, $pos, $clen, $col['scale']);
					}
					if ($col['type'] === self::T_CHAR || $col['type'] === self::T_VARCHAR) {
						$s = self::decodeAnsi($data, $pos, $clen, $col);
						$pos += $clen;
						return $s;
					}
					return self::decodeVarFixedObj($data, $pos, $col['type'], $clen);
				case self::KIND_USHORTLEN:
					if ($pos + 2 > $len) {
						return null;
					}
					$clen = self::readU16($data, $pos);
					if ($clen === 0xFFFF) {
						return null;
					}
					if ($pos + $clen > $len) {
						$pos = $len;
						return null;
					}
					if (!empty($col['isUnicode']) || $col['type'] === self::T_NVARCHAR || $col['type'] === self::T_NCHAR || $col['type'] === self::T_NTEXT) {
						$s = SqlmngerTdsPacket::fromUcs2le(substr($data, $pos, $clen));
						$pos += $clen;
						return $s;
					}
					if ($col['type'] === self::T_BIGVARCHR || $col['type'] === self::T_BIGCHAR || $col['type'] === self::T_VARCHAR || $col['type'] === self::T_CHAR) {
						$s = self::decodeAnsi($data, $pos, $clen, $col);
						$pos += $clen;
						return $s;
					}
					$bin = substr($data, $pos, $clen);
					$pos += $clen;
					return $bin;
				case self::KIND_LONGLEN:
					if ($pos >= $len) {
						return null;
					}
					$tplen = ord($data[$pos]);
					$pos++;
					if ($tplen === 0) {
						return null;
					}
					if ($pos + $tplen + 8 + 4 > $len) {
						$pos = $len;
						return null;
					}
					$pos += $tplen;
					$pos += 8;
					$dlen = self::readU32($data, $pos);
					if ($dlen < 0 || $pos + $dlen > $len) {
						$pos = $len;
						return null;
					}
					if (!empty($col['isUnicode']) || $col['type'] === self::T_NTEXT) {
						$text = SqlmngerTdsPacket::fromUcs2le(substr($data, $pos, $dlen));
					} elseif ($col['type'] === self::T_IMAGE) {
						$text = substr($data, $pos, $dlen);
					} else {
						$text = self::decodeAnsi($data, $pos, $dlen, $col);
					}
					$pos += $dlen;
					return $text;
				default:
					return null;
				}
			} catch (Exception $e) {
				return null;
			}
		}

		private static function decodeFixedObj($data, &$pos, $type, $size) {
			switch ($type) {
			case self::T_INT1:
				return ord($data[$pos++]);
			case self::T_BIT:
				return ord($data[$pos++]) !== 0;
			case self::T_INT2:
				$v = self::readI16($data, $pos);
				return $v;
			case self::T_INT4:
				return self::readI32($data, $pos);
			case self::T_INT8:
				return self::readI64($data, $pos);
			case self::T_FLT4:
				$v = unpack('f', substr($data, $pos, 4));
				$pos += 4;
				return $v[1];
			case self::T_FLT8:
				$v = unpack('d', substr($data, $pos, 8));
				$pos += 8;
				return $v[1];
			case self::T_DATETIME:
				return self::decodeDateTimeObj($data, $pos, 8);
			case self::T_DATETIM4:
				return self::decodeDateTimeObj($data, $pos, 4);
			case self::T_MONEY:
				$v = self::readI64($data, $pos);
				return $v / 10000.0;
			case self::T_MONEY4:
				$v = self::readI32($data, $pos);
				return $v / 10000.0;
			default:
				$pos += $size;
				return null;
			}
		}

		private static function decodeVarFixedObj($data, &$pos, $type, $len) {
			if ($type === self::T_INTN || $type === self::T_INT1 || $type === self::T_INT2 || $type === self::T_INT4 || $type === self::T_INT8) {
				if ($len === 1) {
					return ord($data[$pos++]);
				}
				if ($len === 2) {
					return self::readI16($data, $pos);
				}
				if ($len === 4) {
					return self::readI32($data, $pos);
				}
				if ($len === 8) {
					return self::readI64($data, $pos);
				}
			}
			if ($type === self::T_BITN || $type === self::T_BIT) {
				return ord($data[$pos++]) !== 0;
			}
			if ($type === self::T_FLTN || $type === self::T_FLT4 || $type === self::T_FLT8) {
				if ($len === 4) {
					$v = unpack('f', substr($data, $pos, 4));
					$pos += 4;
					return $v[1];
				}
				if ($len === 8) {
					$v = unpack('d', substr($data, $pos, 8));
					$pos += 8;
					return $v[1];
				}
			}
			if ($type === self::T_DATETIMN || $type === self::T_DATETIME || $type === self::T_DATETIM4) {
				return self::decodeDateTimeObj($data, $pos, $len);
			}
			if ($type === self::T_MONEYN || $type === self::T_MONEY || $type === self::T_MONEY4) {
				if ($len === 8) {
					return self::readI64($data, $pos) / 10000.0;
				}
				if ($len === 4) {
					return self::readI32($data, $pos) / 10000.0;
				}
			}
			if ($type === self::T_DATEN && $len === 3) {
				$days = ord($data[$pos]) | (ord($data[$pos + 1]) << 8) | (ord($data[$pos + 2]) << 16);
				$pos += 3;
				$ts = gmmktime(0, 0, 0, 1, 1, 1) + $days * 86400;
				return gmdate('Y-m-d', $ts);
			}
			$bin = substr($data, $pos, $len);
			$pos += $len;
			return $bin;
		}

		private static function decodeDecimalObj($data, &$pos, $len, $scale) {
			if ($len < 1) {
				return null;
			}
			$sign = ord($data[$pos]);
			$pos++;
			$rem = $len - 1;
			$mag = 0.0;
			$mult = 1.0;
			for ($i = 0; $i < $rem; $i++) {
				$mag += ord($data[$pos + $i]) * $mult;
				$mult *= 256.0;
			}
			$pos += $rem;
			if ($sign === 0) {
				$mag = -$mag;
			}
			if ($scale > 0) {
				for ($i = 0; $i < $scale; $i++) {
					$mag /= 10.0;
				}
			}
			// 尽量返回字符串保留精度感
			return $mag;
		}

		private static function decodeDateTimeObj($data, &$pos, $len) {
			if ($len === 8) {
				$days = self::readI32($data, $pos);
				$ticks = self::readI32($data, $pos);
				// 1900-01-01 + days + ticks*(1/300)s
				$base = gmmktime(0, 0, 0, 1, 1, 1900);
				$sec = $days * 86400 + ($ticks * 1000.0 / 300.0) / 1000.0;
				return gmdate('Y-m-d H:i:s', intval($base + $sec));
			}
			if ($len === 4) {
				$days = self::readU16($data, $pos);
				$minutes = self::readU16($data, $pos);
				$base = gmmktime(0, 0, 0, 1, 1, 1900);
				return gmdate('Y-m-d H:i:s', $base + $days * 86400 + $minutes * 60);
			}
			$pos += $len;
			return null;
		}

		private static function readErrorOrInfo($data, &$pos, $isError) {
			$len = strlen($data);
			if ($pos + 2 > $len) {
				return $isError ? '未知错误' : '';
			}
			$elen = self::readU16($data, $pos);
			$end = $pos + $elen;
			if ($end > $len) {
				$end = $len;
			}
			if ($pos + 6 > $end) {
				$pos = $end;
				return $isError ? '错误包过短' : '';
			}
			$number = self::readU32($data, $pos);
			$state = ord($data[$pos]);
			$pos++;
			$cls = ord($data[$pos]);
			$pos++;
			if ($pos + 2 > $end) {
				$pos = $end;
				return '#' . $number;
			}
			$msgChars = self::readU16($data, $pos);
			$msg = '';
			if ($pos + $msgChars * 2 <= $end) {
				$msg = SqlmngerTdsPacket::fromUcs2le(substr($data, $pos, $msgChars * 2));
				$pos += $msgChars * 2;
			}
			if ($pos < $end) {
				$n = ord($data[$pos]);
				$pos++;
				$pos += $n * 2;
			}
			if ($pos < $end) {
				$n = ord($data[$pos]);
				$pos++;
				$pos += $n * 2;
			}
			if ($pos + 4 <= $end) {
				$pos += 4;
			} elseif ($pos + 2 <= $end) {
				$pos += 2;
			}
			$pos = $end;
			return '[' . $cls . ':' . $number . '/' . $state . '] ' . $msg;
		}

		private static function skipLoginAck($data, &$pos) {
			if ($pos + 2 > strlen($data)) {
				return;
			}
			$l = self::readU16($data, $pos);
			$pos += $l;
		}

		private static function skipEnvChange($data, &$pos) {
			if ($pos + 2 > strlen($data)) {
				return;
			}
			$l = self::readU16($data, $pos);
			$pos += $l;
		}

		private static function skipUshortLen($data, &$pos) {
			if ($pos + 2 > strlen($data)) {
				return;
			}
			$l = self::readU16($data, $pos);
			$pos += $l;
		}

		private static function skipReturnValue($data, &$pos) {
			$len = strlen($data);
			if ($pos >= $len) {
				return;
			}
			$n = ord($data[$pos]);
			$pos++;
			$pos += $n * 2;
			if ($pos >= $len) {
				return;
			}
			$pos++;
			if ($pos + 4 > $len) {
				$pos = $len;
				return;
			}
			$pos += 4;
			if ($pos + 2 > $len) {
				return;
			}
			$pos += 2;
			$pos = $len;
		}

		private static function skipPartTableName($data, &$pos) {
			$len = strlen($data);
			if ($pos + 2 > $len) {
				return;
			}
			$parts = self::readU16($data, $pos);
			for ($i = 0; $i < $parts && $i < 4; $i++) {
				if ($pos + 2 > $len) {
					return;
				}
				$cch = self::readU16($data, $pos);
				$pos += $cch * 2;
			}
		}

		private static function skipBVarchar($data, &$pos) {
			if ($pos >= strlen($data)) {
				return;
			}
			$n = ord($data[$pos]);
			$pos++;
			$pos += $n * 2;
		}

		private static function skipUsVarchar($data, &$pos) {
			if ($pos + 2 > strlen($data)) {
				return;
			}
			$n = self::readU16($data, $pos);
			$pos += $n * 2;
		}

		private static function skipUnknown($data, &$pos, $tok) {
			$len = strlen($data);
			if ($pos + 2 <= $len) {
				$l = ord($data[$pos]) | (ord($data[$pos + 1]) << 8);
				if ($l >= 0 && $pos + 2 + $l <= $len && $l < 65536) {
					$pos += 2 + $l;
					return;
				}
			}
			$pos = $len;
		}

		private static function readCollation($data, &$pos, &$col) {
			$len = strlen($data);
			if ($pos + 5 > $len) {
				$col['codePage'] = self::$defaultAnsiCodePage;
				return;
			}
			$raw = ord($data[$pos]) | (ord($data[$pos + 1]) << 8) | (ord($data[$pos + 2]) << 16) | (ord($data[$pos + 3]) << 24);
			$sortId = ord($data[$pos + 4]);
			$pos += 5;
			$lcid = $raw & 0xFFFFF;
			$col['codePage'] = self::codePageFromLcidAndSort($lcid, $sortId);
			if ($col['codePage'] === 65001) {
				$col['isUtf8'] = true;
			}
		}

		private static function codePageFromLcidAndSort($lcid, $sortId) {
			switch ($sortId) {
			case 30: case 31: case 32: case 33: case 34:
				return 1252;
			case 49: case 52: case 53: case 54:
				return 936;
			case 50: case 51:
				return 950;
			case 55: case 56: case 57:
				return 932;
			case 65: case 66:
				return 949;
			}
			$full = $lcid & 0xFFFF;
			$primary = $lcid & 0xFF;
			if ($full === 0x0804 || $full === 0x0004) {
				return 936;
			}
			if ($full === 0x0404 || $full === 0x0C04 || $full === 0x1404 || $full === 0x7C04) {
				return 950;
			}
			if ($full === 0x0411) {
				return 932;
			}
			if ($full === 0x0412) {
				return 949;
			}
			if ($full === 0x0409 || $full === 0x0809 || $primary === 0x09) {
				return 1252;
			}
			if (($lcid & 0xFF) === 0x04) {
				return 936;
			}
			return self::$defaultAnsiCodePage;
		}

		private static function decodeAnsi($data, $pos, $len, $col) {
			if ($len <= 0) {
				return '';
			}
			$bin = substr($data, $pos, $len);
			if (!empty($col['isUtf8'])) {
				return $bin;
			}
			$cp = (!empty($col['codePage']) && $col['codePage'] > 0) ? $col['codePage'] : self::$defaultAnsiCodePage;
			$map = array(
				936 => 'CP936',
				950 => 'CP950',
				932 => 'CP932',
				949 => 'CP949',
				1252 => 'Windows-1252',
				65001 => 'UTF-8',
			);
			$enc = isset($map[$cp]) ? $map[$cp] : 'CP936';
			if (function_exists('mb_convert_encoding')) {
				$s = @mb_convert_encoding($bin, 'UTF-8', $enc);
				if ($s !== false) {
					return $s;
				}
			}
			if (function_exists('iconv')) {
				$s = @iconv($enc, 'UTF-8//IGNORE', $bin);
				if ($s !== false) {
					return $s;
				}
			}
			return $bin;
		}

		private static function readU16($data, &$pos) {
			$v = ord($data[$pos]) | (ord($data[$pos + 1]) << 8);
			$pos += 2;
			return $v;
		}

		private static function readI16($data, &$pos) {
			$v = unpack('v', substr($data, $pos, 2));
			$pos += 2;
			$u = $v[1];
			if ($u >= 0x8000) {
				$u -= 0x10000;
			}
			return $u;
		}

		private static function readU32($data, &$pos) {
			$v = unpack('V', substr($data, $pos, 4));
			$pos += 4;
			return $v[1];
		}

		private static function readI32($data, &$pos) {
			// little-endian 32-bit signed
			$u = unpack('V', substr($data, $pos, 4));
			$pos += 4;
			$n = $u[1];
			if (PHP_INT_SIZE === 8 && $n >= 0x80000000) {
				$n -= 0x100000000;
			} elseif (PHP_INT_SIZE === 4 && $n > 0x7FFFFFFF) {
				// 32-bit PHP: unpack V already wraps as signed-ish float risk; force
				$n = $n - 0x100000000;
			}
			return $n;
		}

		private static function readI64($data, &$pos) {
			// little-endian signed 64 as string-safe float/int
			$lo = unpack('V', substr($data, $pos, 4));
			$hi = unpack('V', substr($data, $pos + 4, 4));
			$pos += 8;
			$lov = $lo[1];
			$hiv = $hi[1];
			if (PHP_INT_SIZE >= 8) {
				$v = ($hiv << 32) | $lov;
				// PHP may treat as unsigned; handle sign
				if ($hiv & 0x80000000) {
					// negative
					$v = -((~$v & 0xFFFFFFFFFFFFFFFF) + 1);
				}
				return $v;
			}
			// 32-bit PHP：用 float 近似
			return $hiv * 4294967296.0 + $lov;
		}

		private static function readU64($data, &$pos) {
			$lo = unpack('V', substr($data, $pos, 4));
			$hi = unpack('V', substr($data, $pos + 4, 4));
			$pos += 8;
			if (PHP_INT_SIZE >= 8) {
				return ($hi[1] << 32) | $lo[1];
			}
			return intval($hi[1] * 4294967296.0 + $lo[1]);
		}
	}
}
