// T4.3 验收：TrackList × Cover 真实渲染 e2e（经真实 IPC + main 侧 SQLite/扫描/封面管线）。
//
// 链路：临时拷贝 fixtures/music → addFolder + scan（7 条：08-broken 按 F1-7 跳过）→
//   删副本 01-夜曲.mp3 后重扫（该行 available → missing）→ 重载页面（PagePlaceholder 挂载
//   refresh()，经真实 IPC 取回 7 行）→ 断言表格/行数/缺失态/不可播态/排序/右键菜单/封面解码。
//
// 动机（为何走「拷贝 + 删副本」而非直接改 fixtures 原件）：missing 是扫描期的反向对账结果
//   （scanService：DB 有行、stat 结果缺席 → status=missing），必须制造「先入库、后消失」；
//   而 tests/fixtures 是共享只读资产（scan-flow.spec 亦约定不改原件），故在 os.tmpdir 副本上
//   制造，测试结束整目录清理，主仓零副作用。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './fixtures'

/** 测试内最小 window.api 形状（自洽，不依赖 preload d.ts 注入 e2e tsconfig，同 scan-flow.spec）。 */
interface SongRow {
  id: string
  title: string
  filePath: string
  format: string
  playable: boolean
  status: 'available' | 'missing' | 'ignored'
  coverId: string | null
}

interface ApiLike {
  library: {
    addFolder: (p?: string) => Promise<{ id: number }>
    scan: () => Promise<unknown>
    listSongs: (params: {
      sortBy: string
      order?: string
      offset?: number
      limit?: number
    }) => Promise<SongRow[]>
    listAlbums: () => Promise<Array<{ id: number; coverId: string | null }>>
  }
  onScanProgress: (cb: (p: { phase: string }) => void) => () => void
}

const SCAN_TIMEOUT = 30_000

