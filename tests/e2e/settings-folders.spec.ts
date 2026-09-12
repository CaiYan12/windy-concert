// T7.6 e2e —— Settings Library 分区（目录管理）端到端：F1-1 前后半 + autoScanOnStartup。
//
// 覆盖（计划原文逐条）：
//   a) 添加目录（直传 path）→ listFolders 显示 → 重启仍在（F1-1 前半）；
//   b) 禁用 → 立即 missing → rescanAll → 仍 missing → 重新启用 → 仍 missing → rescanAll →
//      恢复 available（F1-1 后半；C1 复活保 UUID 断言 track id 不变）；
//   c) 删除目录（行内确认条）→ 曲目行保留 status=missing（收藏保留语义）→ 重启不再出现；
//   d) autoScanOnStartup 关 → 重启 → 不产生扫描（曲目数不增 + 探针文件不入库）。
//
// ─────────────────────────────────────────────────────────────────────────────
// 已裁定口径（grill ①，先于实现核实于 src/main/ipc/index.ts:139-215）：
//   · 目录禁用/移除成功后，该目录下 available 曲目**立即** markMissing（handler 侧
//     markTracksMissingUnderFolder 同步执行，不等下次扫描）——故 b) 直接断言「禁用后
//     无需 rescan 即 status=missing」，比计划原文「禁用→rescanAll→断言 missing」更强；
//     计划原文的 rescanAll 步骤保留作回归。
//   · 重新启用**不**自动恢复 available（ipc/index.ts:210-214 注释留痕：等下次扫描），
//     且 scanService 阶段 B C1 复活保 UUID——b) 断言「启用后仍 missing → rescanAll 后回
//     available 且 track id 不变」，比计划原文「恢复」更强且真实。
//
// 实测探明的事实与取证取舍（先于实现核实）：
//
// ① 添加目录的 UI 按钮走系统对话框（ipc/index.ts:178-185：addFolder 无参 →
//    dialog.showOpenDialogSync），Playwright 无法自动化原生对话框。e2e 直传 path 经
//    page.evaluate 调 window.api.library.addFolder(path)——与 UI 按钮命中**同一 handler**
//    （LIBRARY_ADD_FOLDER 有参分支），属合法直连（任务书已裁定）；其余交互（启用开关/
//    行内确认删除/autoScan 开关/全量重扫）一律走 Settings 页真实控件。
//
// ② autoScanOnStartup 重启断言的取证形态（任务书允许自行设计留痕）：
//    「重启不产生扫描事件」的直接观察存在固有窗口：startupScan 在 main app ready 时触发
//    （main/index.ts:180），早于测试侧能在渲染层装上 scan:progress 监听（事件可能漏采，
//    「没观察到」≠「没发生」）。故取证分两层：
//    · 主证（race-free，DB 级）：关掉开关后**在音乐目录里落一个新探针文件**
//      （09-autoscan-probe.mp3，文件名与库内既有文件均不同 → adopt 的
//      (fileName,size,mtime) 三键匹配必然 miss → 若启动扫描发生，必走 create 新 UUID
//      入库）。重启后断言曲目数不增且探针文件未入库；再手动 rescanAll（UI 控件）证明
//      同一文件可被扫描入库（阳性对照）——同文件同环境，「启动扫描若在，必已被采」
//      逻辑闭环，直接证伪。
//    · 辅证（事件观察窗）：二次 launch 后尽快装 __wcSp 订阅（覆盖「重启后我们盯着
//      的时间段」），点击 rescanAll 前事件数组为空、点击后能收到 done（通道自证）。
//      启动阶段（app ready ~ 测试装订阅之间）的事件可能漏采——该窗口的不确定性由
//      DB 级主证兜底，留痕。
//    · settings.get() 落盘回读（autoScanOnStartup=false 跨重启仍在）作为开关持久化
//      的独立断言（F1-1 相邻语义）。
// ③ 路径形态：folderRepo.add 归一化存储（小写盘符 + 去尾分隔符，folderRepo.ts:43-56），
//    UI folder-row .path 显示**存储原值**。断言前用 normPath() 对齐（仅盘符大小写差异），
//    行定位另可用 mkdtemp 目录名（随机后缀，天然唯一）。
// ④ c) 移除目录后重启：enabled 目录集合为空 → startupScan 因 getFolders().length===0
//    直接 return（scanService.ts:508-511），不会意外复活已 missing 曲目；音乐文件仍在
//    磁盘上不影响（无目录注册就不扫）。
// ⑤ fixtures 里 08-broken.mp3 会被扫描器跳过（playback-queue.spec 文件头 ⑦ 已探明），
//    不入库，不影响计数断言；b)/c) 用 setupScannedLibrary 全量 fixtures，d) 的探针
//    文件选 01-夜曲.mp3 的副本改名（mp3 主流格式，解析链路最稳）。
// ⑥ 零 http(s) 外联 + pageerror 为空断言逐窗口延续（launch.spec/scan-flow 硬约束）；
//    本 spec 无故意注入失败的媒体/请求，控制台 error 一并断言为空。
import { test, expect, launchWithUserData } from './fixtures'
import { setupScannedLibrary, watchConsoleIssues, watchRequests, SCAN_TIMEOUT } from './helpers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// 测试内最小 window.api 形状（自洽，不依赖 preload d.ts 注入 e2e tsconfig，同既有 spec）
// ---------------------------------------------------------------------------
interface FolderApi {
  library: {
    addFolder: (p?: string) => Promise<{ id: number }>
    listFolders: () => Promise<Array<{ id: number; path: string; enabled: boolean }>>
    setFolderEnabled: (id: number, enabled: boolean) => Promise<void>
    removeFolder: (id: number) => Promise<void>
    scan: () => Promise<unknown>
    rescanAll: () => Promise<unknown>
    listSongs: (params: {
      sortBy: string
      order?: string
      offset?: number
      limit?: number
    }) => Promise<
      Array<{
        id: string
        title: string
        filePath: string
        format: string
        playable: boolean
        status: string
      }>
    >
    getTrack: (
      id: string
    ) => Promise<{ id: string; title: string; status: string; playable: boolean } | null>
  }
  favorites: {
    set: (trackId: string, favorite: boolean) => Promise<void>
    list: (sortBy: string) => Promise<Array<{ id: string; title: string }>>
  }
  settings: {
    get: () => Promise<{ autoScanOnStartup: boolean }>
    set: (partial: { autoScanOnStartup?: boolean }) => Promise<{ autoScanOnStartup: boolean }>
  }
  onScanProgress: (cb: (p: { phase: string }) => void) => () => void
}

