/**
 * 页面级接线单测（T5.6，jsdom project）——三页（Songs / AlbumDetail / ArtistDetail）× 交互落点。
 *
 * 难点：TrackList 用 react-virtuoso，jsdom 单测不渲染行（真实渲染由 e2e 覆盖）。本文件用
 * vi.mock('react-virtuoso') 把列表退化为「直接 map 渲染 itemContent」，从而在单测里派发
 * 双击 / 右键事件，断言页面把交互正确接到 playerBridge / playerStore / toastStore。
 *
 * 断言对象（接线矩阵）：
 *   · 双击 playable 行 → playContext(当前页 tracks, index) → store.loadContext(tracks, index)
 *   · 双击 missing/unplayable 行 → onUnplayableActivate → toastStore.showToast(t('player.unsupportedFormat'))
 *   · 右键「下一首播放」→ playerStore.playNext(track)
 *   · 右键「添加到队列」→ playerStore.enqueue(track)
 *
 * 隔离：store 动作一律 vi.spyOn 并 mockImplementation no-op，只验证「页面确实以正确参数调用」，
 * 不触发真实播放 / 队列副作用（避免污染应用单例 store、避免 jsdom 下 Audio 副作用）。
 */
import { act, type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { browseApiData, flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { AlbumDetail } from './AlbumDetail'
import { ArtistDetail } from './ArtistDetail'
import { DEFAULT_LIBRARY_PARAMS, useLibraryStore } from '../stores/libraryStore'
import { Songs } from './Songs'

// 必须把 react-virtuoso 的 Virtuoso 退化为「直接渲染全部 itemContent」——jsdom 无布局测量，
// 真实 Virtuoso 不挂载行；此处让 rows 真实出现在 DOM 以便派发事件。
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, components }: {
    data: TrackRow[]
    itemContent: (index: number, item: TrackRow) => ReactElement
    components?: { Header?: () => ReactElement }
  }) => (
    <div className="track-list-scroll">
      {components?.Header ? <components.Header /> : null}
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
    </div>
  )
}))

// Songs 页依赖 library:listSongs / library:getStats；browseFixtures 的桩未含这两通道，补上（同 Songs.test）。
const libraryStub = (globalThis as unknown as { window: { api: { library: Record<string, unknown> } } }).window.api
  .library
let listSongsResult: TrackRow[] = []
libraryStub.listSongs = async (): Promise<TrackRow[]> => listSongsResult
let statsResult: { tracks: number; albums: number; artists: number } | null = null
libraryStub.getStats = async (): Promise<{ tracks: number; albums: number; artists: number }> =>
  statsResult as { tracks: number; albums: number; artists: number }

interface Spies {
  loadContext: ReturnType<typeof vi.fn>
  playNext: ReturnType<typeof vi.fn>
  enqueue: ReturnType<typeof vi.fn>
  showToast: ReturnType<typeof vi.fn>
}

function installSpies(): Spies {
  const loadContext = vi.spyOn(usePlayerStore.getState(), 'loadContext').mockImplementation(() => undefined)
  const playNext = vi.spyOn(usePlayerStore.getState(), 'playNext').mockImplementation(() => undefined)
  const enqueue = vi.spyOn(usePlayerStore.getState(), 'enqueue').mockImplementation(() => undefined)
  const showToast = vi.spyOn(useToastStore.getState(), 'showToast').mockImplementation(() => undefined)
  return { loadContext, playNext, enqueue, showToast }
}

function makeTrack(id: string, over: Partial<TrackRow> = {}): TrackRow {
  return {
    id,
    title: `曲 ${id}`,
    artistId: 1,
    artistName: 'A',
    albumId: 7,
    albumTitle: 'Al',
    albumArtist: 'A',
    trackNumber: 1,
    discNumber: 1,
    year: 2000,
    genre: 'Pop',
    duration: 100,
    filePath: `/m/${id}.flac`,
    format: 'flac',
    bitrate: 1000,
    sampleRate: 96000,
    bitDepth: 24,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null,
    ...over
  }
}

/** 取容器内全部曲目行（排除表头 .track-row--head，按渲染顺序）。 */
function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.track-row:not(.track-row--head)'))
}

