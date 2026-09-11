// T4.4 验收：浏览页（Albums / Artists / AlbumDetail / ArtistDetail）真实渲染 e2e
//   （经真实 IPC + main 侧 SQLite/扫描管线；零 http(s) 外部断言）。
//
// 链路：临时拷贝 fixtures/music → addFolder + scan → 经 hash 路由依次进入
//   #/albums（网格 + 真实总数）、点击卡片进 #/albums/:id（Hero 渐变 + 曲目表）、
//   #/artists（列表行）、点击进 #/artists/:id（Hero + 专辑网格 + 全部曲目）。
//
// 不依赖 T5.6 playerStore：播放/随机钮为占位（playerBridge），本 e2e 只断言结构与导航。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './fixtures'

interface ApiLike {
  library: {
    addFolder: (p?: string) => Promise<{ id: number }>
    scan: () => Promise<unknown>
    listAlbums: () => Promise<Array<{ id: number; coverId: string | null }>>
  }
  onScanProgress: (cb: (p: { phase: string }) => void) => () => void
}

const SCAN_TIMEOUT = 30_000

test('浏览页：专辑网格 / 专辑详情 / 艺术家列表 / 艺术家详情 真实渲染与导航', async ({ app }) => {
  test.setTimeout(120_000)
  const { firstWindow: page } = app
  const fixturesDir = path.resolve(__dirname, '../fixtures/music')

  const musicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-browse-music-'))
  try {
    fs.cpSync(fixturesDir, musicDir, { recursive: true })

    await page.evaluate(() => {
      const w = window as unknown as { __sp: Array<{ phase: string }> }
      w.__sp = []
      ;(window as unknown as { api: ApiLike }).api.onScanProgress((p) => {
        ;(window as unknown as { __sp: Array<{ phase: string }> }).__sp.push(p as { phase: string })
      })
    })

    const runScan = async (): Promise<void> => {
      await page.evaluate(() => {
        ;(window as unknown as { __sp: unknown[] }).__sp = []
      })
      await page.evaluate(() => (window as unknown as { api: ApiLike }).api.library.scan())
      await page.waitForFunction(
        () =>
          (window as unknown as { __sp: Array<{ phase: string }> }).__sp.some(
            (p) => p.phase === 'done',
          ),
        undefined,
        { timeout: SCAN_TIMEOUT },
      )
    }

    await page.evaluate(
      (dir) => (window as unknown as { api: ApiLike }).api.library.addFolder(dir),
      musicDir,
    )
    await runScan()

    // --- Albums 网格 ---
    await page.evaluate(() => {
      window.location.hash = '#/albums'
    })
    await page.waitForSelector('.album-grid', undefined, { timeout: SCAN_TIMEOUT })
    const albumCards = page.locator('.album-card')
    await expect(albumCards).not.toHaveCount(0)
    // 真实总数文案（listAlbums 全量，渲染「共 N 张」）。
    await expect(page.locator('.page-head p')).toContainText('共')
    await expect(page.locator('.page-head p')).toContainText('张')

    // --- 进 AlbumDetail：点第一张专辑卡片 ---
    await albumCards.first().click()
    await page.waitForSelector('.hero--album', undefined, { timeout: SCAN_TIMEOUT })
    await expect(page.locator('.hero--album h2')).not.toBeEmpty()
    await expect(page.locator('.hero-label')).toHaveText('专辑')
    // 返回链接（albumDetail.back）+ 播放/随机钮（占位，aria-label 取 albumDetail.play/shuffle）
    await expect(page.locator('.button--quiet')).toContainText('返回专辑')
    await expect(page.locator('.round-action--primary')).toHaveAttribute(
      'aria-label',
      '播放',
    )
    await expect(page.locator('.round-action:not(.round-action--primary)')).toHaveAttribute(
      'aria-label',
      '随机播放',
    )
    // 曲目表复用 TrackList（表头 + 数据行）。
    await expect(page.locator('.track-row--head')).toHaveCount(1)

    // --- Artists 列表 ---
    await page.evaluate(() => {
      window.location.hash = '#/artists'
    })
    await page.waitForSelector('.artist-list', undefined, { timeout: SCAN_TIMEOUT })
    const artistRows = page.locator('.artist-row')
    await expect(artistRows).not.toHaveCount(0)
    await expect(page.locator('.page-head p')).toContainText('位')

    // --- 进 ArtistDetail：点第一行 ---
    await artistRows.first().click()
    await page.waitForSelector('.hero--artist', undefined, { timeout: SCAN_TIMEOUT })
    await expect(page.locator('.hero--artist h2')).not.toBeEmpty()
    await expect(page.locator('.hero-label')).toHaveText('艺术家')
    await expect(page.locator('.button--quiet')).toContainText('返回艺术家')
    // 分区标题：专辑 + 全部曲目（track-row--head 来自全部曲目表）。
    await expect(page.locator('.section-heading').first()).toContainText('专辑')
    await expect(page.locator('.section-heading').nth(1)).toContainText('全部曲目')
  } finally {
    fs.rmSync(musicDir, { recursive: true, force: true })
  }
})