test('TrackList × Cover 真实渲染：七行 / 缺失 / 不可播 / 排序 / 右键菜单 / 封面解码', async ({
  app,
}) => {
  test.setTimeout(120_000)
  const { firstWindow: page } = app
  const fixturesDir = path.resolve(__dirname, '../fixtures/music')

  // ① fixtures 全量拷贝到临时目录（含 album2/cover.jpg；不动原件）
  const musicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-tracklist-music-'))
  try {
    fs.cpSync(fixturesDir, musicDir, { recursive: true })

    // ② 单次订阅 scan:progress：回调按调用瞬间的 window.__sp 读取，故重置数组即可复用同一次订阅。
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

    // ③ 制造 missing：删除副本 01-夜曲.mp3 后重扫（DB 行由 available → missing；原件不受影响）
    fs.rmSync(path.join(musicDir, '01-夜曲.mp3'))
    await runScan()

    // ④ 重载页面：PagePlaceholder（临时验证入口）挂载即 library.refresh()，经真实 IPC 取回 7 行。
    //    C1 播放图标变体断言需要一行 playing 态，而真实播放态属 T5.6（playerStore 未建）——
    //    经 PagePlaceholder 的临时验证钩子 `#/songs?playing=<id>` 注入 playingTrackId（该钩子随
    //    本分支在 T4.4 一并移除，非生产行为）。
    const firstSongId = await page.evaluate(async () => {
      const api = (window as unknown as { api: ApiLike }).api
      const rows = await api.library.listSongs({ sortBy: 'title', order: 'asc', limit: 1 })
      return rows[0]?.id ?? null
    })
    expect(firstSongId).toBeTruthy()
    await page.evaluate((id) => {
      window.location.hash = `#/songs?playing=${id}`
    }, firstSongId)
    await page.reload()
    await page.waitForSelector('.track-table[role="table"]')
    await page.waitForFunction(
      () => document.querySelectorAll('.track-row:not(.track-row--head)').length === 7,
      undefined,
      { timeout: SCAN_TIMEOUT },
    )

    // ⑤ 表格结构 + 行数：1 表头 + 7 数据行
    await expect(page.locator('.track-table[role="table"]')).toHaveAttribute(
      'aria-rowcount',
      '7',
    )
    await expect(page.locator('.track-row--head')).toHaveCount(1)
    await expect(page.locator('.track-row:not(.track-row--head)')).toHaveCount(7)

    // ⑤.5 C1：播放行图标必须走 accent 变体（music-2--accent），而非靠 CSS color 上色的 music-2。
    const playingRow = page.locator('.track-row.is-playing')
    await expect(playingRow).toHaveCount(1)
    await expect(playingRow.locator('.is-playing-icon')).toHaveAttribute('src', /music-2--accent/)

    // ⑥ 缺失行：右侧 file-x-2 灰标 + 副标题「文件缺失」+ 行内播放禁用。
    //    双击拦截由单测锚定：src/renderer/src/components/TrackList.test.tsx 的
    //    「TrackRowItem 双击拦截（I3）」用例（客户端挂载 + 真实 dblclick，断言 missing / 不可播
    //    不触发 onActivate、正常行触发一次）——此处不重复事件断言。
    const missingRow = page.locator('.track-row.is-missing')
    await expect(missingRow).toHaveCount(1)
    await expect(missingRow.locator('.track-status-mark img.library-icon')).toHaveAttribute(
      'src',
      /file-x-2/,
    )
    await expect(missingRow.locator('.track-subtitle').first()).toHaveText('文件缺失')
    await expect(missingRow.locator('.row-play')).toBeDisabled()

    // ⑦ 不可播行（06-Track06.wma）：右侧 ban 图标 + tooltip 文案（状态标 & 行内播放按钮两处）
    const unplayableRow = page.locator('.track-row.is-unavailable')
    await expect(unplayableRow).toHaveCount(1)
    await expect(unplayableRow.locator('.track-status-mark img.library-icon')).toHaveAttribute(
      'src',
      /ban/,
    )
    await expect(unplayableRow.locator('.track-status-mark')).toHaveAttribute(
      'title',
      '此格式 M0.1 暂不支持播放，0.5 版恢复',
    )
    await expect(unplayableRow.locator('.row-play')).toHaveAttribute(
      'title',
      '此格式 M0.1 暂不支持播放，0.5 版恢复',
    )
    await expect(unplayableRow.locator('.row-play')).toBeDisabled()

    // ⑧ 排序：默认 title asc → 点击「标题」列翻转为 desc，首行变化 + chevron-down 出现。
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
      { timeout: SCAN_TIMEOUT },
    )
    expect(await firstTitle.textContent()).not.toBe(beforeSort)
    await expect(
      page.locator('.track-row--head [role="columnheader"]').nth(2), // 0=封面 1=序号 2=标题
    ).toHaveAttribute('aria-sort', 'descending')
    await expect(page.locator('.track-row--head .sort-button img.library-icon')).toHaveAttribute(
      'src',
      /chevron-down/,
    )

    // ⑨ 选中态：单击行 → is-selected（六态中 selected 的真实渲染证据）
    const normalRow = page.locator('.track-row:not(.track-row--head)').nth(1)
    await normalRow.click()
    await expect(normalRow).toHaveClass(/is-selected/)

    // ⑩ 右键菜单：四组（下一首播放 / 添加到队列 / 收藏或取消收藏 / 添加到歌单▸），Escape 关闭
    await normalRow.click({ button: 'right' })
    const menu = page.locator('.context-menu[role="menu"]')
    await expect(menu).toBeVisible()
    await expect(menu.locator(':scope > [role="menuitem"]')).toHaveCount(4)
    await expect(menu).toContainText('下一首播放')
    await expect(menu).toContainText('添加到队列')
    await expect(menu).toContainText('收藏')
    await expect(menu).toContainText('添加到歌单')
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    // ⑪ 封面：Cover 两分支 + 表格档（64）。
    //    **覆盖边界（I7 留痕，勿产生错误通过感）**：本构建 coverService 只写 albums.cover_id，
    //    tracks.cover_id 无任何写入点（scanService 仅把封面作为 album 维度的 CoverJob 投递）→ 真实
    //    曲目行的 TrackRow.coverId 恒为 null，**.track-cell--cover 的「实图」分支在数据层缺写入点、
    //    未被本 e2e 覆盖**；下方 (a)(b) 实际只走到占位分支。表格封面通路改造属 T4.4 前置独立任务
    //    （已由用户裁定为「渲染层走专辑封面」），不在本任务范围。
    //    因此断言取稳健形态：
    //    (a) 7 个封面单元各恰好一个 .cover，且「实图 + 占位」= 总数（两分支互斥且完备）；
    //    (b) 若存在实图（coverId 非空），其 <img src="wc-cover://…?s=64"> 必须真解码——不静默退回；
    //    (c) 无条件：以真实专辑 coverId 构造 Cover 同款 URL（见 Cover.coverUrl）注入 <img>，断言
    //        naturalWidth > 0 —— 这是**协议级冒烟**（证明 URL 形态在表格档 s=64 确实出图），
    //        不等于「表格实图分支已被覆盖」。
    await expect(page.locator('.track-cell--cover .cover')).toHaveCount(7)

    const coverTally = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.track-cell--cover .cover'))
      const real = cells.filter((c) => c.querySelector('img[src^="wc-cover:"]'))
      const placeholder = cells.filter((c) => c.classList.contains('cover--placeholder'))
      const decoded = real.filter((c) => {
        const img = c.querySelector<HTMLImageElement>('img')
        return !!img && img.complete && img.naturalWidth > 0
      })
      return {
        cells: cells.length,
        real: real.length,
        placeholder: placeholder.length,
        decoded: decoded.length,
      }
    })
    console.log('[tracklist-e2e] cover tally =', JSON.stringify(coverTally))
    expect(coverTally.real + coverTally.placeholder).toBe(coverTally.cells)
    expect(coverTally.decoded).toBe(coverTally.real)
    if (coverTally.real > 0) {
      await expect(
        page.locator('.track-cell--cover img[src^="wc-cover:"]').first(),
      ).toHaveAttribute('src', /\?s=64$/)
    }

    // (c) 协议级：真实专辑封面 id → Cover 同款 URL（表格档 64）→ naturalWidth > 0
    const albumCoverId = await page.evaluate(async () => {
      const api = (window as unknown as { api: ApiLike }).api
      const albums = await api.library.listAlbums()
      return albums.find((a) => a.coverId)?.coverId ?? null
    })
    expect(albumCoverId).toBeTruthy()
    await page.evaluate((cid) => {
      const img = document.createElement('img')
      img.id = 'wc-cover-tier64'
      img.src = `wc-cover://${cid}?s=64`
      document.body.appendChild(img)
    }, albumCoverId)
    await page.waitForFunction(
      () => {
        const img = document.querySelector<HTMLImageElement>('#wc-cover-tier64')
        return !!img && img.complete && img.naturalWidth > 0
      },
      undefined,
      { timeout: 15_000 },
    )
  } finally {
    fs.rmSync(musicDir, { recursive: true, force: true })
  }
})
