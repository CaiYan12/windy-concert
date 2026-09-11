// T4.7 验收：扫描入库 → 浏览主链路 → 搜索链路 e2e（经真实 IPC + main 侧 SQLite/扫描/封面管线）。
//
// 用例一（扫描与浏览主链路）：setupScannedLibrary（helpers，fixtures 拷贝 + addFolder + scan
//   等 phase:'done'）→ #/songs 行数 = 7（08-broken 按 F1-7 跳过）→ 点击「标题」列翻转为
//   desc → 断言首行变化 → #/albums 网格出现且真实封面解码（naturalWidth > 0，既有模式）→
//   进专辑详情：DOM 曲目行序与 repo 期望序（getAlbum 的 disc→trackNumber 排序）逐一相等
//   （不硬编码曲名，fixtures 变更不破测试）→ #/artists 艺术家名无重复且计数 = 真实值。
//
// 用例二（搜索链路）：直接导航 `#/search?q=夜曲`，从计时起点到首个 .result-group 可见的
//   间隔 < 预算。阈值策略（计划原文「放宽至 500ms 并注明」）：**300ms 是设计目标（本地
//   基准），默认跑 500ms 宽松值**（CI / 首次冷启动的 IPC 与渲染波动）；设
//   WC_E2E_SEARCH_STRICT=1 时收紧回 300ms 设计基准。实测值打日志留痕。
//   「夜曲」= 2 字符 < 3 → repo 侧走 LIKE 回退路径（trackRepo.search 内部路由，§3.5d），
//   「中文两字查询命中」即断言该 LIKE 路径返回结果（非 FTS）。
//
// 两用例均延续零 http(s) 外联断言（Local-first 硬约束，launch.spec 确立的模式）。
import { test, expect } from './fixtures'
import { setupScannedLibrary, watchRequests, type ApiLike } from './helpers'

test('扫描入库 → Songs 7 行 → 标题排序 → Albums 封面 → 专辑详情按序 → Artists 无重复', async ({
  app,
}) => {
  test.setTimeout(120_000)
  const { firstWindow: page } = app
  const watcher = watchRequests(page)

  const { cleanup } = await setupScannedLibrary(page)
  try {
    // ---- Songs：默认落地页，行数 = 7 ----
    await page.waitForFunction(() => window.location.hash === '#/songs')
    await page.waitForSelector('.track-table[role="table"]', undefined, { timeout: 30_000 })
    const rows = page.locator('.track-row:not(.track-row--head)')
    await expect(rows).toHaveCount(7, { timeout: 30_000 })

    // ---- 排序：点击「标题」列，首行变化（libraryStore 默认 title asc → 点击翻 desc）----
    const firstTitle = page.locator('.track-row:not(.track-row--head) .track-title').first()
    const beforeSort = await firstTitle.textContent()
    const titleSort = page.locator('.track-row--head .sort-button').filter({ hasText: '标题' })
    await expect(titleSort).toHaveCount(1)
    await titleSort.click()
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('.track-row:not(.track-row--head) .track-title')
        return !!el && el.textContent !== prev
      },
      beforeSort,
      { timeout: 30_000 },
    )
    expect(await firstTitle.textContent()).not.toBe(beforeSort)

    // ---- Albums 网格：出现 + 真实封面解码（fixtures 中 album2/cover.jpg 保证至少 1 张实图）----
    // 先在 api 层轮询等 coverId 落库（covers:ready 与 scan done 无时序耦合，同 scan-flow.spec），
    // 再 reload：Albums 页挂载时经 useBrowseData 取一次 listAlbums，封面后到**不重取**——
    // 不 reload 的话网格永远渲染占位（tracklist.spec 同款「等落库 + reload」形态）。
    const coverAlbum = await page.evaluate(async () => {
      const api = (window as unknown as { api: ApiLike }).api
      const deadline = Date.now() + 20_000
      while (Date.now() < deadline) {
        const albums = await api.library.listAlbums()
        const hit = albums.find((a) => a.coverId)
        if (hit) return hit
        await new Promise((r) => setTimeout(r, 500))
      }
      return null
    })
    expect(coverAlbum, '20s 内 listAlbums 未出现非空 coverId（封面管线未落库）').toBeTruthy()
    await page.evaluate(() => {
      window.location.hash = '#/albums'
    })
    await page.reload()
    await page.waitForSelector('.album-grid', undefined, { timeout: 30_000 })
    const albumCards = page.locator('.album-card')
    await expect(albumCards).not.toHaveCount(0)

    // 页面内轮询：至少 1 张实图，且实图全部真解码（占位分支合法，但「有 src 不出图」不允许）。
    const coverTally = await page.evaluate(async () => {
      const deadline = Date.now() + 20_000
      const tally = (): { real: number; decoded: number; placeholder: number } => {
        const covers = Array.from(document.querySelectorAll('.album-card .cover'))
        const real = covers.filter((c) => c.querySelector('img[src^="wc-cover:"]'))
        const decoded = real.filter((c) => {
          const img = c.querySelector<HTMLImageElement>('img')
          return !!img && img.complete && img.naturalWidth > 0
        })
        return { real: real.length, decoded: decoded.length, placeholder: covers.length - real.length }
      }
      let t = tally()
      while ((t.real === 0 || t.decoded !== t.real) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500))
        t = tally()
      }
      return t
    })
    expect(coverTally.real).toBeGreaterThan(0)
    expect(coverTally.decoded).toBe(coverTally.real)

    // ---- 专辑详情：曲目行序 = repo 期望序（getAlbum 的 disc→trackNumber 排序）----
    // 取曲目最多的专辑（fixtures 侧主专辑 > album2，动态选取，fixtures 变更不破测试）。
    const targetAlbum = await page.evaluate(async () => {
      const albums = await (window as unknown as { api: ApiLike }).api.library.listAlbums()
      return albums.reduce((best, a) => (a.trackCount > best.trackCount ? a : best))
    })
    await page.evaluate((id) => {
      window.location.hash = `#/albums/${id}`
    }, targetAlbum.id)
    await page.waitForSelector('.hero--album', undefined, { timeout: 30_000 })
    const expected = await page.evaluate(async (id) => {
      const detail = await (window as unknown as { api: ApiLike }).api.library.getAlbum(id)
      return detail.tracks.map((t) => t.title)
    }, targetAlbum.id)
    expect(expected.length).toBeGreaterThan(0)
    const detailRows = page.locator('.detail-tracklist .track-row:not(.track-row--head)')
    await expect(detailRows).toHaveCount(expected.length, { timeout: 30_000 })
    const domTitles = await detailRows.locator('.track-title').allTextContents()
    expect(domTitles).toEqual(expected)

    // ---- Artists：无重复 + 计数 = 真实值（页头「共 N 位」与 listArtists 对账）----
    await page.evaluate(() => {
      window.location.hash = '#/artists'
    })
    await page.waitForSelector('.artist-list', undefined, { timeout: 30_000 })
    const artistRows = page.locator('.artist-row')
    await expect(artistRows).not.toHaveCount(0)
    const domNames = await page.locator('.artist-row .artist-name').allTextContents()
    expect(new Set(domNames).size).toBe(domNames.length)
    const apiArtists = await page.evaluate(() =>
      (window as unknown as { api: ApiLike }).api.library.listArtists(),
    )
    expect(domNames.length).toBe(apiArtists.length)
    const headCount = await page.locator('.page-head p').textContent()
    expect(headCount).toContain(`共 ${apiArtists.length} 位`)

    // ---- 零 http(s) 外联（全链路收集，含 wc-cover 协议与本地资产）----
    const external = watcher.externalUrls()
    expect(external, `存在 http(s) 外联请求：${external.join(', ')}`).toEqual([])
  } finally {
    cleanup()
  }
})

