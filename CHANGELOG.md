# Changelog

All notable changes to this project are documented in this file.

Format inspired by [Keep a Changelog](https://keepachangelog.com/).  
Versioning follows semantic intent for this prototype (not yet a strict public SemVer release train).

---

## [1.0.3] — 2026-08-01

### Added

- **Driver `mssql_net`**: SQL Server via a **.NET Framework 4.8 helper CLI** (`bin/SqlmngerMsCli.exe`; source in `tools/SqlmngerMsCli/`). Uses `System.Data.SqlClient` + Schannel (TLS 1.2) — a good fit when PHP is old (5.5+) or its OpenSSL cannot do modern TLS.
  - **Resident singleton TCP daemon**: `Local\` mutex keeps one process per machine; listens on `127.0.0.1` random port, writes port + PID to `storage/run/SqlmngerMsCli.port`; NDJSON protocol (`connect` / `query` / `close` / `quit` / `ping` / `shutdown`).
  - **Spawn on demand**: PHP (`api/tds/MssqlNetClient.php`) probes the port file first and `ping`s; only starts the CLI (`start /B`, detached) when unreachable. Concurrent PHP requests share the same process.
  - **Idle auto-exit**: process exits and removes the port file after `--idle` seconds (default **60**, config `mssql_net_idle_sec`) with no connected TCP client; PHP `disconnect` only closes its socket, never kills the daemon.
  - **In-process connection pool**: `SqlConnection` cached per connection string across requests (`close` returns it to the pool).
  - Login UI label: **SQL Server (.NET CLI)**; available on Windows hosts with .NET 4.8 only.
- **Driver `mssql_tcp`**: pure PHP **TCP/TDS** SQL Server client (`api/tds/`), no `sqlsrv` extension required.
  - PRELOGIN + optional **TLS** (`mssql_tcp_encrypt`: `auto` | `require` | `disable`).
  - `mssql_tcp_trust_server_certificate` for self-signed / CN mismatch (common on LAN).
  - Login UI label: **SQL Server (TCP/TDS)**; needs `stream_socket_client` (+ `openssl` when encrypting).
- **Database import / export** (DB overview toolbar → `SqlmngerDbIO`).
  - Export (`api/db_export.php`): SQL / CSV / TSV; open / save / ZIP; per-table structure & data; options for DROP+CREATE, AUTO_INCREMENT, triggers, routines, events; data modes `INSERT` / `INSERT IGNORE` / `REPLACE` / none.
  - Import (`api/db_import.php`): upload `.sql` / `.sql.gz` (or JSON `sql` / `sql_base64`); multi-statement split; stop-on-error; caps via `import_max_bytes` / `import_max_statements`.
- **SQL console**
  - **Multi-statement** scripts: app-layer split (`sqlmnger_split_sql_script`), batch results; stop on first error; cap `sql_exec_max_statements` (default 200).
  - **Dangerous SQL confirm**: DROP / TRUNCATE / DELETE·UPDATE without WHERE, etc. (`sql_require_danger_confirm` + `confirm_dangerous`).
  - **Result export**: SQL / CSV / TSV / JSON — open preview, download, ZIP (client-side for multi-result sets).
- **Saved connections** on login: profiles in `localStorage` (`sqlmnger_saved_conns`); optional remember password via client-side **obfuscation** only (not encryption).
- **Audit log** (optional): JSON lines to `log_path` when `log_operations` is true (login, SQL, structure changes; no passwords).
- **Favicons**: `assets/favicon.ico` / `.svg` / PNG sizes + apple-touch-icon in `index.php`.
- Frontend module `assets/js/sqlmnger.dbio.js` (`SqlmngerDbIO.openExport` / `openImport`).
- **i18n**: Chinese / English / Japanese / Korean (`assets/js/sqlmnger.i18n.js`).
  - Language preference in `localStorage` (`sqlmnger_lang`).
  - **Dropdown** language selector on login and main title bar.
- **Table data UX**
  - Export controls on the **grid status bar** (bottom-right).
  - Full-column search next to row stats (`显示行` / selection / sum / avg).
  - Checked-row highlight (`.is-checked`).
  - **Ctrl+click** (Cmd+click) cell: enter edit mode and start editing.
  - Cancel edit **without confirmation** (discards dirty data by reload).
- **Alter structure**
  - Compact single-line rows; borderless inputs filling cells.
  - **Type** and **Default** comboboxes (filter + highlight match; free text allowed).
  - String defaults shown with quotes; `NULL` / functions unquoted.
  - PK badge moved into the **Key** column.
  - Row **+** inserts a column **above** the current row.
  - **Preview SQL** (no write): `api/table_column.php` `action=preview`.
  - ALTER only for **changed** columns (definition or relative order); unchanged columns skipped.
- **Hash routing**: table mode in hash `m=struct` / `m=alter` (data omits `m`).
- **Tabs**: title is `table` when all open tables share one database; `database.table` when multiple DBs are open.
- New config `mssql_net_idle_sec` (default 60).
- Expanded `.gitignore` for secrets, local data, and IDE noise.

### Changed

- **Layout**: moved former `public/` contents (`index.php`, `api/`, `assets/`) to the **project root**. Document root is now the project root (no nested `public/` web root); `SQLMNGER_ROOT` resolves to the parent of `api/` (one level up).
- Default `enabled_drivers` includes `mssql_tcp` and `mssql_net` alongside `mysql`, `sqlite`, `sqlsrv`.
- Config sample defaults: table limit (`default_table_limit` **2000**); `default_sql_limit` **0** (no auto LIMIT on SQL page unless set).
- SQL page is no longer “single statement only”.
- Closing the column filter row **clears all column filters** (global search kept).
- Combobox: first open shows full list; filter/highlight only after typing.
- Combobox caret click no longer flash-closes when the input is focused.
- Export dropdown in footer opens **upward**.

### Fixed

- API fatal errors / uncaught exceptions now return a JSON error envelope (no Xdebug HTML), so the frontend can show the real message.
- Status bar text no longer wipes the filter toggle button.
- Combobox `oninput` not overwritten by alter-page draft sync (filter works while typing).
- i18n pack parity: `table.wherePh` and grid status strings for all four languages.

### Docs

- `README.md` (English), `README.zh.md` (Chinese), `tools/SqlmngerMsCli/README.md`, this changelog.
- Updated `docs/ui-xui.md` and key paths in `docs/design-sqlmnger.md` for the new layout.

---

## [1.0.1] — 2026-07-25

### Added

- Table data **export**: SQL / CSV / XLSX / JSON.
  - Actions: **open** (`X.Window` preview), **download**, **export zip**.
  - Scope: current page or filtered-all (server soft caps apply).
- Left table tree **context menu**: view data / structure / alter structure.
- Config `allow_empty_password` (default true for local empty-password accounts).
- Compact table toolbar buttons; removed redundant structure-page nav links.

### Fixed

- Vault encrypt path for empty-string passwords.
- Export preview window styling aligned with main UI (white theme, proper footer bar height).

### Changed

- Column delete in alter draft no longer confirms immediately; confirm only on **submit structure**.

---

## [1.0.0] — 2026-07

### Added

- Initial runnable prototype: login (MySQL / SQLite / SQL Server), multi-connection `?c=`, DB/table browse, VirtualGrid data CRUD, structure/index edit, create table, SQL page, server page, hash routing.
- Config via `config/config.php`, Session vault for credentials.

---

[1.0.3]: #103---2026-08-01
[1.0.1]: #101---2026-07-25
[1.0.0]: #100---2026-07
