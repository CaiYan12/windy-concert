/**
 * Songs 页单测（T4.4 / T4.9 / T4.11，jsdom project）——哨兵 i18n + renderToStaticMarkup / mountPage。
 *
 * 覆盖点：
 *   · 页头绑定真实 key（songs.heading）；T4.11 起页头副行渲染 library:getStats 真实总数
 *     （设计稿 mockups/Songs.html:66 形态「N 首曲目 · 按X排序」，千位分隔）；stats 未就绪/
 *     失败回退纯标题——不渲染 0 或 NaN（T4.1「禁假数据」延续）。
 *   · 复用 TrackList 空态（含角色/可访问名）。
 *   · T4.9 页脚翻页：三态禁用逻辑（首页禁上一页 / 中间页双可用 / 末页禁下一页）、
 *     点击按钮以正确 offset 接线 libraryStore.setPage、空/加载/错误态不渲染控件。
 *   · T4.11 翻页根治：total 就绪后末页判定 = offset+limit >= total（修复「总数恰为 limit
 *     整数倍」漏判）；页码升级「第 N 页 / 共 M 页」；total 未就绪回退行数近似（旧行为）。
 * 有数据态（virtuoso 虚拟滚动）由 tests/e2e/tracklist.spec.ts 覆盖，此处不重复。
 */
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { DEFAULT_LIBRARY_PARAMS, useLibraryStore } from '../stores/libraryStore'
import { useStatsStore } from '../stores/statsStore'
import { flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { Songs } from './Songs'

// ---------------------------------------------------------------------------
// library:listSongs / library:getStats 桩（browseFixtures 的 library 桩未含这两通道）。
// 翻页用例需要挂载后 refresh 真实走桩返回行数；总数用例经 getStats 桩驱动 statsStore。
// ---------------------------------------------------------------------------
const libraryStub = (
  globalThis as unknown as { window: { api: { library: Record<string, unknown> } } }
).window.api.library
/** 用例可读写的当页返回行（beforeEach 复位为空）。 */
let listSongsResult: TrackRow[] = []
libraryStub.listSongs = async (): Promise<TrackRow[]> => listSongsResult

/** 用例可读写的 getStats 返回值；null = 未就绪（store 保持 stats:null → 页头回退纯标题）。 */
let getStatsResult: { tracks: number; albums: number; artists: number } | null = null
/** true = 模拟 handler 抛错路径（取数失败，非未就绪）。 */
let failGetStats = false
libraryStub.getStats = async (): Promise<{ tracks: number; albums: number; artists: number }> => {
  if (failGetStats) throw new Error('stats unavailable')
  return getStatsResult as { tracks: number; albums: number; artists: number }
}

function makeTrack(id: string): TrackRow {
  return {
    id,
    title: `T${id}`,
    artistId: 1,
    artistName: 'Artist',
    albumId: 1,
    albumTitle: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: 1,
    year: 2020,
    genre: 'Genre',
    duration: 100,
    filePath: `/music/${id}.flac`,
    format: 'flac',
    bitrate: 1000,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  listSongsResult = []
  getStatsResult = null
  failGetStats = false
  // 复位全局单例 store（避免用例间串扰；同 libraryStore.test.ts 的 resetStore）。
  useLibraryStore.setState({
    songs: [],
    loading: false,
    error: null,
    params: { ...DEFAULT_LIBRARY_PARAMS }
  })
  useStatsStore.setState({ stats: null })
})

/** 挂载 Songs 页并等初始 refresh 落地；offset>0 时直接注入 params（不触发 refresh）。 */
async function mountSongs(
  rows: TrackRow[],
  offset = 0
): Promise<{ container: HTMLElement; unmount: () => void }> {
  listSongsResult = rows
  const page = mountPage(
    <MemoryRouter>
      <Songs />
    </MemoryRouter>
  )
  await flushBrowse()
  if (offset !== 0) {
    act(() => {
      useLibraryStore.setState((s) => ({ params: { ...s.params, offset } }))
    })
  }
  return page
}

const paginationButtons = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('.songs-pagination-button'))

describe('Songs 页', () => {
  it('stats 未就绪 → 页头纯标题（songs.heading 哨兵），不渲染总数副行', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    expect(html).toContain('class="page-wrap browse-page"')
    expect(html).toContain('«songs.heading»')
    expect(html).not.toContain('«songs.headingTotal»')
    // 有数据态由 e2e 覆盖；SSR 首屏未触发 refresh，TrackList 走空态。
    expect(html).toContain('role="table"')
    expect(html).toContain('«empty.songs.title»')
    // 空态（首页无数据）不渲染翻页控件（T4.9）。
    expect(html).not.toContain('songs-pagination')
  })

  it('stats 就绪 → 页头副行渲染真实总数 + 排序注解（千位分隔，设计稿 mockups/Songs.html:66 形态）', async () => {
    getStatsResult = { tracks: 30000, albums: 900, artists: 120 }
    // 注入真实文案（哨兵 i18n 不插值；插值行为由 tests/unit/i18n 守卫，此处验证端到端形态）。
    act(() => {
      useI18nStore.setState({
        messages: {
          'songs.heading': '全部歌曲',
          'songs.headingTotal': '{count} 首曲目 · 按{sort}排序',
          'songs.column.title': '标题'
        },
        loaded: true,
        language: 'zh-CN'
      })
    })
    const page = await mountSongs([makeTrack('a1')])
    const sub = page.container.querySelector('.page-head p')
    expect(sub).not.toBeNull()
    expect(sub!.textContent).toBe('30,000 首曲目 · 按标题排序')
    page.unmount()
  })

  it('stats 取数失败 → 回退纯标题（不渲染 0 或 NaN）', async () => {
    failGetStats = true // 桩抛错 = 取数失败
    const page = await mountSongs([makeTrack('a1')])
    expect(page.container.querySelector('.page-head p')).toBeNull()
    expect(page.container.querySelector('.page-head')!.textContent).toContain('«songs.heading»')
    page.unmount()
  })
})

