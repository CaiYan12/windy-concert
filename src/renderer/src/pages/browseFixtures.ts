/**
 * 浏览页单测共享夹具（T4.4，jsdom project）。
 *
 * 关键约束：页面模块在 import 时经 client.ts 捕获 `window.api`（const api = window.api），
 * 故 window.api 桩必须在页面模块 import 之前就位——本模块顶层即设置（测试文件先 import 本夹具，
 * 再 import 页面，ES 模块按序求值，保证桩先生效）。
 *
 * 桩设计：
 *   · library.* 四通道（listAlbums/listArtists/getAlbum/getArtist）读 browseApiData（用例可改写）——
 *     用于 populated / empty / error 三种客户端挂载态。
 *   · 其余通道（i18n.getMessages / onScanProgress / onCoversReady / favorites/playlists/...）用
 *     Proxy 兜底为 no-op，避免 libraryStore 等模块在加载期订阅/取数时抛错。
 *
 * i18n 哨兵：用 Proxy 把任意 key 映射为 «key»，断言「组件确实经 t() 取用了正确的 key」，
 *   不复制 resources 真实文案（键完整性由 tests/unit/i18n 守卫）。
 */
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AlbumCard, ArtistCard, SearchResult, TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'

export interface BrowseAlbumDetail {
  id: number
  title: string
  artistName: string
  year: number | null
  coverId: string | null
  trackCount: number
  genre: string | null
  discCount: number | null
}

export interface BrowseArtistDetail extends ArtistCard {
  sortName: string | null
  avatar: string | null
  background: string | null
  description: string | null
}

/** 用例可读写的桩数据（在 beforeEach 复位）。 */
export const browseApiData = {
  albums: [] as AlbumCard[],
  artists: [] as ArtistCard[],
  album: null as BrowseAlbumDetail | null,
  artist: null as BrowseArtistDetail | null,
  tracks: [] as TrackRow[],
  failList: false,
  failAlbum: false,
  failArtist: false,
  // T4.5：library:search 桩数据（SearchBox 下拉 / SearchResults 页共用）。
  searchResult: null as SearchResult | null,
  failSearch: false,
  /** search 通道被调用的 q 序列（断言「何时发起/发起几次」用，beforeEach 复位）。 */
  searchCalls: [] as string[]
}

const EMPTY_SEARCH: SearchResult = { tracks: [], albums: [], artists: [], playlists: [] }

function makeLibraryHandlers() {
  return {
    listAlbums: (): Promise<AlbumCard[]> =>
      browseApiData.failList
        ? Promise.reject(new Error('album list failed'))
        : Promise.resolve(browseApiData.albums),
    listArtists: (): Promise<ArtistCard[]> =>
      browseApiData.failList
        ? Promise.reject(new Error('artist list failed'))
        : Promise.resolve(browseApiData.artists),
    getAlbum: (id: number) =>
      browseApiData.failAlbum
        ? Promise.reject(new Error('album fetch failed'))
        : Promise.resolve({
            album: browseApiData.album ? { ...browseApiData.album, id } : null,
            tracks: browseApiData.tracks
          }),
    getArtist: (id: number) =>
      browseApiData.failArtist
        ? Promise.reject(new Error('artist fetch failed'))
        : Promise.resolve({
            artist: browseApiData.artist ? { ...browseApiData.artist, id } : null,
            albums: browseApiData.albums,
            tracks: browseApiData.tracks
          }),
    // T4.5：搜索通道（与真实 handler 一致：返回四组分组结构）；q 序列留给断言。
    search: (q: string): Promise<SearchResult> => {
      browseApiData.searchCalls.push(q)
      if (browseApiData.failSearch) return Promise.reject(new Error('search failed'))
      return Promise.resolve(browseApiData.searchResult ?? EMPTY_SEARCH)
    }
  }
}

// window.api 桩：library 四通道读 browseApiData；其余字段 Proxy 兜底为 no-op。
const apiStub: Record<string, unknown> = new Proxy(
  {
    library: makeLibraryHandlers(),
    i18n: { getMessages: async (): Promise<Record<string, string>> => ({}) },
    onScanProgress: (): (() => void) => () => {},
    onCoversReady: (): (() => void) => () => {}
  },
  {
    get(target, prop: string) {
      if (prop in target) return target[prop as keyof typeof target]
      // 未知通道（favorites/playlists/history/settings 等）：返回 no-op 函数，避免加载期订阅抛错。
      return () => undefined
    }
  }
) as Record<string, unknown>

if (typeof globalThis.window === 'undefined') {
  ;(globalThis as unknown as { window: unknown }).window = {}
}
;(globalThis as unknown as { window: Record<string, unknown> }).window.api = apiStub

/** 安装哨兵 i18n：任意 key → «key»，并标记已加载。 */
export function installSentinelI18n(): void {
  const sentinel = new Proxy(
    {},
    { get: (_t, key: string) => `«${key}»` }
  ) as Record<string, string>
  useI18nStore.setState({ messages: sentinel, loaded: true, language: 'zh-CN' })
}

/** 复位桩数据（避免用例间串扰）。 */
export function resetBrowseApiData(): void {
  browseApiData.albums = []
  browseApiData.artists = []
  browseApiData.album = null
  browseApiData.artist = null
  browseApiData.tracks = []
  browseApiData.failList = false
  browseApiData.failAlbum = false
  browseApiData.failArtist = false
  browseApiData.searchResult = null
  browseApiData.failSearch = false
  browseApiData.searchCalls = []
}

/** 最小客户端挂载（无 @testing-library），返回容器与卸载函数。 */
export function mountPage(element: ReactElement): {
  container: HTMLElement
  unmount: () => void
} {
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

/** 等待 useBrowseData 的 effect → loader → setState 微任务链落地。 */
export async function flushBrowse(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}
