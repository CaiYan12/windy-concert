// Phase 3 验收：扫描全链路 e2e（计划 §5）。
//   launch（临时 userData，fixtures.ts 提供）→ 先订阅 scan:progress 收集 →
//   library.addFolder(tests/fixtures/music) → 等待 phase:'done' →
//   library:listSongs 返回 7 条（08-broken 按 F1-7 跳过）→
//   轮询 library:listAlbums 直到 coverId 非空（covers:ready 与 scan done 无时序耦合，
//   故用轮询稳健形态）→ 页面注入 <img src="wc-cover://{coverId}?s=256"> →
//   Playwright 断言 naturalWidth > 0（wc-cover 协议出图）。
// 断言性细节：01-夜曲 的 title 取 embedded 标签（'夜曲'）；04-untagged 的 title
//   回退文件名去扩展名（'04-untagged'）；06 wma playable=false（F1-3）。
import path from 'node:path'
import { test, expect } from './fixtures'

/** 测试内最小 window.api 形状（自洽，不依赖 preload d.ts 注入 e2e tsconfig）。 */
interface ApiLike {
  library: {
    addFolder: (path?: string) => Promise<{ id: number }>
    listSongs: (params: {
      sortBy: string
      order?: string
      offset?: number
      limit?: number
    }) => Promise<
      Array<{
        title: string
        filePath: string
        format: string
        playable: boolean
        coverId: string | null
      }>
    >
    listAlbums: () => Promise<Array<{ id: number; coverId: string | null }>>
  }
  onScanProgress: (cb: (p: { phase: string; done: number; total: number }) => void) => () => void
}

test('scan full-chain: addFolder → scan:progress done → listSongs 7 → wc-cover renders', async ({
  app,
}) => {
  const { firstWindow } = app
  const fixturesDir = path.resolve(__dirname, '../fixtures/music')

  // ① 先订阅 scan:progress（收集到 window 数组，规避事件时序竞争）
  await firstWindow.evaluate(() => {
    const w = window as unknown as { __scanProgress: Array<{ phase: string }> }
    w.__scanProgress = []
    ;(window as unknown as { api: ApiLike }).api.onScanProgress((p) => {
      w.__scanProgress.push(p)
    })
  })

  // ② addFolder 触发入库扫描（读真实 fs；不改动 fixtures 原件）
  const folder = await firstWindow.evaluate(
    (dir) => (window as unknown as { api: ApiLike }).api.library.addFolder(dir),
    fixturesDir,
  )
  expect(folder.id).toBeGreaterThan(0)

  // ③ 显式触发增量扫描（addFolder 仅注册目录，不自动扫描）
  await firstWindow.evaluate(() => (window as unknown as { api: ApiLike }).api.library.scan())

  // ④ 等待收集到 phase:'done'（30s）
  await firstWindow.waitForFunction(
    () =>
      (window as unknown as { __scanProgress: Array<{ phase: string }> }).__scanProgress.some(
        (p) => p.phase === 'done',
      ),
    undefined,
    { timeout: 30_000 },
  )

  // ④ listSongs：8 件 fixtures 中 7 条入库（08-broken 跳过）
  const songs = await firstWindow.evaluate(() =>
    (window as unknown as { api: ApiLike }).api.library.listSongs({
      sortBy: 'title',
      order: 'asc',
      offset: 0,
      limit: 100,
    }),
  )
  expect(songs).toHaveLength(7)
  expect(songs.some((s) => s.filePath.includes('08-broken'))).toBe(false)

  // 抽验：01-夜曲 embedded 标签 title；04-untagged 文件名回退 title
  expect(songs.find((s) => s.filePath.endsWith('01-夜曲.mp3'))?.title).toBe('夜曲')
  expect(songs.find((s) => s.filePath.endsWith('04-untagged.flac'))?.title).toBe('04-untagged')
  // 06 wma：F1-3 playable=false
  const wma = songs.find((s) => s.format === 'wma')
  expect(wma?.title).toBe('Track06')
  expect(wma?.playable).toBe(false)

  // ⑤ 页面内轮询 listAlbums 直到出现 coverId 非空的专辑（20s；不依赖 covers:ready 事件时序）。
  //    注：不用 waitForFunction+async 谓词的轮询形态——async 谓词在 polling 模式下会被
  //    Promise 对象本身的 truthiness 提前 resolve，页面内循环语义更可控。
  const album = await firstWindow.evaluate(async () => {
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
  expect(album?.coverId).toBeTruthy()

  // ⑥ 页面注入 <img src="wc-cover://{coverId}?s=256"> → 断言 naturalWidth > 0（15s）
  await firstWindow.evaluate((cid) => {
    const img = document.createElement('img')
    img.id = 'wc-cover-e2e'
    img.src = `wc-cover://${cid}?s=256`
    document.body.appendChild(img)
  }, album.coverId)

  await firstWindow.waitForFunction(
    () => {
      const img = document.querySelector<HTMLImageElement>('#wc-cover-e2e')
      return !!img && img.complete && img.naturalWidth > 0
    },
    undefined,
    { timeout: 15_000 },
  )
})
