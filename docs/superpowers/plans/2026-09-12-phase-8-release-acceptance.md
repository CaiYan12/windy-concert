# Phase 8 Release Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver and independently verify the Windy Concert 0.1.0 Windows green package, its seven-metric performance record, the M1-M8 manual acceptance record, and the phase-close evidence without declaring release when a gate fails.

**Architecture:** Keep the existing Electron/Vite runtime unchanged. T8.1 makes the package boundary explicit: `out/**` is the application payload, `resources/locales` and the application icon are external resources, and native `.node` modules are unpacked. The icon is a locally stored derivative of an external CC0 vinyl-record SVG, rendered through the existing `sharp` dependency into `icon.png` and a four-entry `icon.ico`.

**Tech Stack:** Electron 39.8.10 runtime, electron-vite 5, electron-builder 26.0.12, Node.js 24.18.0, TypeScript 5.9.3, React 19, Vitest 5, Playwright 1.63, PowerShell 7.

**Spec:** `docs/setting-up-plan.md` Phase 8, §3.8, §6.2, and §6.3; the Phase 8 prerequisite list in `README.md`.

## Global Constraints

- Release version is exactly `0.1.0`; `package.json`, the root package-lock metadata, the zip filename, and the final tag must agree.
- `electron-builder.yml` uses `appId: cn.windyconcert.app`, `productName: Windy Concert`, `directories.output: release`, `files: out/**`, `extraResources` for `resources/locales` and `resources/icon.ico`, `asarUnpack: **/*.node`, and explicit `win.icon: resources/icon.ico`.
- T8.1 builds the `dir` target through `build.bat`, stages `release/win-unpacked` into `build/`, and leaves NSIS as the later configured Windows target.
- The external icon source is SVG Repo's CC0 `Vinyl Record` vector at `https://www.svgrepo.com/svg/528786/vinyl-record`; the local derivative may recolor and compose it with the existing Windy Concert tokens, and provenance is recorded in `resources/icon-source.md`.
- No new runtime dependency is permitted. The existing `sharp` package is the only rasterization dependency; the existing package manager and lockfile remain authoritative.
- Test/build commands run from the uppercase path `D:\Dev\windy-concert`; build and E2E commands set `CODEBUDDY_SAFE_DELETE_ENABLED=0` in the PowerShell process environment.
- `docs/setting-up-plan.md` may only receive checkbox changes and appended `> 执行备注(YYYY-MM-DD): ...` lines; its task text and acceptance criteria remain unchanged.
- Evidence must distinguish automated output, desktop/manual observation, and unavailable checks. A missing manual observation is not a pass.
- No tag, release claim, or push occurs until T8.1, T8.2, M1-M8, the three-party close review, and the final verification commands are green.

---

### Task 1: T8.1 icon provenance, packaging configuration, and green artifact

**Files:**
- Create: `resources/icon.svg`
- Create: `resources/icon-source.md`
- Create: `scripts/generate-app-icon.mjs`
- Create: `tests/unit/release/icon-asset.test.ts`
- Generate: `resources/icon.png`
- Generate: `resources/icon.ico`
- Modify: `electron-builder.yml`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: external CC0 SVG source and the existing `sharp` dependency.
- Produces: four ICO entries at 16, 32, 48, and 256 pixels; a 512-pixel PNG used by the existing Linux `BrowserWindow` import; a builder configuration that packages the exact runtime resources; and version `0.1.0` consumed by `build.bat`.

- [x] **Step 1: Write the failing asset contract test**

  Add a Node/Vitest test that reads `resources/icon.ico`, asserts the ICO header is `00 00 01 00`, asserts four directory entries exist, and asserts the entry width bytes represent 16, 32, 48, and 256 (`0` in ICO for 256). Assert `resources/icon.svg` contains the local derivative marker and does not contain the Electron atom source filename.

- [x] **Step 2: Run the focused test and verify the baseline failure**

  Run from `D:\Dev\windy-concert`:

  ```powershell
  npm test -- tests/unit/release/icon-asset.test.ts
  ```

  Expected baseline: FAIL because the new icon source/ICO contract is not present yet.

- [x] **Step 3: Add the external-source derivative and reproducible icon generator**

  Store the CC0 source URL and transformation record in `resources/icon-source.md`. Create `resources/icon.svg` as a 512×512 dark rounded-square app mark using the source vinyl-record paths, recolored with the existing `--accent` green and `--bg-base`/`--bg-input` colors. `scripts/generate-app-icon.mjs` must render `resources/icon.svg` with `sharp`, write `resources/icon.png` at 512×512, write PNG payloads for exactly `[16, 32, 48, 256]` into one valid ICO container, and fail non-zero if the source or output path is unavailable.

