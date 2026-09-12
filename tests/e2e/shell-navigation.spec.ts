import { test, expect } from './fixtures'
import { watchConsoleIssues, watchRequests } from './helpers'

/**
 * T4.1 壳层冒烟（最小版）——承载 T4.0 顺延的验收项：
 *   ① 首屏全部请求中**无 http(s) 外联**（Local-first 硬约束，CSP 之外的第二道防线）；
 *   ② 侧栏真实渲染的 <img class="library-icon"> 的 naturalWidth > 0（T4.0 时 Icon 无消费者被
 *      tree-shake，只能用 renderToStaticMarkup 断言 HTML，无法度量真实解码结果）；
 *   ③ vendored svg 确实作为独立资产被请求（排除「图标被内联/未落盘」的假通过）。
 *
 * 说明：本文件是 shell-navigation.spec 的最小版；**T4.8 将在其上扩展逐路由导航与
 * 控制台无 error 的断言**（计划 T4.8 原文），本任务只保证壳层与路由基线的断言存在。
 */
test('壳层首屏：仅本地请求，侧栏图标真实解码，默认落在 Songs', async ({ app }) => {
  const { page } = app

  const requests: string[] = []
  page.on('request', (request) => {
    requests.push(request.url())
  })

  // reload：让监听器就位后完整捕获首屏 html/js/css/svg 的全部请求。
  await page.reload()
  await page.waitForSelector('.app-shell')

  // ① 无 http(s) 外联
  const external = requests.filter((url) => /^https?:/i.test(url))
  expect(external, `存在 http(s) 外联请求：${external.join(', ')}`).toEqual([])

  // ③ 本地 svg 资产确实被请求（build 产物中 Icon 未被 tree-shake）
  expect(
    requests.some((url) => /\.svg(\?|$)/.test(url)),
    `请求中未见 vendored svg 资产：${requests.join('\n')}`
  ).toBe(true)

  // ② 侧栏图标 naturalWidth > 0
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('.sidebar img.library-icon')).some(
      (icon) => icon.complete && icon.naturalWidth > 0
    )
  )
  const naturalWidth = await page
    .locator('.sidebar img.library-icon')
    .first()
    .evaluate((el) => (el as HTMLImageElement).naturalWidth)
  expect(naturalWidth).toBeGreaterThan(0)

  // 默认路由：hash 落在 #/songs，侧栏「歌曲」为当前页
  await page.waitForFunction(() => window.location.hash === '#/songs')
  const current = page.locator('.sidebar .nav-link[aria-current="page"]')
  await expect(current).toHaveCount(1)
  await expect(current).toHaveText(/歌曲/)
})

test('导航可用：点击侧栏「专辑」后标题/路由/活跃态同步更新', async ({ app }) => {
  const { page } = app
  await page.waitForSelector('.app-shell')

  await page.locator('.sidebar .nav-link').filter({ hasText: '专辑' }).click()

  await page.waitForFunction(() => window.location.hash === '#/albums')
  await expect(page.locator('.topbar .page-title')).toHaveText('专辑')
  await expect(page.locator('.topbar .eyebrow')).toHaveText('Music library')
  await expect(page.locator('.sidebar .nav-link[aria-current="page"]')).toHaveText(/专辑/)

  // 未知 hash 重定向回落地页（无死链）
  await page.evaluate(() => {
    window.location.hash = '#/does-not-exist'
  })
  await page.waitForFunction(() => window.location.hash === '#/songs')
  await expect(page.locator('.topbar .page-title')).toHaveText('歌曲')
})

/**
 * C1 回归（T4.1 评审）：skip-link 在 hash 路由下曾把 location.hash 改成 `#main-content`，
 * react-router 读成路径 `main-content` → 未命中 → `*` 兜底 Navigate 回 /songs。
 * **必须落在非 Songs 页**——在 /songs 上激活时「弹回 /songs」与外观看不出差别，正是原漏检原因。
 */
test('skip-link 在非 Songs 页激活后不跳路由，焦点落到主内容（C1 回归）', async ({ app }) => {
  const { page } = app
  await page.waitForSelector('.app-shell')

  // 先进入「专辑」（非 Songs 页）
  await page.locator('.sidebar .nav-link').filter({ hasText: '专辑' }).click()
  await page.waitForFunction(() => window.location.hash === '#/albums')

  // 键盘激活 skip-link（它是壳层首个可聚焦元素，等价真实 Tab+Enter）
  await page.locator('.skip-link').focus()
  await expect(page.locator('.skip-link')).toBeFocused()
  await page.keyboard.press('Enter')

  // 断言：hash 未变、仍是专辑页、焦点程序化落到 #main-content
  expect(await page.evaluate(() => window.location.hash)).toBe('#/albums')
  await expect(page.locator('.topbar .page-title')).toHaveText('专辑')
  await expect(page.locator('.sidebar .nav-link[aria-current="page"]')).toHaveText(/专辑/)
  await expect(page.locator('#main-content')).toBeFocused()
})

/**
 * T4.8 逐路由导航矩阵：11 条路由（routes.ts ROUTE_DEFS）逐一直达，断言渲染无异常。
 *
 * 断言形态按页面落地状态分三档（计划 T4.8 原文「渲染无异常」的落地解释）：
 *   · 真实页（songs/albums/artists）：页头真实标题 + 主内容区渲染（空库下是空态，也是合法渲染）；
 *   · 真实详情页（albums/:id、artists/:id）：空库无实体，用不存在的 id 直达 → notFound 空态
 *     （「未找到该专辑/艺术家」）——这本身是真实渲染分支，且证明带参路由不会死链/白屏；
 *   · 真实页（T6.1 起含 /liked）：页头标题 + 主内容区渲染（空库下 Liked 走空态，也是合法渲染）；
 *   · 真实页（T6.2 起含 /playlists、/playlists/:id）：页头标题 + 主内容区渲染（空库下歌单页走
 *     空态、详情页用不存在的 id 走 notFound，都是真实渲染分支）；
 *   · 真实页（T7.1 起含 /settings）：四分区真实渲染，marker 取 About 分区「已知限制」
 *     区头（静态 i18n 文案，不依赖取数落地）；占位页仅剩 /search 空查询（引导文案）。
 * 全程控制台无 error 级日志、无未捕获异常（pageerror）。
 * 零 http(s) 外联断言随导航全程收集（Local-first 硬约束，模式延续）。
 */
