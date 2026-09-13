# Windy Concert 0.1 performance evidence

Measurement date: 2026-09-12 (Asia/Shanghai)

Base revision: `1a15f6bb8706f812f4f31904f6b4b4b9261c36c3`

Round 1 fix: production scan assembly now passes `logDir: join(userData, 'logs')`; the assembly contract is covered by `tests/unit/library/scanAssembly.test.ts`.

Round 2 fix: `build.bat zip` now uses .NET `ZipFile.CreateFromDirectory` with source and archive-entry validation; the batch file remains ASCII.

This is the T8.2 evidence record. It distinguishes direct release-artifact evidence, packaged-app observations, and metrics that could not be observed under the required manual boundary. A `NOT MEASURED` row is not a pass.

## Environment

| Field | Observed value |
|---|---|
| OS | Microsoft Windows 11 家庭版中文版, `10.0.26200` |
| CPU | 28 logical processors |
| Installed memory | 16,873,545,728 B (16 GB class) |
| PowerShell | `7.6.6` |
| Node.js | `v24.18.0` |
| npm | `12.0.2` |
| Packaged executable | `D:\Dev\windy-concert\build\Windy Concert.exe` |
| Packaged user-data directory (raw helper output) | `C:\Users\EINNTZ~1\AppData\Local\Temp\windy-concert-phase8-userdata-FGLCIi` |
| Git base before Round 2 commit | `1a15f6bb8706f812f4f31904f6b4b4b9261c36c3` |

The packaged-app capture closed all `Windy Concert` processes before cleanup. The temporary user-data directory was retained as an auxiliary raw-evidence location; it is outside the repository and is not a release artifact.

## Sample-library lifecycle

### Disk check and generation

The exact required target was resolved outside the repository:

`C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-30000`

Before generation, the target did not exist, the resolved path was outside `D:\Dev\windy-concert`, and the C: volume had `37,058,383,872` B free (`34.51` GiB). The generator's own required-space check also passed.

Command:

```powershell
$perfDir = Join-Path ([System.IO.Path]::GetTempPath()) 'windy-concert-phase8-30000'
node scripts/gen-sample-library.mjs --count 30000 --out $perfDir
```

Exit code: `0`.

Raw generator output:

```text
[gen-sample-library] 磁盘检查: C:\ 剩余 34.78 GB；要求 > 2GB 且 > 估算值。估算式: 均摊 30738 B/文件 × 30000 × 1.1 余量 = 0.94 GB
[gen-sample-library] 进度: 5000/30000
[gen-sample-library] 进度: 10000/30000
[gen-sample-library] 进度: 15000/30000
[gen-sample-library] 进度: 20000/30000
[gen-sample-library] 进度: 25000/30000
[gen-sample-library] 进度: 30000/30000
========== 生成完成 ==========
输出目录 : C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-30000
生成文件 : 30000（预期 30000）
目录数   : 61（1 根 + 10 艺术家 + 50 专辑）
总字节数 : 880569000 B (839.78 MB)
耗时     : 20.90 s
```

The post-generation inventory confirmed `30,000` files and `880,569,000` B. No `--force` option was used.

### Packaged-app scan and search capture

The real packaged executable was launched twice with the same isolated `WC_USER_DATA` directory after the Round 2 package rebuild. The first run added the generated library and invoked the real `library:rescanAll`; the second run relied on the packaged app's startup scan with the persisted folder and database. The capture exited `0`, and the packaged user-data log contained the required full and incremental lines.

The production assembly fix is at `src/main/index.ts`: `createScanService` receives `logDir: join(userData, 'logs')`. The focused contract test is `tests/unit/library/scanAssembly.test.ts`; the existing scan-service writer test remains in `tests/unit/library/scanService.test.ts`.

Exact packaged rebuild chain used before capture:

```powershell
$env:CODEBUDDY_SAFE_DELETE_ENABLED = '0'
& '.\build.bat'
$packageExitCode = $LASTEXITCODE
Write-Output "PACKAGE_BUILD_EXIT_CODE=$packageExitCode"
```

Exact PowerShell capture chain used after `build.bat` rebuilt the package:

```powershell
$env:T82_PERF_DIR = Join-Path ([System.IO.Path]::GetTempPath()) 'windy-concert-phase8-30000'
& node '.t82-perf-capture.mjs'
$captureExitCode = $LASTEXITCODE
Write-Output "CAPTURE_EXIT_CODE=$captureExitCode"
```

The temporary `.t82-perf-capture.mjs` helper created `WC_USER_DATA` under the user temp directory, removed inherited `ELECTRON_RUN_AS_NODE` before launching `build\Windy Concert.exe`, invoked the real preload APIs, collected main-process `[search]` lines, wrote a result JSON under the user temp directory, and was removed after evidence review. The capture result path was `C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-capture-result.json`.

Raw `scan.log` path:

`C:\Users\EINNTZ~1\AppData\Local\Temp\windy-concert-phase8-userdata-FGLCIi\logs\scan.log`

Raw lines:

```json
{"at":"2026-09-12T14:03:08.050Z","mode":"full","total":30000,"parsed":30000,"skipped":0,"adopted":0,"missingMarked":0,"coversDropped":18514,"elapsedMs":96252}
{"at":"2026-09-12T14:03:15.912Z","mode":"incremental","total":30000,"parsed":0,"skipped":0,"adopted":0,"missingMarked":0,"coversDropped":0,"elapsedMs":6319}
```

## Seven §6.2 metrics

| Metric | Threshold | Raw measured value | Evidence method | Status |
|---|---:|---|---|---|
| 首次全量扫描 | ≤5 min / 30,000 tracks | `scan.log` full line: `elapsedMs=96252`, `total=30000`, `parsed=30000`, `skipped=0`, `adopted=0` | Real packaged app full rescan | PASS |
| 启动到可交互 | ≤3 s | No valid manual double-click ×3 observation | Direct packaged executable/DOM automation is not the required manual stopwatch from double-click to Songs scrollable | NOT MEASURED |
| 启动增量扫描 | ≤10 s | `scan.log` incremental line: `elapsedMs=6319`, `total=30000`, `parsed=0`, `skipped=0`, `adopted=0` | Second packaged launch with persisted folder | PASS |
| 搜索出结果 | ≤300 ms | Ten handler samples: `2, 14, 0, 0, 1, 1, 0, 0, 1, 0` ms; median `0.5` ms | Real packaged-app main-process `[search]` diagnostics, including `夜曲` and `Track` | PASS |
| 空库内存 | ≤500 MB | Not observed | Task Manager idle working-set observation unavailable in this agent session | NOT MEASURED |
| 切歌起音 | ≤500 ms | Not observed | No honest ten-track audible-output timing was available; requires desktop/audio manual script | NOT MEASURED |
| 发布 zip 体积 | ≤200 MB | `157,722,528` B (`157.72` MB decimal; `150.42` MiB) | `build.bat zip` output artifact, direct property/hash/readability inspection | PASS |

The prescribed zip command was run with `CODEBUDDY_SAFE_DELETE_ENABLED=0`:

```powershell
$env:CODEBUDDY_SAFE_DELETE_ENABLED = '0'
& '.\build.bat' 'zip'
$zipExitCode = $LASTEXITCODE
Write-Output "ZIP_COMMAND_EXIT_CODE=$zipExitCode"
```

Observed command output: `ZIP OK: D:\Dev\windy-concert\Windy-Concert-0.1.0-win64.zip entries=160 nativeNodeEntries=9`; exit code: `0`. `System.IO.Compression.ZipFile.OpenRead` confirmed `Windy Concert.exe`, `resources/app.asar`, `resources/icon.ico`, and `9` native `.node` entries. The measured artifact's SHA-256 was `BEE25B48FDA5D88A7FE3A434CA154FE8A843399622DDC5CA7F47EE30088302AF`.

## Search raw evidence

The ten real main-process handler lines were:

```text
[search] q="夜曲" len=2 path=like tracks=50 albums=0 artists=0 playlists=0 took=2ms
[search] q="Track" len=5 path=fts tracks=50 albums=0 artists=0 playlists=0 took=14ms
[search] q="艺术家a" len=4 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
[search] q="专辑" len=2 path=like tracks=50 albums=2 artists=0 playlists=0 took=0ms
[search] q="1" len=1 path=like tracks=50 albums=0 artists=0 playlists=0 took=1ms
[search] q="50" len=2 path=like tracks=50 albums=0 artists=0 playlists=0 took=1ms
[search] q="mp3" len=3 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
[search] q="flac" len=4 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
[search] q="a" len=1 path=like tracks=50 albums=0 artists=0 playlists=0 took=1ms
[search] q="不存在" len=3 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
```