- [x] **Step 4: Replace the template packaging metadata with the §3.8 Windows route**

  Set `package.json.version` and both root lockfile version fields to `0.1.0`. Replace the template builder configuration with this contract:

  ```yaml
  appId: cn.windyconcert.app
  productName: Windy Concert
  directories:
    output: release
  files:
    - out/**
  extraResources:
    - from: resources/locales
      to: locales
    - from: resources/icon.ico
      to: icon.ico
  asarUnpack:
    - '**/*.node'
  win:
    icon: resources/icon.ico
    target:
      - nsis
    executableName: Windy Concert
  nsis:
    oneClick: false
    allowToChangeInstallationDirectory: true
    artifactName: Windy-Concert-Setup-${version}.${ext}
  ```

  Remove template-only macOS/Linux/publish/example.com configuration. Keep the existing `build.bat` contract unchanged unless a failed real build proves a scoped fix is required.

- [x] **Step 5: Generate the assets and run the focused, full, and static checks**

  Run:

  ```powershell
  node scripts/generate-app-icon.mjs
  npm test -- tests/unit/release/icon-asset.test.ts
  npm test
  npm run typecheck
  ```

  Expected: generated assets exist, the focused asset test passes, the complete unit suite passes, and both TypeScript projects report zero errors.

- [x] **Step 6: Run the real T8.1 build and inspect its artifacts**

  Close any running Windy Concert process, then run:

  ```powershell
  $env:CODEBUDDY_SAFE_DELETE_ENABLED = '0'
  .\build.bat
  .\build.bat zip
  Remove-Item Env:CODEBUDDY_SAFE_DELETE_ENABLED
  ```

  Verify all of the following from fresh filesystem output: `build\Windy Concert.exe` exists; `build\resources\app.asar` exists; `build\resources\locales\zh-CN.json` exists; `build\resources\icon.ico` exists; a native `.node` file is outside the ASAR under the packaged resources; and `Windy-Concert-0.1.0-win64.zip` exists. Record byte sizes and any warnings without treating warnings as failures.

- [x] **Step 7: Commit the independently verified T8.1 slice**

  Commit only the T8.1 files and the generated icon assets after the focused test, full unit suite, typecheck, build, and zip checks have fresh exit-0 evidence.

---

### Task 2: T8.2 seven-metric performance evidence

**Files:**
- Create: `docs/perf-0.1.md`
- Modify: none unless a measured, release-blocking defect requires a scoped fix with its own test

**Interfaces:**
- Consumes: `scripts/gen-sample-library.mjs`, production `build\Windy Concert.exe`, `scan.log`, IPC search `[search] ... took=...ms` diagnostics, and the §6.2 threshold table.
- Produces: an auditable record with machine facts, commands, raw observations, sample counts, median calculations, threshold results, and explicit unavailable/manual boundaries.

- [ ] **Step 1: Create the evidence template with all seven §6.2 rows**

  `docs/perf-0.1.md` must contain sections for environment, sample-library lifecycle, and exactly these metrics: first full scan ≤5 minutes, startup to interactive ≤3 seconds, startup incremental scan ≤10 seconds, search ≤300ms, empty-library memory ≤500MB, track-start latency ≤500ms, and compressed zip size ≤200MB. Include an evidence status column with `PASS`, `FAIL`, or `NOT MEASURED`; do not prefill a pass.

- [ ] **Step 2: Generate the 30,000-track library on a verified disk**

  Resolve a temporary output directory outside the repository, record the free-space check, and run:

  ```powershell
  $perfDir = Join-Path ([System.IO.Path]::GetTempPath()) 'windy-concert-phase8-30000'
  node scripts/gen-sample-library.mjs --count 30000 --out $perfDir
  ```

  Preserve the generator's output count, directory count, total bytes, and generation time in the report. Do not use `--force` unless the exact resolved target was inspected and the user-scoped temporary directory is confirmed.

- [ ] **Step 3: Measure automated scan and search evidence**

  Use the packaged app/user-data path and the real library folder. Capture the first full-scan `scan.log` line and the second-start incremental `scan.log` line, preserving `elapsedMs`, `total`, `parsed`, `adopted`, and `skipped`. Capture ten real `library:search` console lines, including a Chinese two-character query and an English query, and calculate medians from the `took=...ms` values.

- [ ] **Step 4: Measure desktop-bound metrics without disguising them as automation**

  From a double-click launch of `build\Windy Concert.exe`, measure startup-to-Songs-scrollable three times and use the median. With an empty user-data directory, record the idle Windy Concert process working set from Task Manager. Play ten short tracks and record the time from the previous track boundary to audible output; use the median. If an observation cannot be made in the current desktop session, mark it `NOT MEASURED` and stop before release claims.

- [ ] **Step 5: Record the zip size and clean the exact temporary library**

  Record the zip file's byte size and compressed size after `build.bat zip`. After all app processes are closed and the report has the raw paths, remove only the exact generated sample-library directory and verify it is absent. Do not remove the repository, `build`, or `release` artifacts needed for later M8.

- [ ] **Step 6: Evaluate thresholds and run the prescribed risk route**

  Mark each row from the measured value. If any row is `FAIL`, stop the release sequence, map it to the corresponding §7 risk, and do not continue to M8/tagging. If all measured rows pass but a manual row is unavailable, keep the phase open rather than converting it to pass.