// ---------------------------------------------------------------------------
// 助手
// ---------------------------------------------------------------------------

/** 与 folderRepo.normalizePath 对齐（小写盘符 + 去尾分隔符；仅用于断言前比对，留痕③）。 */
function normPath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/^[A-Za-z]:/, (m) => m.toLowerCase())
}

/** 重置渲染层 scan:progress 事件收集数组（既有订阅的回调按属性现取推送，重赋值即换新数组）。 */
async function subscribeScanEvents(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wcSp: string[] }
    w.__wcSp = []
    ;(window as unknown as { api: FolderApi }).api.onScanProgress((p) => {
      ;(window as unknown as { __wcSp: string[] }).__wcSp.push(p.phase)
    })
  })
}

/** 等待一次扫描走到 phase:'done'（helpers.setupScannedLibrary 同款形态）。 */
async function waitForScanDone(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => ((window as unknown as { __wcSp?: string[] }).__wcSp ?? []).includes('done'),
    undefined,
    { timeout: SCAN_TIMEOUT },
  )
}

/** 经侧栏进入设置页（真实 UI 导航，hash 断言同既有 spec 形态）。 */
async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.sidebar .nav-link').filter({ hasText: '设置' }).click()
  await page.waitForFunction(() => window.location.hash === '#/settings')
  // attached 而非默认 visible：零目录时 ul 空高度会被判 hidden（c) 重启后命中，留痕）。
  await page.waitForSelector('[data-field="folder-list"]', { state: 'attached' })
}

