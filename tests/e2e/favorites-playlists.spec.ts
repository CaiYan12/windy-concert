import { test, expect, launchWithUserData } from './fixtures'
import { setupScannedLibrary, watchConsoleIssues, watchRequests } from './helpers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * T6.6 收藏 / 歌单 / 最近播放端到端（真 IPC + SQLite 链路），按计划三段组织：
 *
 * ① 收藏段（列表行）：收藏一首 → 播放栏同步为 ♥ → Liked 页出现且排序正确 → 取消同步。
 * ② 歌单段：新建歌单 → 右键添加 3 首 → 拖拽第 1 首到第 3 位 → **完整重启应用**（同一
 *    WC_USER_DATA 目录二次 launch）顺序持久（F6-3）→ 删除歌单。
 * ③ Recent 段（F7-2）：播放两首（一首播两次）→ Recent 去重且只占一行、时间为最新。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 实测探明的事实与取舍（先于实现核实）：
 *
 * ① 拖拽手法沿用 playlists.spec.ts 已验证的形态：Playwright 触发不了原生 HTML5 拖拽，
 *    在页面里用 DataTransfer + DragEvent 派发 dragstart→dragover→drop 序列，走真实
 *    React 处理器链。T6.6 的「拖拽后顺序变化」即最小断言（DOM 顺序 + repo 落库）；
 *    「reload 持久化」的既有覆盖在 playlists.spec.ts，本 spec 不重复，而是做**更强**的
 *    完整应用重启（见③）。
 *
 * ② F6-3 完整重启：playwright 配置为每用例独立进程内 fixture launch（fixtures.ts 的
 *    app fixture，per-test mkdtemp userData 且用后即删），无法直接「重启」。本 spec 经
 *    fixtures.ts 新增的 launchWithUserData(userDataDir) 以调用方持有的目录先后 launch
 *    两次：第一次创建歌单/加曲/拖拽，electronApp.close() 后二次 launch 同一目录——
 *    数据库、封面缓存全部沿真实落盘状态恢复，比 reload 更接近 F6-3 的本质（repo 事务
 *    持久化跨进程成立）。音乐目录（tmp 副本）必须存活到第二次 launch 结束后才清理。
 *
 * ③ Recent 去重的服务端语义：historyRepo.listRecent 用 MAX(id) 子查询去重（T1.3 修复，
 *    不受 datetime('now') 秒级并列影响）、ORDER BY played_at DESC, id DESC——「只占一行、
 *    最新在前」由 SQL 保证。样本选择：同专辑内 index0 与 index2 标题不同（index0/1 均
 *    叫「夜曲」，同名会让行身份不可判，playback-queue.spec 已留痕该事实）。
 *
 * ④ 短音轨防自动切歌：fixtures 音轨约 1–3s，每次双击后立即 freeze（暂停）再等
 *    recordPlay 落库（playCount 断言），避免曲终自动切歌写入计划外播放记录污染去重计数。
 *
 * ⑤ 零 http(s) 外联 + 控制台零 error 延续（launch.spec/scan-flow 确立的硬约束）。
 */

/** 测试内最小 window.api 形状（自洽，同既有 spec）。 */
interface ProbeApi {
  library: {
    listSongs: (params: {
      sortBy: string
      order?: string
      offset?: number
      limit?: number
    }) => Promise<Array<{ id: string; title: string }>>
    getAlbum: (id: number) => Promise<{ tracks: Array<{ id: string; title: string }> }>
    getTrack: (id: string) => Promise<{ id: string; playCount: number } | null>
  }
  playlists: {
    get: (id: number) => Promise<{
      playlist: { id: number | null; name: string } | null
      tracks: Array<{ id: string; title: string }>
    }>
  }
  favorites: {
    list: (sortBy: string) => Promise<Array<{ id: string; title: string }>>
  }
  onScanProgress: (cb: (p: { phase: string }) => void) => () => void
}