Median calculation: sorted values are `0, 0, 0, 0, 0, 1, 1, 1, 2, 14`; the even-sample median is `(0 + 1) / 2 = 0.5 ms`.

## Cleanup proof

At cleanup time all packaged app processes were closed (`Windy Concert` process count `0`). Only the exact generated sample-library directory was removed; `build`, `release`, and the regenerated zip were not targeted by cleanup. The final verification command checked `Test-Path -LiteralPath $perfDir`, which returned `False` with exit code `0`.

## Release boundary

No metric row is marked `FAIL`. T8.2 remains open only for the three desktop-bound manual rows: startup-to-interactive, empty-library memory, and track-start latency. These rows must be handled by the later manual-script task; this report does not claim T8.2 complete.

## Task 3 terminal-only refresh and M1-M8 appendix

Measurement date: 2026-09-13 (Asia/Shanghai)

Reviewed base: `88649a2`.

This refresh stayed inside the terminal/documentation boundary. It did not launch `build\Windy Concert.exe`, did not run `npm run test:e2e`, did not use Computer Use, and did not touch `.learnings/` or the existing zip artifact. Terminal evidence below is supporting evidence only; it does not turn a desktop/manual row into a pass.

### Fresh non-desktop gates

All commands were run from the uppercase workspace path `D:\Dev\windy-concert`. The Vitest command ran with `CODEBUDDY_SAFE_DELETE_ENABLED=0`; the variable was removed after the gates.

| Command/check | Exit code | Fresh evidence |
|---|---:|---|
| `npm test` | `0` | Vitest `59 passed` files, `707 passed` tests; jsdom emitted non-fatal `HTMLCanvasElement.getContext()` and `HTMLMediaElement.play()` not-implemented warnings. |
| `npm run typecheck` | `0` | Web and Node TypeScript projects both completed without diagnostics. |
| Read-only built artifact/config check | `0` | `build\Windy Concert.exe`, `build\resources\app.asar`, `build\resources\icon.ico`, and `build\locales` exist; `electron-builder.yml` required appId/productName/resources/NSIS entries are present. |
| Read-only current zip inspection | `0` | `Windy-Concert-0.1.0-win64.zip` is `157,722,528` B with `160` entries; normalized entry lookup found `Windy Concert.exe`, `resources/app.asar`, and `resources/icon.ico`. The zip was not modified. |
| `npm run test:e2e` | not run | Deliberately excluded because it launches Electron and belongs to the controller's serial desktop boundary. |

Static artifact details from the same read-only check: executable `210,896,896` B (SHA-256 `5197AECC00916F119FB76500EE4675BA4DAA7A09C8742760A7FE19D26AFF244A`), `app.asar` `7,444,396` B (SHA-256 `64C6DA5D65D961C4927279169374E41245A7973D171DFF02D32F7BD628DD6A68`), and icon `11,258` B. `package.json` reports version `0.1.0`; Settings uses the `app:getVersion` channel, so no Settings.tsx version mismatch was proven and that file was not changed.

### M1-M8 manual acceptance status

The statuses below are the required product-owner/manual rows. None is marked `PASS` without an actual desktop observation.

