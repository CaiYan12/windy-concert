import { test, expect } from './fixtures'
import { setupScannedLibrary, watchConsoleIssues, watchRequests } from './helpers'

/**
 * T6.2 / T6.3 歌单 e2e —— 真 IPC 往返（create/rename/delete/reorder）与真实 DnD。
 *
 * 为什么需要（超出单测的覆盖面）：歌单页/详情页单测一律用 window.api 桩，只证明「页面以正确
 * 参数调用 store / api」；本 spec 走真实 preload → IPC → repo → SQLite 链路，证明：
 *   ① 内联命名 → playlists:create → 跳详情 → 侧栏/网格刷新，是端到端可用的；
 *   ② 行内确认条删除真的落库（回列表后歌单与侧栏条目一并消失）；
 *   ③ T6.3 拖拽重排真的持久化（重排顺序在 reload 后仍成立）——这是「全量 reorder 持久化」
 *      验收口径唯一能证伪「只改了内存」的断言。
 *
 * DnD 手法：Playwright 无法触发真实 HTML5 原生拖拽（mouse.move 不产生 dragstart），
 * 因此在页面里用 DataTransfer + DragEvent 派发同一条事件序列（dragstart→dragover→drop），
 * 走的就是浏览器会走的那批 React 处理器。
 *
 * 隔离：每个用例独立 userData（fixtures.ts），故歌单表从空开始；本 spec 自身不依赖扫描，
 * 只有 T6.3 用例需要真实曲目（走 setupScannedLibrary）。
 */

/** 本 spec 用到的最小 window.api 形状（自洽，不依赖 preload d.ts）。 */
interface PlaylistApiLike {
  library: {
    listSongs: (params: {
      sortBy: string
      order?: string
      offset?: number
      limit?: number
    }) => Promise<Array<{ id: string; title: string }>>
  }
  playlists: {
    create: (name: string) => Promise<{ id: number; name: string }>
    get: (id: number) => Promise<{
      playlist: { id: number | null; name: string } | null
      tracks: Array<{ id: string; title: string }>
    }>
    addTracks: (id: number, trackIds: string[]) => Promise<void>
  }
}