/** 页面曲目行（Songs / 歌单详情通用：排除表头）。 */
function dataRows(page: import('@playwright/test').Page, tableClass: string) {
  return page.locator(`${tableClass} .track-row:not(.track-row--head)`)
}

/** 冻结当前曲：立即暂停，避免 1–3s 短音轨曲终自动切歌写入计划外播放记录。 */
async function freeze(page: import('@playwright/test').Page): Promise<void> {
  const playing = page.locator('.transport button[aria-label="暂停"]')
  await playing.first().click({ timeout: 5_000 })
}

/** 等 recordPlay 落库（getTrack(id).playCount ≥ n；真实 IPC 往返证据）。 */
async function waitPlayCountAtLeast(
  page: import('@playwright/test').Page,
  trackId: string,
  n: number
): Promise<void> {
  await page.waitForFunction(
    async ({ id, atLeast }: { id: string; atLeast: number }) => {
      const api = (window as unknown as { api: ProbeApi }).api
      const t = await api.library.getTrack(id)
      return !!t && t.playCount >= atLeast
    },
    { id: trackId, atLeast: n },
    { timeout: 15_000 }
  )
}

/** 打开右键菜单 → 点「添加到歌单」父项 → 点子菜单里名为 name 的项。 */
async function addToPlaylistViaContextMenu(
  page: import('@playwright/test').Page,
  row: import('@playwright/test').Locator,
  playlistName: string
): Promise<void> {
  await row.click({ button: 'right' })
  const menu = page.locator('.context-menu[role="menu"]')
  await expect(menu).toBeVisible()
  // 父项点击展开子菜单（组件同时支持 hover 展开；click 语义更稳定）。
  await menu.locator('.context-item--parent').click()
  await menu.locator('.context-submenu button', { hasText: playlistName }).first().click()
  await expect(menu).toHaveCount(0)
}

// ---------------------------------------------------------------------------
// ① 收藏段（F6-1 列表行 → 播放栏 / Liked 三处同步）
// ---------------------------------------------------------------------------
test('T6.6 收藏段：列表行收藏 → 播放栏 ♥ → Liked 出现且在首位 → 取消同步', async ({ app }) => {
  test.setTimeout(120_000)
  const { page } = app
  const issues = watchConsoleIssues(page)
  const watcher = watchRequests(page)

  const { cleanup } = await setupScannedLibrary(page)
  try {
    await page.waitForSelector('.app-shell')

    // Songs 页（title ASC 首页）——行 i ↔ listSongs 第 i 行
    const titles = await page.evaluate(async () => {
      const api = (window as unknown as { api: ProbeApi }).api
      const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
      return songs.map((s) => s.title)
    })
    expect(titles.length).toBeGreaterThanOrEqual(1)

    // 等 Songs 首页行渲染（launch 默认落地 Songs；行 i ↔ listSongs 第 i 行）。
    await page.waitForSelector('.track-table .track-row:not(.track-row--head)')

    // 双击第 1 行起播（播放栏需要 currentTrack 才有 ♥ 可同步），立即冻结。
    await dataRows(page, '.track-table').nth(0).dblclick()
    await expect(page.locator('.player-title')).toHaveText(titles[0])
    await freeze(page)
    await waitPlayCountAtLeast(page, (await songIdByTitle(page, titles[0])), 1)

    // 列表行收藏第 1 首 → 行 aria 翻转（乐观）。
    const row0 = dataRows(page, '.track-table').nth(0)
    await row0.locator('button[aria-label="收藏"]').click()
    await expect(row0.locator('button[aria-label="取消收藏"]')).toHaveCount(1)

    // 播放栏同步为 ♥（favorites 切片为唯一事实源，T6.1 接线）。
    const playerLike = page.locator('.player-bar .player-like')
    await expect(playerLike).toHaveAttribute('aria-label', '取消收藏')
    await expect(playerLike).toHaveAttribute('aria-pressed', 'true')

    // Liked 页出现该曲且排序正确：favorited_at DESC 下唯一收藏必在首位（与服务端序一致）。
    await page.locator('.sidebar .nav-link').filter({ hasText: '收藏' }).click()
    await page.waitForFunction(() => window.location.hash === '#/liked')
    await expect(page.locator('.hero--liked')).toBeVisible()
    const likedRows = dataRows(page, '.track-table')
    await expect(likedRows).toHaveCount(1)
    await expect(likedRows.nth(0).locator('.track-title')).toHaveText(titles[0])
    // 服务端权威序对照（UI 呈现 = favorites:list 的排序结果）。
    const serverOrder = await page.evaluate(async () => {
      const api = (window as unknown as { api: ProbeApi }).api
      return (await api.favorites.list('favorited_at')).map((t) => t.title)
    })
    expect(serverOrder, '服务端 favorited_at 序应与 UI 行序一致').toEqual([titles[0]])
    // Liked 页内播放栏仍为 ♥（跨页同步不因导航丢失）。
    await expect(playerLike).toHaveAttribute('aria-label', '取消收藏')

    // 取消同步：在 Liked 行上取消收藏 → 行即时移除（乐观）+ 播放栏回 ♡。
    await likedRows.nth(0).locator('button[aria-label="取消收藏"]').click()
    await expect(likedRows).toHaveCount(0)
    await expect(playerLike).toHaveAttribute('aria-label', '收藏')
    await expect(playerLike).toHaveAttribute('aria-pressed', 'false')

    expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
    expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
    expect(watcher.externalUrls(), `存在 http(s) 外联：${watcher.externalUrls().join(', ')}`).toEqual([])
  } finally {
    cleanup()
  }
})