- [ ] **Step 7: Commit the performance evidence only after raw-output review**

  Commit `docs/perf-0.1.md` with the exact measured values, commands, dates, and evidence boundaries.

---

### Task 3: M1-M8 manual acceptance and release-boundary documentation

**Files:**
- Modify: `docs/perf-0.1.md`
- Modify: `README.md`
- Modify: `src/renderer/src/pages/Settings.tsx` only if About/version alignment is proven necessary after the version change
- Create: no new runtime feature files

**Interfaces:**
- Consumes: the verified green package, the existing E2E harness, the §6.3 script, the seven-metric evidence, and the seven Phase 8 prerequisite decisions in README.
- Produces: dated M1-M8 evidence, explicit disposition of all seven prerequisites, and a README that does not claim unperformed checks.

- [ ] **Step 1: Execute M1-M3 against the packaged app**

  Record the real-user flow for adding a personal directory, browsing/searching, double-click playback, the incremental-new-file scenario, and playback-bar progress/volume/mute/repeat/shuffle combinations. Use the existing local fixtures or a user-provided music directory; do not copy personal audio into the repository.

- [ ] **Step 2: Execute M4 with 200 playlist tracks and restart persistence**

  Create or use a 200-track playlist, drag-reorder it, close the packaged app, relaunch the same user-data directory, and verify the first/middle/last order. Record the exact before/after identifiers and whether the order survived.

- [ ] **Step 3: Execute M5-M8 and verify cleanup behavior**

  Verify missing/reconnected folder behavior, rapid scrolling in Songs and Albums, output-device switching for new playback, and the zip-copy flow: copy the zip to a different directory, extract, launch, scan/play/search, check no residual service or startup item, then remove only the extracted directory.

- [ ] **Step 4: Resolve the Phase 8 prerequisite list in README**

  Record the chosen `last_scan_at` disposition as a known limitation unless runtime evidence proves a different implementation; record the settings-after-restart manual result; record the existing lowercase `c:` normalization boundary; record whether positive startup-scan, volume/muted persistence, and Liked four-key E2E checks were run; and document the uppercase cwd/safe-delete environment rule for contributors.

- [ ] **Step 5: Run the complete pre-close automatic gates**

  From the uppercase workspace path, run:

  ```powershell
  npm test
  npm run typecheck
  $env:CODEBUDDY_SAFE_DELETE_ENABLED = '0'
  npm run test:e2e
  Remove-Item Env:CODEBUDDY_SAFE_DELETE_ENABLED
  ```

  Record fresh counts and exit codes in `docs/perf-0.1.md`. Do not call a build-path E2E check complete unless the test actually launches the packaged executable path.

- [ ] **Step 6: Commit the manual evidence and documentation slice**

  Commit only after all M rows and the automatic gates have a status backed by output or an explicit `NOT MEASURED`/`FAIL` disposition.

---

### Task 4: Phase 8 close review, status synchronization, and final release gate

**Files:**
- Modify: `docs/setting-up-plan.md` (checkboxes and appended execution notes only)
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.workbuddy/memory/2026-09-12.md`
- Modify: `docs/perf-0.1.md`

**Interfaces:**
- Consumes: T8.1-T8.2 commits, M1-M8 evidence, fresh automatic-gate output, and the independent review package.
- Produces: synchronized project state, a clean or explicitly blocked release decision, and only then the requested `v0.1.0` tag/push if every mandatory criterion passes.

- [ ] **Step 1: Dispatch the independent three-dimensional close review**

  Review plan compliance, package/runtime correctness, and test/evidence coverage. The reviewer must independently inspect the T8.1 icon bytes/config and perform a mutation check against the icon entry count and the zip version string; it must not accept the implementer report as proof.

- [ ] **Step 2: Run the fix loop for every Critical or Important finding**

  Resume the responsible implementer for rounds 1-3, re-review each fix against the scoped diff, and record any parked Minor finding with a written ruling in the SDD ledger.

- [ ] **Step 3: Synchronize the three status documents and the daily memory**

  Check T8.1/T8.2/T8.6 statuses and append dated execution notes without changing plan prose. Update README's Phase 8 section with final evidence and known limitations, AGENTS Project Status with the actual phase verdict, and `.workbuddy/memory/2026-09-12.md` with the close result and exact commit.

- [ ] **Step 4: Run the final verification before any release side effect**

  Verify `git diff --check`, `git status --short`, all required test/typecheck/build/E2E outputs, `build\Windy Concert.exe`, `Windy-Concert-0.1.0-win64.zip`, and the exact contents/size of the release artifacts. If any required proof is missing or red, leave the phase open and do not tag/push.

- [ ] **Step 5: Create and push the release tag only if every mandatory gate is green**

  Create `v0.1.0` at the verified commit, verify the tag resolves to that commit, and push the commit and tag to `origin` only after the user-authorized phase close workflow reaches its final green state.
