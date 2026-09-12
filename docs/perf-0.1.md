# Windy Concert 0.1 performance evidence

Measurement date: 2026-09-12 (Asia/Shanghai)

Base revision: `2a70920e95fb32ee69b12b47bf71361ff439bbe7`

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
| Packaged user-data directory | `C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-userdata-wmjJSA` |
| Git base | `2a70920e95fb32ee69b12b47bf71361ff439bbe7` |

The packaged-app capture closed all `Windy Concert` processes before cleanup. The temporary user-data directory was retained as an auxiliary raw-evidence location; it is outside the repository and is not a release artifact.

## Sample-library lifecycle

### Disk check and generation

The exact required target was resolved outside the repository:

`C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-30000`

Before generation, the target did not exist, the resolved path was outside `D:\Dev\windy-concert`, and the C: volume had `37,345,480,704` B free (`34.78` GiB). The generator's own required-space check also passed.

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
耗时     : 20.14 s
```

The post-generation inventory confirmed `30,000` files and `880,569,000` B. No `--force` option was used.

### Packaged-app scan attempt

The real packaged executable was launched twice with the same isolated `WC_USER_DATA` directory. The first run added the generated library and invoked the real `library:rescanAll`; the second run relied on the packaged app's startup scan with the persisted folder and database. The app capture exited `0` and reported `30,000` tracks after the full scan.

The required `scan.log` evidence was unavailable. The inspected production assembly at `src/main/index.ts:128-140` passes `db`, `getFolders`, `coverDroppedExtra`, and `onProgress` to `createScanService`, but does not pass the optional `logDir`. The writer exists at `src/main/library/scanService.ts:481-484` and is conditional on `deps.logDir`. Consequently, the expected path below did not exist after both packaged runs:

`C:\Users\Einn Tzai\AppData\Local\Temp\windy-concert-phase8-userdata-wmjJSA\logs\scan.log`

The packaged app did emit these auxiliary `scan:progress` observations:

```json
{"phase":"done","done":30000,"total":30000,"elapsedMs":88027}
{"phase":"stat","done":30000,"total":30000,"elapsedMs":6065}
{"phase":"done","done":30000,"total":30000,"elapsedMs":6250}
```

These values are retained for diagnosis but are not promoted to the `scan.log` contract. They also do not provide the required `parsed`, `adopted`, and `skipped` fields.

## Seven §6.2 metrics

| Metric | Threshold | Raw measured value | Evidence method | Status |
|---|---:|---|---|---|
| 首次全量扫描 | ≤5 min / 30,000 tracks | `scan:progress` done `elapsedMs=88027`; required `scan.log` absent | Packaged app full rescan; auxiliary only, missing required log fields | NOT MEASURED |
| 启动到可交互 | ≤3 s | No valid manual double-click ×3 observation | Direct packaged executable/DOM automation is not the required manual stopwatch from double-click to Songs scrollable | NOT MEASURED |
| 启动增量扫描 | ≤10 s | `scan:progress` done `elapsedMs=6250`; required `scan.log` absent | Second packaged launch with persisted folder; auxiliary only | NOT MEASURED |
| 搜索出结果 | ≤300 ms | Ten handler samples: `2, 15, 0, 1, 1, 2, 0, 1, 0, 1` ms; median `1` ms | Real packaged-app main-process `[search]` diagnostics, including `夜曲` and `Track` | PASS |
| 空库内存 | ≤500 MB | Not observed | Task Manager idle working-set observation unavailable in this agent session | NOT MEASURED |
| 切歌起音 | ≤500 ms | Not observed | No honest ten-track audible-output timing was available; requires desktop/audio manual script | NOT MEASURED |
| 发布 zip 体积 | ≤200 MB | `157,723,406` B (`157.72` MB decimal; `150.42` MiB) | Existing `Windy-Concert-0.1.0-win64.zip` direct file-property measurement | PASS |

The zip was not regenerated: running `build.bat zip` would overwrite the existing `Windy-Concert-0.1.0-win64.zip`, which is explicitly outside this task's mutation scope. The measured artifact's SHA-256 was `E9F3B70D339FFCD7538233E3580A11F13D9C71EB9C71FB7B1361A53AAE176AC1`.

## Search raw evidence

The ten real main-process handler lines were:

```text
[search] q="夜曲" len=2 path=like tracks=50 albums=0 artists=0 playlists=0 took=2ms
[search] q="Track" len=5 path=fts tracks=50 albums=0 artists=0 playlists=0 took=15ms
[search] q="艺术家a" len=4 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
[search] q="专辑" len=2 path=like tracks=50 albums=2 artists=0 playlists=0 took=1ms
[search] q="1" len=1 path=like tracks=50 albums=0 artists=0 playlists=0 took=1ms
[search] q="50" len=2 path=like tracks=50 albums=0 artists=0 playlists=0 took=2ms
[search] q="mp3" len=3 path=fts tracks=0 albums=0 artists=0 playlists=0 took=0ms
[search] q="flac" len=4 path=fts tracks=0 albums=0 artists=0 playlists=0 took=1ms
[search] q="a" len=1 path=like tracks=50 albums=0 artists=0 playlists=0 took=0ms
[search] q="不存在" len=3 path=fts tracks=0 albums=0 artists=0 playlists=0 took=1ms
```

Median calculation: sorted values are `0, 0, 0, 1, 1, 1, 1, 2, 2, 15`; the even-sample median is `(1 + 1) / 2 = 1 ms`.

## Cleanup proof

At cleanup time all packaged app processes were closed (`Windy Concert` process count `0`). Only the exact generated sample-library directory was removed; `build`, `release`, and the existing zip were not targeted. The final verification command checked `Test-Path -LiteralPath $perfDir`, which returned `False` with exit code `0`. The C: volume then reported `37,278,949,376` B free (`34.72` GiB).

## Release boundary

No metric row is marked `FAIL`. T8.2 is nevertheless open because the required `scan.log` full/incremental evidence and the three desktop-bound manual rows remain unavailable. These rows must be handled by the later manual-script task; this report does not claim T8.2 completion.