test('T6.2 歌单 CRUD 往返：内联新建 → 侧栏/详情 → 重命名 → 行内确认条删除', async ({ app }) => {
  const { page } = app
  const issues = watchConsoleIssues(page)
  const watcher = watchRequests(page)

  await page.waitForSelector('.app-shell')

  // 进入歌单页：空库 → 空态 + 虚线新建卡
  await page.locator('.sidebar .nav-link').filter({ hasText: '歌单' }).click()
  await page.waitForFunction(() => window.location.hash === '#/playlists')
  await expect(page.locator('#main-content')).toContainText('还没有歌单')

  // 内联命名：点虚线卡 → 输入名称 → Enter
  await page.locator('.new-card').click()
  const nameInput = page.locator('.inline-input')
  await expect(nameInput).toBeVisible()
  await nameInput.fill('夜行列车')
  await nameInput.press('Enter')

  // 建单后跳进详情页（新建即以该名落库，空曲目）
  await page.waitForFunction(() => /^#\/playlists\/\d+$/.test(window.location.hash))
  await expect(page.locator('.hero h2')).toHaveText('夜行列车')
  await expect(page.locator('.topbar .page-title')).toHaveText('歌单详情')
  await expect(page.locator('#main-content')).toContainText('这个歌单还没有歌曲')

  // 侧栏「我的歌单」出现该条目（列表已刷新）
  await expect(
    page.locator('.sidebar .playlist-link').filter({ hasText: '夜行列车' })
  ).toHaveCount(1)

  // 双击标题 → 内联重命名 → Enter
  await page.locator('.hero h2').dblclick()
  const renameInput = page.locator('.hero-rename .inline-input')
  await expect(renameInput).toBeVisible()
  await renameInput.fill('通勤 · 夜行')
  await renameInput.press('Enter')
  await expect(page.locator('.hero h2')).toHaveText('通勤 · 夜行')
  await expect(
    page.locator('.sidebar .playlist-link').filter({ hasText: '通勤 · 夜行' })
  ).toHaveCount(1)

  // 删除：行内确认条 → 先取消（不落库）
  await page.locator('.hero-actions .danger-text').click()
  await expect(page.locator('.inline-confirm')).toBeVisible()
  await expect(page.locator('.inline-confirm')).toContainText('确认删除歌单')
  await page.locator('.inline-confirm button').filter({ hasText: '取消' }).click()
  await expect(page.locator('.inline-confirm')).toHaveCount(0)
  await expect(page.locator('.hero h2')).toHaveText('通勤 · 夜行')

  // 再次删除 → 确认 → 回列表且条目彻底消失
  await page.locator('.hero-actions .danger-text').click()
  await page.locator('.inline-confirm button').filter({ hasText: '确认删除' }).click()
  await page.waitForFunction(() => window.location.hash === '#/playlists')
  await expect(page.locator('#main-content')).toContainText('还没有歌单')
  await expect(page.locator('.sidebar .playlist-link')).toHaveCount(0)

  expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
  expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
  expect(watcher.externalUrls(), `存在 http(s) 外联请求：${watcher.externalUrls().join(', ')}`).toEqual(
    []
  )
})

test('T6.3 拖拽重排：行落位后全量持久化，reload 后顺序不变', async ({ app }) => {
  const { page } = app
  const issues = watchConsoleIssues(page)
  await page.waitForSelector('.app-shell')

  const library = await setupScannedLibrary(page)
  try {
    // 取真实曲目（title ASC）并建一个含前 3 首的歌单
    const titles = await page.evaluate(async () => {
      const w = window as unknown as { api: PlaylistApiLike }
      const songs = await w.api.library.listSongs({
        sortBy: 'title',
        order: 'asc',
        offset: 0,
        limit: 50
      })
      return songs.map((s) => s.title)
    })
    expect(titles.length).toBeGreaterThanOrEqual(3)

    const playlistId = await page.evaluate(async () => {
      const w = window as unknown as { api: PlaylistApiLike }
      const songs = await w.api.library.listSongs({
        sortBy: 'title',
        order: 'asc',
        offset: 0,
        limit: 3
      })
      const created = await w.api.playlists.create('拖拽样本')
      await w.api.playlists.addTracks(
        created.id,
        songs.map((s) => s.id)
      )
      return created.id
    })

    await page.evaluate((id) => {
      window.location.hash = `#/playlists/${id}`
    }, playlistId)
    await page.waitForSelector('.track-table--draggable')

    const rowLocator = '.track-table--draggable .track-row:not(.track-row--head) .track-title'
    await expect(page.locator(rowLocator)).toHaveCount(3)

    // 首行拖到第 3 行的**上缘** → 期望 [2,1,3]（applyTrackOrder 的插入语义：源行移除后
    // 目标行左移一位，故插入位为 to-1）
    await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('.track-table--draggable .track-row:not(.track-row--head)')
      )
      const dt = new DataTransfer()
      const init = { bubbles: true, cancelable: true, dataTransfer: dt } as DragEventInit
      rows[0].dispatchEvent(new DragEvent('dragstart', init))
      rows[2].dispatchEvent(new DragEvent('dragover', init))
      rows[2].dispatchEvent(new DragEvent('drop', init))
    })

    const expected = [titles[1], titles[0], titles[2]]

    // ① DOM 顺序（乐观更新即时可见）
    await expect
      .poll(async () => page.locator(rowLocator).allTextContents(), { timeout: 10_000 })
      .toEqual(expected)

    // ② 落库（等 IPC 写完成——乐观更新早于写请求，必须显式等真实持久化）
    await page.waitForFunction(
      async (want: string[]) => {
        const w = window as unknown as { api: PlaylistApiLike }
        const raw = window.location.hash.split('/').pop()
        const detail = await w.api.playlists.get(Number(raw))
        return detail.tracks.map((t) => t.title).join('|') === want.join('|')
      },
      expected,
      { timeout: 10_000 }
    )

    // ③ reload 后顺序仍成立（真持久化的唯一证明）
    await page.reload()
    await page.waitForSelector('.track-table--draggable')
    await expect(page.locator(rowLocator)).toHaveCount(3)
    expect(await page.locator(rowLocator).allTextContents()).toEqual(expected)
  } finally {
    library.cleanup()
  }

  expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
  expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
})