/** 按标题查曲目 id（ Songs 页行与 listSongs 序一致的锚定辅助）。 */
async function songIdByTitle(page: import('@playwright/test').Page, title: string): Promise<string> {
  return page.evaluate(async (t: string) => {
    const api = (window as unknown as { api: ProbeApi }).api
    const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 50 })
    const hit = songs.find((s) => s.title === t)
    if (!hit) throw new Error(`未找到曲目 ${t}`)
    return hit.id
  }, title)
}

// ---------------------------------------------------------------------------
// ② ③ 歌单段（含 F6-3 完整重启）与 Recent 段（F7-2）
// ---------------------------------------------------------------------------

test('T6.6 歌单段：新建 → 右键加 3 首 → 拖拽 1→3 → 完整重启顺序持久 → 删除', async () => {
  test.setTimeout(180_000)
  // 不用 app fixture：userData 目录需跨两次 launch 共享（见文件头取舍②）。
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-restart-'))

  const app1 = await launchWithUserData(userDataDir)
  const page1 = app1.page
  const issues1 = watchConsoleIssues(page1)
  const music = await setupScannedLibrary(page1)
  try {
    await page1.waitForSelector('.app-shell')

    // 样本曲目（title ASC 前 3 首）
    const titles = await page1.evaluate(async () => {
      const api = (window as unknown as { api: ProbeApi }).api
      const songs = await api.library.listSongs({ sortBy: 'title', order: 'asc', offset: 0, limit: 3 })
      return songs.map((s) => s.title)
    })
    expect(titles).toHaveLength(3)

    // —— 新建歌单（Playlists 页内联命名）——
    await page1.locator('.sidebar .nav-link').filter({ hasText: '歌单' }).click()
    await page1.waitForFunction(() => window.location.hash === '#/playlists')
    await page1.locator('.new-card').click()
    const nameInput = page1.locator('.inline-input')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('夜航西行')
    await nameInput.press('Enter')
    await page1.waitForFunction(() => /^#\/playlists\/\d+$/.test(window.location.hash))
    // 建单后详情页 hash 即歌单 id——必须在离开本页（去 Songs）前取走。
    const playlistId = await page1.evaluate(() => Number(window.location.hash.split('/').pop()))

    // —— Songs 页右键添加 3 首 ——
    await page1.locator('.sidebar .nav-link').filter({ hasText: '歌曲' }).click()
    await page1.waitForFunction(() => window.location.hash === '#/songs')
    await page1.waitForSelector('.track-table .track-row:not(.track-row--head)')
    for (let i = 0; i < 3; i++) {
      await addToPlaylistViaContextMenu(page1, dataRows(page1, '.track-table').nth(i), '夜航西行')
    }
    // 逐首等待真实落库（乐观 UI 早于 IPC，必须显式等服务端确认）。
    await page1.waitForFunction(
      async (id: number) => {
        const api = (window as unknown as { api: ProbeApi }).api
        const d = await api.playlists.get(id)
        return d.tracks.length === 3
      },
      playlistId,
      { timeout: 15_000 }
    )

    // —— 拖拽第 1 首到第 3 位（DataTransfer + DragEvent 序列，沿用 playlists.spec 手法）——
    await page1.evaluate((id: number) => {
      window.location.hash = `#/playlists/${id}`
    }, playlistId)
    await page1.waitForSelector('.track-table--draggable')
    const rowTitle = '.track-table--draggable .track-row:not(.track-row--head) .track-title'
    await expect(page1.locator(rowTitle)).toHaveCount(3)

    // 首行拖到第 3 行上缘 → applyTrackOrder 插入语义 → [t1, t0, t2]
    await page1.evaluate(() => {
      const r = Array.from(
        document.querySelectorAll('.track-table--draggable .track-row:not(.track-row--head)')
      )
      const dt = new DataTransfer()
      const init = { bubbles: true, cancelable: true, dataTransfer: dt } as DragEventInit
      r[0].dispatchEvent(new DragEvent('dragstart', init))
      r[2].dispatchEvent(new DragEvent('dragover', init))
      r[2].dispatchEvent(new DragEvent('drop', init))
    })
    const expected = [titles[1], titles[0], titles[2]]
    await expect
      .poll(async () => page1.locator(rowTitle).allTextContents(), { timeout: 10_000 })
      .toEqual(expected)
    // 落库确认（真实 reorder 事务写完）
    await page1.waitForFunction(
      async ({ id, want }: { id: number; want: string[] }) => {
        const api = (window as unknown as { api: ProbeApi }).api
        const d = await api.playlists.get(id)
        return d.tracks.map((t) => t.title).join('|') === want.join('|')
      },
      { id: playlistId, want: expected },
      { timeout: 10_000 }
    )

    // —— 完整重启（同一 WC_USER_DATA 二次 launch，F6-3）——
    await app1.close()
    const app2 = await launchWithUserData(userDataDir)
    try {
      const page2 = app2.page
      const issues2 = watchConsoleIssues(page2)
      await page2.waitForSelector('.app-shell')

      // 经 UI 导航：歌单网格 → 打开「夜航西行」
      await page2.locator('.sidebar .nav-link').filter({ hasText: '歌单' }).click()
      await page2.waitForFunction(() => window.location.hash === '#/playlists')
      await page2.locator('.playlist-card', { hasText: '夜航西行' }).click()
      await page2.waitForSelector('.track-table--draggable')
      await expect(page2.locator(rowTitle)).toHaveCount(3)
      expect(
        await page2.locator(rowTitle).allTextContents(),
        '重启后拖拽顺序应持久（F6-3）'
      ).toEqual(expected)

      // —— 删除歌单（行内确认条）——
      await page2.locator('.hero-actions .danger-text').click()
      await expect(page2.locator('.inline-confirm')).toBeVisible()
      await page2.locator('.inline-confirm button').filter({ hasText: '确认删除' }).click()
      await page2.waitForFunction(() => window.location.hash === '#/playlists')
      await expect(page2.locator('#main-content')).toContainText('还没有歌单')
      await expect(page2.locator('.sidebar .playlist-link')).toHaveCount(0)

      expect(issues2.errors, `控制台出现 error 日志（重启后）：${issues2.errors.join(' | ')}`).toEqual([])
      expect(issues2.pageErrors, `存在未捕获异常（重启后）：${issues2.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await app2.close()
    }

    expect(issues1.errors, `控制台出现 error 日志：${issues1.errors.join(' | ')}`).toEqual([])
    expect(issues1.pageErrors, `存在未捕获异常：${issues1.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    music.cleanup()
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* noop */
    }
  }
})

test('T6.6 Recent 段：播放两首（一首播两次）→ 去重只占一行且最新在前（F7-2）', async ({ app }) => {
  test.setTimeout(120_000)
  const { page } = app
  const issues = watchConsoleIssues(page)
  const watcher = watchRequests(page)

  const { cleanup } = await setupScannedLibrary(page)
  try {
    await page.waitForSelector('.app-shell')

    // 专辑详情（曲目最多专辑），取标题不同的两首（index0/1 同名「夜曲」，见文件头取舍③）。
    const { albumId, tracks } = await page.evaluate(async () => {
      const api = (window as unknown as {
        api: {
          library: {
            listAlbums: () => Promise<Array<{ id: number; trackCount: number }>>
            getAlbum: (id: number) => Promise<{ tracks: Array<{ id: string; title: string }> }>
          }
        }
      }).api
      const albums = await api.library.listAlbums()
      const best = albums.reduce((acc, a) => (a.trackCount > acc.trackCount ? a : acc), albums[0])
      const d = await api.library.getAlbum(best.id)
      return { albumId: best.id, tracks: d.tracks }
    })
    const trackA = tracks[0]
    const trackB = tracks[2]
    expect(trackA.title, '样本前置：两首标题须不同（同名不可判行身份）').not.toBe(trackB.title)

    await page.evaluate((id: number) => {
      window.location.hash = `#/albums/${id}`
    }, albumId)
    await page.waitForSelector('.detail-tracklist .track-row', undefined, { timeout: 30_000 })
    const rows = dataRows(page, '.detail-tracklist')

    // 播 A → 冻结 → 等计费；播 B → 冻结；再播 A → 冻结（每步立即冻结防自动切歌，取舍④）。
    await rows.nth(0).dblclick()
    await expect(page.locator('.player-title')).toHaveText(trackA.title)
    await freeze(page)
    await waitPlayCountAtLeast(page, trackA.id, 1)

    await rows.nth(2).dblclick()
    await expect(page.locator('.player-title')).toHaveText(trackB.title)
    await freeze(page)
    await waitPlayCountAtLeast(page, trackB.id, 1)

    await rows.nth(0).dblclick()
    await expect(page.locator('.player-title')).toHaveText(trackA.title)
    await freeze(page)
    await waitPlayCountAtLeast(page, trackA.id, 2)

    // Recent 页：A 播两次仍只占一行（MAX(id) 去重），最新在前 → [A, B]；A 的时间列为
    // 相对时间（刚刚/分钟前）——「时间为最新」由服务端 played_at DESC 排序的行序保证。
    await page.locator('.sidebar .nav-link').filter({ hasText: '最近播放' }).click()
    await page.waitForFunction(() => window.location.hash === '#/recent')
    await page.waitForSelector('.track-table--recent .track-row:not(.track-row--head)')
    const recentRows = dataRows(page, '.track-table--recent')
    await expect(recentRows).toHaveCount(2)
    await expect(recentRows.nth(0).locator('.track-title')).toHaveText(trackA.title)
    await expect(recentRows.nth(1).locator('.track-title')).toHaveText(trackB.title)
    await expect(recentRows.nth(0).locator('[data-field="played-at"]')).toHaveText(/^(刚刚|\d+ 分钟前)$/)

    expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
    expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
    expect(watcher.externalUrls(), `存在 http(s) 外联：${watcher.externalUrls().join(', ')}`).toEqual([])
  } finally {
    cleanup()
  }
})
