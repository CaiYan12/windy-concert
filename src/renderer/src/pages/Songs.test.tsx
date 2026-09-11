/**
 * Songs 页单测（T4.4 / T4.9，jsdom project）——哨兵 i18n + renderToStaticMarkup / mountPage。
 *
 * 覆盖点：
 *   · 页头绑定真实 key（songs.heading），不渲染假总数（§3.7 无 songsCount 通道，T4.4 计划）。
 *   · 复用 TrackList 空态（含角色/可访问名）。
 *   · T4.9 页脚翻页：三态禁用逻辑（首页禁上一页 / 中间页双可用 / 末页禁下一页）、
 *     点击按钮以正确 offset 接线 libraryStore.setPage、空/加载/错误态不渲染控件。
 *     禁假总数约束下末页判定 = 当页行数 < limit（无总数通道，不渲染「共 M 条」）。
 * 有数据态（virtuoso 虚拟滚动）由 tests/e2e/tracklist.spec.ts 覆盖，此处不重复。
 */
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { DEFAULT_LIBRARY_PARAMS, useLibraryStore } from '../stores/libraryStore'
import { flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { Songs } from './Songs'

// ---------------------------------------------------------------------------
// library:listSongs 桩（browseFixtures 的 library 桩未含该通道——T4.9 前 Songs 页
// 数据取数不落地；翻页用例需要挂载后 refresh 真实走桩返回行数）。
// ---------------------------------------------------------------------------
const libraryStub = (
  globalThis as unknown as { window: { api: { library: Record<string, unknown> } } }
).window.api.library
/** 用例可读写的当页返回行（beforeEach 复位为空）。 */
let listSongsResult: TrackRow[] = []
libraryStub.listSongs = async (): Promise<TrackRow[]> => listSongsResult

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
  // 复位 libraryStore（全局单例，避免用例间串扰；同 libraryStore.test.ts 的 resetStore）。
  useLibraryStore.setState({
    songs: [],
    loading: false,
    error: null,
    params: { ...DEFAULT_LIBRARY_PARAMS }
  })
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
  it('渲染浏览页容器 + 页头 songs.heading（哨兵），不附假总数', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    expect(html).toContain('class="page-wrap browse-page"')
    expect(html).toContain('«songs.heading»')
    // 有数据态由 e2e 覆盖；SSR 首屏未触发 refresh，TrackList 走空态。
    expect(html).toContain('role="table"')
    expect(html).toContain('«empty.songs.title»')
    // 空态（首页无数据）不渲染翻页控件（T4.9）。
    expect(html).not.toContain('songs-pagination')
  })
})

describe('Songs 页翻页（T4.9）', () => {
  it('三态禁用逻辑：首页禁上一页 / 中间页双可用 / 末页禁下一页', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => makeTrack(`f${i}`))
    const tailPage = Array.from({ length: 30 }, (_, i) => makeTrack(`t${i}`))

    // 首页：offset=0，满页 50 行（= limit，下一页可用——行数==limit 无法区分末页，见组件留痕）。
    let page = await mountSongs(fullPage)
    let buttons = paginationButtons(page.container)
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute('aria-label')).toBe('«songs.pagination.prev»')
    expect(buttons[1].getAttribute('aria-label')).toBe('«songs.pagination.next»')
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(false)
    expect(page.container.querySelector('.songs-pagination-page')).toBeTruthy()
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
