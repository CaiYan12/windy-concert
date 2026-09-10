import { test, expect } from './fixtures'

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