describe('Songs 页翻页（T4.9 / T4.11）', () => {
  it('total 未就绪回退行数近似：首页禁上一页 / 中间页双可用 / 末页禁下一页', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))
    const tailPage = Array.from({ length: 30 }, (_, i) => makeTrack(`t${i}`))

    // 首页：offset=0，满页 50 行（= limit，行数近似无法区分末页——total 就绪后由根治逻辑接管）。
    let page = await mountSongs(fullPage)
    let buttons = paginationButtons(page.container)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute('aria-label')).toBe('«songs.pagination.prev»')
    expect(buttons[1].getAttribute('aria-label')).toBe('«songs.pagination.next»')
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(false)
    // total 未就绪 → 页码回退「第 N 页」（无共 M 页段）。
    expect(page.container.querySelector('.songs-pagination-page')!.textContent).toBe('«songs.pagination.page»')
    page.unmount()

    // 中间页：offset=50 + 满页 → 双可用。
    page = await mountSongs(fullPage, 50)
    buttons = paginationButtons(page.container)
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(false)
    page.unmount()

    // 末页：offset=50 + 30 行（< limit 50）→ 禁下一页，上一页可用。
    page = await mountSongs(tailPage, 50)
    buttons = paginationButtons(page.container)
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(true)
    page.unmount()
  })

  it('total 就绪根治末页判定：总数恰为 limit 整数倍时下一页禁用（旧行数近似会漏判）', async () => {
    // total=100，limit=50：第二页（offset=50）满页 50 行——旧行数近似 rows>=limit 会放开下一页，
    // total 根治后 50+50 >= 100 → 禁用。
    getStatsResult = { tracks: 100, albums: 3, artists: 2 }
    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))
    const page = await mountSongs(fullPage, 50)
    const buttons = paginationButtons(page.container)
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(true)
    // 页码升级：「第 2 页 / 共 2 页」（哨兵断言 key；插值参数行为由 i18n 单测守护）。
    expect(page.container.querySelector('.songs-pagination-page')!.textContent).toBe(
      '«songs.pagination.pageTotal»'
    )
    page.unmount()
  })

  it('total 就绪且未到末页：下一页可用，共 M 页 = ceil(total/limit)', async () => {
    // total=80，limit=50 → 共 2 页；首页 50+50=100 > 80？不——判定为 offset+limit < total：
    // 50 < 80 → 下一页可用（尚有 30 行在第二页）。
    getStatsResult = { tracks: 80, albums: 3, artists: 2 }
    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))
    const page = await mountSongs(fullPage)
    const buttons = paginationButtons(page.container)
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(false)
    page.unmount()
  })

  it('点击下一页/上一页以正确 offset 调用 setPage（offset/limit 接线）', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))
    const page = await mountSongs(fullPage)

    const setPageSpy = vi.fn()
    act(() => {
      useLibraryStore.setState({ setPage: setPageSpy })
    })

    // 首页点「下一页」：offset 0 → 50（limit 50 原样透传）。
    let buttons = paginationButtons(page.container)
    act(() => {
      buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(setPageSpy).toHaveBeenCalledTimes(1)
    expect(setPageSpy).toHaveBeenCalledWith(50, 50)

    // 中间页点「上一页」：offset 50 → 0（Math.max 下限钳制）。
    act(() => {
      useLibraryStore.setState({ params: { ...DEFAULT_LIBRARY_PARAMS, offset: 50 } })
    })
    buttons = paginationButtons(page.container)
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(setPageSpy).toHaveBeenCalledTimes(2)
    expect(setPageSpy).toHaveBeenLastCalledWith(0, 50)

    page.unmount()
  })

  it('空态/加载态/错误态不渲染翻页控件（即使有行）', async () => {
    // 空态：refresh 落地 0 行 + offset=0 → 不渲染。
    let page = await mountSongs([])
    expect(page.container.querySelector('.songs-pagination')).toBeNull()
    page.unmount()

    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))

    // 加载态：有行但 in-flight → 不渲染（refresh 重取期间控件随 loading 暂隐）。
    page = await mountSongs(fullPage)
    act(() => {
      useLibraryStore.setState({ loading: true })
    })
    expect(page.container.querySelector('.songs-pagination')).toBeNull()
    page.unmount()

    // 错误态：有行但 error 非空 → 不渲染（同 TrackList 错误条的语义：失败时不可信）。
    page = await mountSongs(fullPage)
    act(() => {
      useLibraryStore.setState({ error: 'boom' })
    })
    expect(page.container.querySelector('.songs-pagination')).toBeNull()
    page.unmount()
  })

  it('越界空页兜底：offset>0 且 0 行仍渲染控件（上一页可用作退路，留痕见组件注释）', async () => {
    // 总数恰为 limit 整数倍时点下一页会落空页——控件必须保留「上一页」退路。
    const page = await mountSongs([], 50)
    const buttons = paginationButtons(page.container)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].disabled).toBe(false)
    expect(buttons[1].disabled).toBe(true)
    page.unmount()
  })
})
