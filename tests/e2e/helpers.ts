// T4.7/T4.8 公共 e2e 助手（本文件新建，供新 spec 复用）。
//
// 取舍留痕：browse.spec.ts 与 tracklist.spec.ts 各自内联了同一段「拷贝 fixtures → 订阅
// scan:progress → addFolder → scan → 等 phase:'done'」链路。T4.7 的前段与其高度重叠，
// 为避免第三次复制粘贴，抽到本 helpers.ts。**既有 spec 不回改**（禁止改动其断言语义、
// 也避免为重构而重跑历史 spec），重复在新 spec 侧止步于此；后续任务如再需该链路，
// 应改用本 helper 而非继续内联。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@playwright/test'

/** 测试内最小 window.api 形状（自洽，不依赖 preload d.ts 注入 e2e tsconfig，同既有 spec）。 */
export interface ApiLike {
  library: {
    addFolder: (p?: string) => Promise<{ id: number }>
    scan: () => Promise<unknown>
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
        coverId: string | null
      }>
    >
    listAlbums: () => Promise<Array<{ id: number; coverId: string | null; trackCount: number }>>
    getAlbum: (id: number) => Promise<{
      album: { id: number; title: string; coverId: string | null } | null
      tracks: Array<{ id: string; title: string }>
    }>
    listArtists: () => Promise<Array<{ id: number; name: string; trackCount: number }>>
    search: (q: string) => Promise<{
      tracks: Array<{ id: string; title: string }>
      albums: unknown[]
      artists: unknown[]
      playlists: unknown[]
    }>
  }
  onScanProgress: (cb: (p: { phase: string }) => void) => () => void
}

/** 扫描等待上限（fixtures 仅 8 件，正常秒级；30s 覆盖冷启动/杀毒扫描抖动）。 */
export const SCAN_TIMEOUT = 30_000

/**
 * 一站式准备「已扫描入库」的 app 状态：
 *   ① fixtures/music 全量拷贝到 os.tmpdir 副本（不动共享只读原件，同 browse/tracklist 约定）；
 *   ② 页面内订阅 scan:progress（收集到 window.__wcSp 数组，规避事件时序竞争）；
 *   ③ addFolder + scan，轮询到 phase:'done'。
 *
 * 返回 cleanup：删除临时音乐目录（userData 目录由 fixtures.ts 的 app fixture 统一清理）。
 */
export async function setupScannedLibrary(
  page: Page
): Promise<{ musicDir: string; cleanup: () => void }> {
  const fixturesDir = path.resolve(__dirname, '../fixtures/music')
  const musicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-e2e-lib-'))
  fs.cpSync(fixturesDir, musicDir, { recursive: true })

  // 先订阅再触发（addFolder 仅注册目录不自动扫描，scan 是显式动作，见 scan-flow.spec 注释）。
  await page.evaluate(() => {
    const w = window as unknown as { __wcSp: Array<{ phase: string }> }
    w.__wcSp = []
    ;(window as unknown as { api: ApiLike }).api.onScanProgress((p) => {
      ;(window as unknown as { __wcSp: Array<{ phase: string }> }).__wcSp.push(p as { phase: string })
    })
  })
  await page.evaluate(
    (dir) => (window as unknown as { api: ApiLike }).api.library.addFolder(dir),
    musicDir,
  )
  await page.evaluate(() => (window as unknown as { api: ApiLike }).api.library.scan())
  await page.waitForFunction(
    () =>
      (window as unknown as { __wcSp: Array<{ phase: string }> }).__wcSp.some(
        (p) => p.phase === 'done',
      ),
    undefined,
    { timeout: SCAN_TIMEOUT },
  )

  return {
    musicDir,
    cleanup: () => {
      try {
        fs.rmSync(musicDir, { recursive: true, force: true })
      } catch {
        /* 清理失败不掩盖测试结果 */
      }
    },
  }
}

/**
 * 请求监听器：收集页面全部请求 URL，供「零 http(s) 外联」断言（Local-first 硬约束，
 * launch.spec/scan-flow 已确立该模式，新 spec 延续）。返回 externalUrls() 即可断言。
 */
export function watchRequests(page: Page): { urls: () => string[]; externalUrls: () => string[] } {
  const urls: string[] = []
  page.on('request', (request) => {
    urls.push(request.url())
  })
  return {
    urls: () => urls,
    externalUrls: () => urls.filter((url) => /^https?:/i.test(url)),
  }
}

/** 控制台 error 与页面未捕获异常监听器（T4.8「渲染无异常」断言的数据源）。 */
export interface ConsoleIssues {
  errors: string[]
  pageErrors: string[]
}

export function watchConsoleIssues(page: Page): ConsoleIssues {
  const issues: ConsoleIssues = { errors: [], pageErrors: [] }
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.errors.push(msg.text())
  })
  page.on('pageerror', (err) => {
    issues.pageErrors.push(String(err))
  })
  return issues
}