test('搜索「夜曲」：两字查询走 LIKE 路径命中，结果页出结果在阈值内', async ({ app }) => {
  test.setTimeout(120_000)
  const { firstWindow: page } = app
  const watcher = watchRequests(page)

  const { cleanup } = await setupScannedLibrary(page)
  try {
    // 计时起点 → hash 导航 → 首个 .result-group 可见。
    // 「夜曲」2 字符 < 3：trackRepo.search 内部路由走 LIKE 回退（≥3 才走 FTS trigram），
    // 本断言即该 LIKE 路径的 e2e 证据。
    // 阈值：默认 500ms 宽松值（CI / 冷启动波动，计划原文注明）；WC_E2E_SEARCH_STRICT=1
    // 收紧回 300ms 设计目标（本地基准）。
    const SEARCH_BUDGET_MS = process.env.WC_E2E_SEARCH_STRICT ? 300 : 500
    const q = encodeURIComponent('夜曲')
    const t0 = Date.now()
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, `#/search?q=${q}`)
    await page.waitForSelector('.result-group', { state: 'visible', timeout: 10_000 })
    const duration = Date.now() - t0
    // eslint-disable-next-line no-console
    console.log(
      `[scan-and-browse-e2e] 搜索「夜曲」出结果耗时 ${duration}ms（设计目标 300ms / 宽松阈值 ${SEARCH_BUDGET_MS}ms）`,
    )
    expect(duration).toBeLessThan(SEARCH_BUDGET_MS)

    // 中文两字查询命中：歌曲组存在，且曲目标题含「夜曲」（LIKE %夜曲% 命中 embedded 标签）。
    const trackGroup = page.locator('.result-group[aria-label="歌曲"]')
    await expect(trackGroup).toBeVisible()
    await expect(trackGroup.locator('.track-title').first()).toHaveText(/夜曲/)
    await expect(trackGroup.locator('.track-row[role="row"]')).not.toHaveCount(0)

    // 零 http(s) 外联（搜索链路同样收口本地）。
    const external = watcher.externalUrls()
    expect(external, `存在 http(s) 外联请求：${external.join(', ')}`).toEqual([])
  } finally {
    cleanup()
  }
})