| Row | Status | Required observation and exact blocker/method |
|---|---|---|
| M1 全功能走查 | `NOT MEASURED` | Requires a packaged-app desktop flow with a real personal directory: add directory, inspect cover wall/artists/search, and double-click playback. Terminal tests and static artifact checks cannot observe this flow; no personal audio was copied into the repository. |
| M2 增量与启动扫描 | `NOT MEASURED` | Requires adding a new file while running, restarting the packaged app with the same user-data directory, and confirming automatic ingestion. Existing T7.6d is the negative `autoScanOnStartup=false` case plus manual-rescan positive control; it is not the positive `autoScanOnStartup=true` restart observation. |
| M3 播放栏 | `NOT MEASURED` | Requires desktop/UI and audible observation of progress seek, volume, mute, Repeat, Shuffle, and all six Repeat×Shuffle combinations. No honest manual audio observation was available in this terminal-only task. |
| M4 200 首歌单 | `NOT MEASURED` | Requires a 200-track playlist, drag reorder, close/relaunch, and exact first/middle/last identifier comparison. Existing small-playlist E2E coverage does not supply this manual 200-track evidence. |
| M5 移动硬盘/missing | `NOT MEASURED` | Requires unplugging a removable directory or renaming it, observing missing state, restoring the directory, and observing reconnection behavior. No desktop filesystem scenario was performed. |
| M6 3 万库滚动 | `NOT MEASURED` | The 30,000-file generator and packaged scan/search evidence exist above, but rapid Songs/Albums scrolling is a desktop observation and was not performed. |
| M7 输出设备 | `NOT MEASURED` | Requires changing the Windows default output device and confirming that new playback uses the new device. No real output-device switch or audible check was performed. |
| M8 绿色包冒烟与清理 | `NOT MEASURED` | Requires copying the zip elsewhere, extracting, launching the packaged app, scanning/playing/searching, checking no residual service/startup item, and deleting only the extracted directory. The terminal zip inspection proves readability and required entries only; it does not prove the full manual flow. |

### Prerequisite dispositions carried by this appendix

`last_scan_at` remains a known limitation: the column exists but has no write path in the reviewed implementation. Settings-after-restart is `NOT MEASURED`. `normalizePath` code/unit evidence covers lowercase drive prefixes and preserves the root slash (`C:\` → `c:\`); pre-existing stored `c:` rows were not migrated. Positive startup-scan E2E, volume/muted persistence E2E, and Liked four-key sorting E2E were not run in this task. The uppercase cwd and `CODEBUDDY_SAFE_DELETE_ENABLED=0` rule was used for the terminal gates. These dispositions do not claim release/tagging or close Phase 8.

## Controller packaged-flow supplement (2026-09-13)

These observations supplement the M rows but do not convert a manual row to `PASS` when the required human interaction or audible check was not performed.

| Area | Fresh evidence | Boundary |
|---|---|---|
| Startup-to-interactive proxy | Computer Use explicit packaged-app launches to the Songs page: `869 ms`, `724 ms`, `736 ms`; median `736 ms` | This is an app-launch proxy, not a literal desktop-icon double-click; §6.2 row remains `NOT MEASURED`.
| M1 add/search/browse supplement | Packaged automation added the isolated fixture directory, full scan finished `total=8`, `parsed=7`, Songs rendered 8 rows, and `夜曲` search returned 2 tracks | Cover-wall/artists visual walkthrough and audible double-click playback not observed; M1 remains `NOT MEASURED`.
| M2 positive startup supplement | One new fixture file was added while running; same user-data restart with `autoScanOnStartup=true` reached track count `8` from `7` | This is packaged bridge automation, not the prescribed manual restart observation; M2 remains `NOT MEASURED`.
| M3 settings persistence supplement | `volume=0.57` and `muted=true` survived a same-user-data restart | Seek, audible volume/mute, Repeat, Shuffle, and six combinations not measured; M3 remains `NOT MEASURED`.
| M4 playlist supplement | Valid 200-track fixture set; first/middle/last IDs before and after reverse reorder differed as expected and `persisted=true` after restart | Reorder was driven through the packaged bridge, not a human drag; M4 remains `NOT MEASURED`.
| M5 missing/reconnect supplement | Disabling the fixture folder produced `4` missing rows; re-enable + full rescan restored all rows to available with the ID set preserved | This is packaged bridge automation, not unplug/rename manual observation; M5 remains `NOT MEASURED`.
| M8 extracted-package supplement | Copied/extracted zip launched successfully; extracted app scanned fixture `total=9` and search returned `3` tracks | Playback, residual startup-item/service check, and manual cleanup walkthrough not observed; M8 remains `NOT MEASURED`.

M6 rapid 30,000-row Songs/Albums scrolling and M7 Windows default-output-device switching remain unmeasured. The fresh automatic gate `npm run test:e2e` completed `26 passed` on 2026-09-13; it is recorded as an automatic regression gate, not a substitute for M1-M8 manual rows.