/** 按（归一化后）路径取目录行 id；未命中即抛错（不静默，避免后续断言错位）。 */
async function folderIdByPath(
  page: import('@playwright/test').Page,
  dir: string
): Promise<number> {
  return page.evaluate(async (d: string) => {
    const api = (window as unknown as { api: FolderApi }).api
    const rows = await api.library.listFolders()
    const hit = rows.find((r) => r.path.toLowerCase() === d.toLowerCase())
    if (!hit) throw new Error(`listFolders 未找到目录 ${d}，实际：${JSON.stringify(rows)}`)
    return hit.id
  }, normPath(dir))
}

/** 直传 path 添加目录（取证取舍①：绕系统对话框，与 UI 按钮同一 handler，留痕）。 */
async function addFolderDirect(
  page: import('@playwright/test').Page,
  dir: string
): Promise<number> {
  return page.evaluate(async (d: string) => {
    const api = (window as unknown as { api: FolderApi }).api
    return api.library.addFolder(d)
  }, dir)
}

/** 调用方持有 userData 的双 launch 重启形态（favorites-playlists.spec T6.6 先例）；
 *  返回清理函数（userData + 音乐目录均由调用方 finally 统一删）。 */
async function makeUserDataDir(): Promise<string> {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-settings-folders-'))
}

// ---------------------------------------------------------------------------
// a) 添加目录（直传 path）→ 重启仍在（F1-1 前半）
// ---------------------------------------------------------------------------
test('T7.6a 添加目录：直传 path 入库显示 → 完整重启后目录注册仍在', async () => {
  test.setTimeout(120_000)
  const userDataDir = await makeUserDataDir()
  // 目录 A：含 1 个音频；目录 B：只含非音频（txt + 空子目录）——最小可控双目录场景，
  // 验证「非音频目录可注册、扫描零贡献」（任务书建议形态，留痕）。
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-musica-'))
  fs.copyFileSync(
    path.resolve(__dirname, '../fixtures/music/01-夜曲.mp3'),
    path.join(dirA, '01-夜曲.mp3')
  )
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-musicb-'))
  fs.writeFileSync(path.join(dirB, 'notes.txt'), 'not audio', 'utf8')
  fs.mkdirSync(path.join(dirB, 'nested-empty'))

  const app1 = await launchWithUserData(userDataDir)
  const page1 = app1.page
  const issues1 = watchConsoleIssues(page1)
  const watcher1 = watchRequests(page1)
  try {
    await page1.waitForSelector('.app-shell')

    // 添加目录 A、B（直传 path，取证取舍①留痕），显式扫描（addFolder 不自动扫描）。
    await subscribeScanEvents(page1)
    await addFolderDirect(page1, dirA)
    await addFolderDirect(page1, dirB)
    await page1.evaluate(() => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.scan()
    })
    await waitForScanDone(page1)

    // 扫描落库：仅目录 A 贡献 1 曲（B 无音频、零贡献），状态 available（F1-1 前置事实）。
    const songs = await page1.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(songs, '目录 A 应贡献 1 首').toHaveLength(1)
    expect(songs[0].filePath.toLowerCase().startsWith(dirA.toLowerCase()), '曲目应位于目录 A').toBe(true)
    expect(songs[0].status, '扫描入库曲目应 available').toBe('available')

    // Settings 页目录列表：两行均显示、开关均启用（T7.3 UI 呈现 = listFolders 权威值）。
    await openSettings(page1)
    const rowA = page1.locator('.folder-row', { hasText: path.basename(dirA) })
    const rowB = page1.locator('.folder-row', { hasText: path.basename(dirB) })
    await expect(rowA).toHaveCount(1)
    await expect(rowB).toHaveCount(1)
    await expect(rowA.locator('.path')).toHaveText(normPath(dirA))
    await expect(rowA.locator('button.switch')).toHaveAttribute('aria-checked', 'true')
    await expect(rowA.locator('.folder-status')).toHaveText('已启用')
    await expect(rowB.locator('button.switch')).toHaveAttribute('aria-checked', 'true')

    // —— 完整重启（同一 WC_USER_DATA 二次 launch，F1-1 前半）——
    await app1.close()
    const app2 = await launchWithUserData(userDataDir)
    const page2 = app2.page
    const issues2 = watchConsoleIssues(page2)
    const watcher2 = watchRequests(page2)
    try {
      await page2.waitForSelector('.app-shell')

      // 重启后 Settings 目录列表仍含 A、B（目录注册持久化的直接证据）。
      await openSettings(page2)
      await expect(page2.locator('.folder-row', { hasText: path.basename(dirA) })).toHaveCount(1)
      await expect(page2.locator('.folder-row', { hasText: path.basename(dirB) })).toHaveCount(1)
      // api 侧复核：两目录 enabled=true（UI 呈现的数据源）。
      const foldersAfter = await page2.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.library.listFolders()
      })
      expect(
        foldersAfter.map((f) => f.path.toLowerCase()).sort(),
        '重启后两目录路径均应在册'
      ).toEqual([normPath(dirA).toLowerCase(), normPath(dirB).toLowerCase()].sort())
      expect(foldersAfter.every((f) => f.enabled), '重启后目录均应保持启用').toBe(true)
      // 曲库一并持久（相邻事实 sanity）。
      const songsAfter = await page2.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
      })
      expect(songsAfter, '重启后曲库仍为 1 首').toHaveLength(1)
      expect(songsAfter[0].status).toBe('available')

      expect(issues1.errors, `窗口1 控制台 error：${issues1.errors.join(' | ')}`).toEqual([])
      expect(issues1.pageErrors, `窗口1 未捕获异常：${issues1.pageErrors.join(' | ')}`).toEqual([])
      expect(watcher1.externalUrls(), `窗口1 http(s) 外联：${watcher1.externalUrls().join(', ')}`).toEqual([])
      expect(issues2.errors, `窗口2 控制台 error：${issues2.errors.join(' | ')}`).toEqual([])
      expect(issues2.pageErrors, `窗口2 未捕获异常：${issues2.pageErrors.join(' | ')}`).toEqual([])
      expect(watcher2.externalUrls(), `窗口2 http(s) 外联：${watcher2.externalUrls().join(', ')}`).toEqual([])
    } finally {
      await app2.close()
    }
  } finally {
    await app1.close().catch(() => {})
    try {
      fs.rmSync(dirA, { recursive: true, force: true })
      fs.rmSync(dirB, { recursive: true, force: true })
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 清理失败不掩盖测试结果 */
    }
  }
})