test('T4.8 逐路由矩阵：11 条路由直达渲染无异常，控制台无 error', async ({ app }) => {
  const { page } = app
  const issues = watchConsoleIssues(page)
  const watcher = watchRequests(page)

  // 先挂监听再 reload，完整覆盖启动期 + 逐路由导航期。
  await page.reload()
  await page.waitForSelector('.app-shell')

  const ROUTE_MATRIX: Array<{ hash: string; title: string; marker: string }> = [
    { hash: '#/songs', title: '歌曲', marker: '全部歌曲' },
    { hash: '#/albums', title: '专辑', marker: '专辑' },
    { hash: '#/albums/999999', title: '专辑详情', marker: '未找到该专辑' },
    { hash: '#/artists', title: '艺术家', marker: '艺术家' },
    { hash: '#/artists/999999', title: '艺术家详情', marker: '未找到该艺术家' },
    // T6.2：/playlists 已落地为真实「歌单」页（空库下渲染空态，页头 h2 = 我的歌单）；
    // /playlists/:id 用不存在的 id 直达 → notFound 空态（真实渲染分支，证带参路由不死链）。
    { hash: '#/playlists', title: '歌单', marker: '我的歌单' },
    { hash: '#/playlists/999999', title: '歌单详情', marker: '未找到该歌单' },
    // T6.1：/liked 已落地为真实「收藏」页；空库下渲染空态（empty.liked.title）。
    { hash: '#/liked', title: '收藏', marker: '还没有收藏的歌曲' },
    // T6.5：/recent 已落地为真实「最近播放」页；空库下渲染空态（empty.recent.title）。
    { hash: '#/recent', title: '最近播放', marker: '暂无播放记录' },
    // T7.1：/settings 落地真实「设置」页（四分区）；marker 取 About 分区静态区头
    // 「已知限制」（原占位文案「页面内容将在后续任务中接入」随占位移除而失效，必要同步留痕）。
    { hash: '#/settings', title: '设置', marker: '已知限制' },
    { hash: '#/search?q=', title: '搜索结果', marker: '输入关键词开始搜索' }
  ]

  for (const route of ROUTE_MATRIX) {
    await page.evaluate((hash) => {
      window.location.hash = hash
    }, route.hash)
    // 顶栏标题来自路由 handle（react-router 唯一匹配器）——标题正确即路由命中。
    await expect(page.locator('.topbar .page-title')).toHaveText(route.title)
    // 主内容区目标文案出现（真实页页头 / notFound 空态 / 占位文案 / 搜索空查询引导）。
    await expect(page.locator('#main-content')).toContainText(route.marker)
    // hash 确实落位（未被 `*` 兜底重定向回 /songs——重定向即死链）。
    expect(await page.evaluate(() => window.location.hash)).toBe(route.hash)
  }

  expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
  expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])

  const external = watcher.externalUrls()
  expect(external, `存在 http(s) 外联请求：${external.join(', ')}`).toEqual([])
})

/**
 * T4.8 F3-1 无死链验收：侧栏全部入口（routes.ts 派生的 7 项）逐一点击，目标均真实渲染。
 * 「无死链」的可观测定义：点击后 hash 落位、aria-current 迁移、顶栏标题同步、主内容非空，
 * 且全程控制台无 error（白屏/异常往往伴随 console error 或 pageerror）。
 */
test('T4.8 F3-1 无死链：侧栏七入口逐一点击均可导航且目标渲染', async ({ app }) => {
  const { page } = app
  const issues = watchConsoleIssues(page)
  await page.waitForSelector('.app-shell')

  const SIDEBAR_ENTRIES: Array<{ label: string; hash: string }> = [
    { label: '歌曲', hash: '#/songs' },
    { label: '专辑', hash: '#/albums' },
    { label: '艺术家', hash: '#/artists' },
    { label: '歌单', hash: '#/playlists' },
    { label: '收藏', hash: '#/liked' },
    { label: '最近播放', hash: '#/recent' },
    { label: '设置', hash: '#/settings' }
  ]

  for (const entry of SIDEBAR_ENTRIES) {
    const link = page.locator('.sidebar .nav-link').filter({ hasText: entry.label })
    await expect(link).toHaveCount(1)
    await link.click()
    await page.waitForFunction((hash) => window.location.hash === hash, entry.hash)
    // aria-current 迁移到当前项（NavLink 活跃态）。
    const current = page.locator('.sidebar .nav-link[aria-current="page"]')
    await expect(current).toHaveCount(1)
    await expect(current).toHaveText(new RegExp(entry.label))
    // 顶栏标题同步 + 主内容非空（占位页有占位文案，真实页有页头/空态）。
    await expect(page.locator('.topbar .page-title')).toHaveText(entry.label)
    await expect(page.locator('#main-content')).not.toBeEmpty()
  }

  expect(issues.errors, `控制台出现 error 日志：${issues.errors.join(' | ')}`).toEqual([])
  expect(issues.pageErrors, `存在未捕获异常：${issues.pageErrors.join(' | ')}`).toEqual([])
})