/** 双击某行（派发 dblclick，bubbles 到 onDoubleClick）。 */
function dblClick(row: HTMLElement): void {
  act(() => {
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
}

/** 右键某行打开菜单（TrackRowItem.onContextMenu → TrackList 渲染 TrackContextMenu）。 */
function rightClick(row: HTMLElement): void {
  act(() => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
  })
}

/** 在已打开的菜单里点 label 含 sentinel 的项（run(id) 走 onPlayNext / onEnqueue）。 */
function clickMenuLabel(menu: HTMLElement, label: string): void {
  const item = Array.from(menu.querySelectorAll<HTMLButtonElement>(':scope > .context-item')).find((el) =>
    el.textContent?.includes(label)
  )
  if (!item) throw new Error(`未找到菜单项 ${label}`)
  act(() => item.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  listSongsResult = []
  statsResult = null
  useLibraryStore.setState({ songs: [], loading: false, error: null, params: { ...DEFAULT_LIBRARY_PARAMS } })
  // 隔离播放态：每个用例默认无当前曲目，避免跨例串扰（T5.7 缺口②高亮用例显式 set）。
  usePlayerStore.setState({ currentTrack: null })
})

afterEach(() => {
  // 还原 store 动作 spy（installSpies 每例重建），避免跨例嵌套/串扰。
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Songs 页
// ---------------------------------------------------------------------------
describe('Songs 页接线（T5.6）', () => {
  it('双击 playable 行 → loadContext(当前页 songs, 行号)', async () => {
    const spies = installSpies()
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    listSongsResult = tracks
    const page = mountPage(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    await flushBrowse()
    const r = rows(page.container)
    expect(r).toHaveLength(3)
    dblClick(r[1])
    expect(spies.loadContext).toHaveBeenCalledTimes(1)
    expect(spies.loadContext).toHaveBeenCalledWith(tracks, 1)
    page.unmount()
  })

  it('双击 unplayable 行 → 不触发 loadContext，改触发 showToast(unsupportedFormat)', async () => {
    const spies = installSpies()
    const tracks = [makeTrack('a'), makeTrack('b', { playable: false }), makeTrack('c')]
    listSongsResult = tracks
    const page = mountPage(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    await flushBrowse()
    dblClick(rows(page.container)[1])
    expect(spies.loadContext).not.toHaveBeenCalled()
    expect(spies.showToast).toHaveBeenCalledTimes(1)
    expect(spies.showToast).toHaveBeenCalledWith('«player.unsupportedFormat»')
    page.unmount()
  })
})

// ---------------------------------------------------------------------------
// T5.7 缺口②闭合：曲目表 C1 accent 接线——当前播放曲目行应渲染 .track-row.is-playing
// ---------------------------------------------------------------------------
describe('曲目表播放态高亮（T5.7 缺口②）', () => {
  it('Songs 页：currentTrack 命中的行渲染 .track-row.is-playing', async () => {
    // 模拟正在播放 tracks[1]（id='b'）。
    usePlayerStore.setState({ currentTrack: makeTrack('b') })
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    listSongsResult = tracks
    const page = mountPage(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    await flushBrowse()
    const playing = page.container.querySelectorAll('.track-row.is-playing')
    expect(playing).toHaveLength(1)
    expect(playing[0].textContent).toContain('曲 b') // 高亮命中正确行
    page.unmount()
  })

  it('Songs 页：currentTrack 不在本页（跨上下文 id 不匹配）则不亮', async () => {
    usePlayerStore.setState({ currentTrack: makeTrack('z') }) // 不属于本页视图
    const tracks = [makeTrack('a'), makeTrack('b')]
    listSongsResult = tracks
    const page = mountPage(
      <MemoryRouter>
        <Songs />
      </MemoryRouter>
    )
    await flushBrowse()
    expect(page.container.querySelectorAll('.track-row.is-playing')).toHaveLength(0)
    page.unmount()
  })

  it('AlbumDetail 页：currentTrack 命中专辑曲目行渲染 .track-row.is-playing', async () => {
    browseApiData.album = {
      id: 7,
      title: 'Al',
      artistName: 'A',
      year: 2000,
      coverId: null,
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    browseApiData.tracks = [makeTrack('a'), makeTrack('b')]
    usePlayerStore.setState({ currentTrack: makeTrack('a') }) // 命中首曲
    const page = mountPage(renderAlbum())
    await flushBrowse()
    const playing = page.container.querySelectorAll('.track-row.is-playing')
    expect(playing).toHaveLength(1)
    expect(playing[0].textContent).toContain('曲 a')
    page.unmount()
  })
})

// ---------------------------------------------------------------------------
// AlbumDetail 页（MemoryRouter + Routes 注入 useParams id）
// ---------------------------------------------------------------------------
function renderAlbum(id = '7'): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/albums/${id}`]}>
      <Routes>
        <Route path="/albums/:id" element={<AlbumDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AlbumDetail 页接线（T5.6）', () => {
  it('双击 playable 行 → loadContext(专辑 tracks, 行号)', async () => {
    const spies = installSpies()
    browseApiData.album = {
      id: 7,
      title: 'Al',
      artistName: 'A',
      year: 2000,
      coverId: null,
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    const tracks = [makeTrack('a'), makeTrack('b')]
    browseApiData.tracks = tracks
    const page = mountPage(renderAlbum())
    await flushBrowse()
    const r = rows(page.container)
    expect(r).toHaveLength(2)
    dblClick(r[0])
    expect(spies.loadContext).toHaveBeenCalledTimes(1)
    expect(spies.loadContext).toHaveBeenCalledWith(tracks, 0)
    page.unmount()
  })

  it('双击 unplayable 行 → showToast(unsupportedFormat)', async () => {
    const spies = installSpies()
    browseApiData.album = {
      id: 7,
      title: 'Al',
      artistName: 'A',
      year: 2000,
      coverId: null,
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    browseApiData.tracks = [makeTrack('a'), makeTrack('b', { playable: false })]
    const page = mountPage(renderAlbum())
    await flushBrowse()
    dblClick(rows(page.container)[1])
    expect(spies.loadContext).not.toHaveBeenCalled()
    expect(spies.showToast).toHaveBeenCalledWith('«player.unsupportedFormat»')
    page.unmount()
  })

  it('右键「下一首播放」→ playNext(track)', async () => {
    const spies = installSpies()
    browseApiData.album = {
      id: 7,
      title: 'Al',
      artistName: 'A',
      year: 2000,
      coverId: null,
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    const tracks = [makeTrack('a'), makeTrack('b')]
    browseApiData.tracks = tracks
    const page = mountPage(renderAlbum())
    await flushBrowse()
    rightClick(rows(page.container)[1])
    const menu = page.container.querySelector<HTMLElement>('.context-menu')
    expect(menu).not.toBeNull()
    clickMenuLabel(menu!, '«menu.playNow»')
    expect(spies.playNext).toHaveBeenCalledTimes(1)
    expect(spies.playNext).toHaveBeenCalledWith(tracks[1])
    page.unmount()
  })

  it('右键「添加到队列」→ enqueue(track)', async () => {
    const spies = installSpies()
    browseApiData.album = {
      id: 7,
      title: 'Al',
      artistName: 'A',
      year: 2000,
      coverId: null,
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    const tracks = [makeTrack('a'), makeTrack('b')]
    browseApiData.tracks = tracks
    const page = mountPage(renderAlbum())
    await flushBrowse()
    rightClick(rows(page.container)[0])
    const menu = page.container.querySelector<HTMLElement>('.context-menu')
    clickMenuLabel(menu!, '«menu.addToQueue»')
    expect(spies.enqueue).toHaveBeenCalledTimes(1)
    expect(spies.enqueue).toHaveBeenCalledWith(tracks[0])
    page.unmount()
  })
})

// ---------------------------------------------------------------------------
// ArtistDetail 页
// ---------------------------------------------------------------------------
function renderArtist(id = '3'): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/artists/${id}`]}>
      <Routes>
        <Route path="/artists/:id" element={<ArtistDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ArtistDetail 页接线（T5.6）', () => {
  it('双击 playable 行 → loadContext(艺术家 tracks, 行号)', async () => {
    const spies = installSpies()
    browseApiData.artist = {
      id: 3,
      name: 'A',
      trackCount: 2,
      albumCount: 1,
      sortName: null,
      avatar: null,
      background: null,
      description: null
    }
    const tracks = [makeTrack('a'), makeTrack('b')]
    browseApiData.tracks = tracks
    const page = mountPage(renderArtist())
    await flushBrowse()
    const r = rows(page.container)
    dblClick(r[1])
    expect(spies.loadContext).toHaveBeenCalledTimes(1)
    expect(spies.loadContext).toHaveBeenCalledWith(tracks, 1)
    page.unmount()
  })

  it('双击 unplayable 行 → showToast(unsupportedFormat)', async () => {
    const spies = installSpies()
    browseApiData.artist = {
      id: 3,
      name: 'A',
      trackCount: 2,
      albumCount: 1,
      sortName: null,
      avatar: null,
      background: null,
      description: null
    }
    browseApiData.tracks = [makeTrack('a'), makeTrack('b', { playable: false })]
    const page = mountPage(renderArtist())
    await flushBrowse()
    dblClick(rows(page.container)[1])
    expect(spies.loadContext).not.toHaveBeenCalled()
    expect(spies.showToast).toHaveBeenCalledWith('«player.unsupportedFormat»')
    page.unmount()
  })
})