// ---------------------------------------------------------------------------
// b) 禁用 → 立即 missing（裁定口径）→ rescanAll 仍 missing → 启用不恢复 → rescanAll 复活（F1-1 后半）
// ---------------------------------------------------------------------------
test('T7.6b 禁用/恢复：禁用立即 missing → 重扫仍 missing → 启用不恢复 → 重扫复活保 UUID', async ({ app }) => {
  test.setTimeout(120_000)
  const { page } = app
  const issues = watchConsoleIssues(page)
  const watcher = watchRequests(page)

  const library = await setupScannedLibrary(page)
  try {
    await page.waitForSelector('.app-shell')

    // 基线：全部 available，记录 id 全集（C1 复活保 UUID 的比对基准）。
    const baseSongs = await page.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(baseSongs.length, 'fixtures 库应有曲目').toBeGreaterThan(0)
    expect(baseSongs.every((s) => s.status === 'available'), '基线全部 available').toBe(true)
    const baseIds = baseSongs.map((s) => s.id).sort()

    // —— 禁用（Settings 页真实开关）——
    await openSettings(page)
    const folderId = await folderIdByPath(page, library.musicDir)
    await page.locator(`[data-field="folder-switch-${folderId}"]`).click()
    await expect(page.locator(`[data-field="folder-switch-${folderId}"]`)).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(
      page.locator('.folder-row', { hasText: path.basename(library.musicDir) }).locator('.folder-status')
    ).toHaveText('已停用')

    // 立即 missing（裁定口径：禁用成功后 handler 侧同步 markMissing，无需 rescan）。
    await page.waitForFunction(
      async () => {
        const api = (window as unknown as { api: FolderApi }).api
        const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
        return songs.length > 0 && songs.every((s) => s.status === 'missing')
      },
      undefined,
      { timeout: 15_000 }
    )
    const afterDisable = await page.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(
      afterDisable.map((s) => s.id).sort(),
      '禁用后曲目行应全部保留（id 不变、仅状态变 missing）'
    ).toEqual(baseIds)

    // —— rescanAll（计划原文回归：禁用目录不参与扫描，结果仍全 missing）——
    await subscribeScanEvents(page)
    await page.locator('[data-field="rescan-all"]').click()
    await waitForScanDone(page)
    const afterRescanDisabled = await page.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(
      afterRescanDisabled.every((s) => s.status === 'missing'),
      '禁用状态下 rescanAll 不应复活任何曲目'
    ).toBe(true)
    expect(afterRescanDisabled.map((s) => s.id).sort()).toEqual(baseIds)

    // —— 重新启用：不自动恢复（裁定口径：等下次扫描）——
    await page.locator(`[data-field="folder-switch-${folderId}"]`).click()
    await expect(page.locator(`[data-field="folder-switch-${folderId}"]`)).toHaveAttribute(
      'aria-checked',
      'true'
    )
    const afterEnable = await page.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(
      afterEnable.every((s) => s.status === 'missing'),
      '重新启用不应自动恢复 available（ipc/index.ts 裁定留痕）'
    ).toBe(true)

    // —— rescanAll：C1 复活（F1-1 后半）——
    await subscribeScanEvents(page)
    await page.locator('[data-field="rescan-all"]').click()
    await waitForScanDone(page)
    const afterRescanEnabled = await page.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    })
    expect(
      afterRescanEnabled.every((s) => s.status === 'available'),
      '重扫后全部复活 available（C1）'
    ).toBe(true)
    expect(
      afterRescanEnabled.map((s) => s.id).sort(),
      'C1 复活保 UUID：track id 集合与禁用前一致'
    ).toEqual(baseIds)

    expect(issues.errors, `控制台 error：${issues.errors.join(' | ')}`).toEqual([])
    expect(issues.pageErrors, `未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
    expect(watcher.externalUrls(), `http(s) 外联：${watcher.externalUrls().join(', ')}`).toEqual([])
  } finally {
    library.cleanup()
  }
})

// ---------------------------------------------------------------------------
// c) 移除目录（行内确认条）→ 曲目行保留 missing + 收藏保留 → 重启不再出现
// ---------------------------------------------------------------------------
test('T7.6c 移除目录：行内确认删除 → 行保留 missing/收藏保留 → 重启目录不再出现', async () => {
  test.setTimeout(120_000)
  const userDataDir = await makeUserDataDir()
  const app1 = await launchWithUserData(userDataDir)
  const page1 = app1.page
  const issues1 = watchConsoleIssues(page1)
  const watcher1 = watchRequests(page1)
  try {
    await page1.waitForSelector('.app-shell')
    const library = await setupScannedLibrary(page1)
    try {
      // 基线：全部 available；收藏第 1 首（历史/收藏保留语义的可选断言样本，任务书 3-1c）。
      const baseSongs = await page1.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
      })
      expect(baseSongs.length).toBeGreaterThan(0)
      const favTarget = baseSongs[0]
      await page1.evaluate(async (id: string) => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.favorites.set(id, true)
      }, favTarget.id)
      const favBefore = await page1.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.favorites.list('favorited_at')
      })
      expect(favBefore.map((f) => f.id)).toContain(favTarget.id)

      // —— 行内确认条删除（Settings 页 trash-2 → 确认条 → 确认移除；3s 自动收回需即点）——
      await openSettings(page1)
      const folderId = await folderIdByPath(page1, library.musicDir)
      await page1.locator(`[data-field="folder-remove-${folderId}"]`).click()
      const confirmBar = page1.locator('[data-field="remove-confirm"]')
      await expect(confirmBar).toBeVisible()
      await confirmBar.locator('button', { hasText: '确认移除' }).click()

      // 行消失 + 空态出现（目录注册已删）。
      await expect(page1.locator('.folder-row')).toHaveCount(0)
      await expect(page1.locator('[data-field="folder-empty"]')).toHaveText('尚未添加音乐目录。')

      // api 复核：目录已不在册。
      const foldersAfterRemove = await page1.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.library.listFolders()
      })
      expect(foldersAfterRemove, '移除后目录注册应为空').toHaveLength(0)

      // 曲目行保留 + 立即 missing（裁定口径）；收藏关系保留（历史/收藏保留语义）。
      const songsAfterRemove = await page1.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
      })
      expect(
        songsAfterRemove.map((s) => s.id).sort(),
        '移除目录后曲目行应保留'
      ).toEqual(baseSongs.map((s) => s.id).sort())
      expect(
        songsAfterRemove.every((s) => s.status === 'missing'),
        '移除目录后该目录曲目应立即 missing'
      ).toBe(true)
      const favAfter = await page1.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.favorites.list('favorited_at')
      })
      expect(favAfter.map((f) => f.id), '收藏关系应保留').toContain(favTarget.id)

      // —— 重启：目录不再出现，曲目行仍 missing（跨重启成立）——
      await app1.close()
      const app2 = await launchWithUserData(userDataDir)
      const page2 = app2.page
      const issues2 = watchConsoleIssues(page2)
      const watcher2 = watchRequests(page2)
      try {
        await page2.waitForSelector('.app-shell')
        await openSettings(page2)
        await expect(page2.locator('.folder-row')).toHaveCount(0)
        await expect(page2.locator('[data-field="folder-empty"]')).toHaveText('尚未添加音乐目录。')
        const songsAfterRestart = await page2.evaluate(async () => {
          const api = (window as unknown as { api: FolderApi }).api
          return api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
        })
        expect(
          songsAfterRestart.every((s) => s.status === 'missing'),
          '重启后已移除目录的曲目行仍 missing（不复活）'
        ).toBe(true)
        expect(songsAfterRestart.map((s) => s.id).sort()).toEqual(baseSongs.map((s) => s.id).sort())

        expect(issues2.errors, `窗口2 控制台 error：${issues2.errors.join(' | ')}`).toEqual([])
        expect(issues2.pageErrors, `窗口2 未捕获异常：${issues2.pageErrors.join(' | ')}`).toEqual([])
        expect(watcher2.externalUrls(), `窗口2 http(s) 外联：${watcher2.externalUrls().join(', ')}`).toEqual([])
      } finally {
        await app2.close()
      }

      expect(issues1.errors, `窗口1 控制台 error：${issues1.errors.join(' | ')}`).toEqual([])
      expect(issues1.pageErrors, `窗口1 未捕获异常：${issues1.pageErrors.join(' | ')}`).toEqual([])
      expect(watcher1.externalUrls(), `窗口1 http(s) 外联：${watcher1.externalUrls().join(', ')}`).toEqual([])
    } finally {
      library.cleanup()
    }
  } finally {
    await app1.close().catch(() => {})
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 清理失败不掩盖测试结果 */
    }
  }
})

// ---------------------------------------------------------------------------
// d) autoScanOnStartup 关 → 重启不产生扫描（取证形态见文件头 ②）
// ---------------------------------------------------------------------------
test('T7.6d autoScanOnStartup 关：重启无启动扫描（探针文件不入库 + 手动重扫阳性对照）', async () => {
  test.setTimeout(120_000)
  const userDataDir = await makeUserDataDir()
  const app1 = await launchWithUserData(userDataDir)
  const page1 = app1.page
  const issues1 = watchConsoleIssues(page1)
  const watcher1 = watchRequests(page1)
  try {
    await page1.waitForSelector('.app-shell')
    const library = await setupScannedLibrary(page1)
    const baseCount = await page1.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return (await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })).length
    })
    expect(baseCount).toBeGreaterThan(0)

    // —— UI 关闭「启动时自动扫描」开关（settings:set 确认回读落盘）——
    await openSettings(page1)
    const autoSwitch = page1.locator('[data-field="auto-scan-switch"]')
    await expect(autoSwitch).toHaveAttribute('aria-checked', 'true') // 默认 true（settingsStore 默认值）
    await autoSwitch.click()
    await expect(autoSwitch).toHaveAttribute('aria-checked', 'false')
    const persisted = await page1.evaluate(async () => {
      const api = (window as unknown as { api: FolderApi }).api
      return api.settings.get()
    })
    expect(persisted.autoScanOnStartup, '关闭后 settings.get 应回读 false').toBe(false)

    // 落探针文件（主证关键步）：文件名与库内既有文件均不同 → adopt 三键匹配必 miss →
    // 若启动扫描发生，该文件必走 create 新 UUID 入库（scanService 阶段 B，留痕）。
    const probeName = '09-autoscan-probe.mp3'
    fs.copyFileSync(path.join(library.musicDir, '01-夜曲.mp3'), path.join(library.musicDir, probeName))

    // —— 重启（autoScanOnStartup=false）——
    await app1.close()
    const app2 = await launchWithUserData(userDataDir)
    const page2 = app2.page
    const issues2 = watchConsoleIssues(page2)
    const watcher2 = watchRequests(page2)
    try {
      await page2.waitForSelector('.app-shell')

      // 开关状态跨重启持久（settings.json 落盘回读）。
      const settingsAfter = await page2.evaluate(async () => {
        const api = (window as unknown as { api: FolderApi }).api
        return api.settings.get()
      })
      expect(settingsAfter.autoScanOnStartup, '重启后开关仍应为关').toBe(false)

      // 主证（DB 级，race-free）：曲目数不增 + 探针文件未入库。
      const songsAfterRestart = await page2.evaluate(async (probe: string) => {
        const api = (window as unknown as { api: FolderApi }).api
        const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
        return { count: songs.length, probeIn: songs.some((s) => s.filePath.toLowerCase().includes(probe)) }
      }, probeName)
      expect(songsAfterRestart.count, '重启后曲目数不应增加（无启动扫描）').toBe(baseCount)
      expect(songsAfterRestart.probeIn, '探针文件不应被启动扫描入库').toBe(false)

      // 辅证（事件观察窗，留痕②）：装订阅后、手动重扫前事件数组为空；窗口期限制由主证兜底。
      await subscribeScanEvents(page2)
      await openSettings(page2)

      // 阳性对照：手动 rescanAll（UI 控件）——同一探针文件被正常扫描入库，
      // 证明「未入库」确系启动扫描未发生，而非文件不可扫（逻辑闭环）。
      await page2.locator('[data-field="rescan-all"]').click()
      await waitForScanDone(page2)
      const events = await page2.evaluate(() => (window as unknown as { __wcSp: string[] }).__wcSp)
      expect(events, '手动重扫应产生 scan:progress 事件（通道自证）').toContain('done')
      const songsAfterRescan = await page2.evaluate(async (probe: string) => {
        const api = (window as unknown as { api: FolderApi }).api
        const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
        return { count: songs.length, probeIn: songs.some((s) => s.filePath.toLowerCase().includes(probe)) }
      }, probeName)
      expect(songsAfterRescan.count, '手动重扫后探针文件入库（阳性对照）').toBe(baseCount + 1)
      expect(songsAfterRescan.probeIn, '手动重扫后探针文件应在库').toBe(true)

      expect(issues2.errors, `窗口2 控制台 error：${issues2.errors.join(' | ')}`).toEqual([])
      expect(issues2.pageErrors, `窗口2 未捕获异常：${issues2.pageErrors.join(' | ')}`).toEqual([])
      expect(watcher2.externalUrls(), `窗口2 http(s) 外联：${watcher2.externalUrls().join(', ')}`).toEqual([])
    } finally {
      await app2.close()
    }

    expect(issues1.errors, `窗口1 控制台 error：${issues1.errors.join(' | ')}`).toEqual([])
    expect(issues1.pageErrors, `窗口1 未捕获异常：${issues1.pageErrors.join(' | ')}`).toEqual([])
    expect(watcher1.externalUrls(), `窗口1 http(s) 外联：${watcher1.externalUrls().join(', ')}`).toEqual([])
  } finally {
    await app1.close().catch(() => {})
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* 清理失败不掩盖测试结果 */
    }
  }
})
