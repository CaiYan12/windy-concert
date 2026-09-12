/**
 * Liked 页单测（T6.1，jsdom project）——哨兵 i18n + 客户端挂载（无 @testing-library）。
 *
 * 形态（对照 Songs.test / pageWiring.test）：
 *   · vi.mock('react-virtuoso') 把列表退化为直接 map 渲染 itemContent——jsdom 无布局测量，
 *     真实 Virtuoso 不挂行，而本任务要断言「行 ♡ 取切片 / 点击取消」必须让行真实出现在 DOM。
 *   · window.api.favorites 用可读写桩（list 返回当页行、set 记录调用）；每次 refresh 记录 sortBy。
 *   · 收藏切片 useFavoritesStore 单例：beforeEach 复位（loaded=false 基线），用例自行播种或经页面 refresh。
 *
 * 覆盖点：Hero 渐变类/标题/真实曲目数、5 键白名单渲染 + 选中触发 refresh(sortBy)、空态、
 * 行 ♡ 取切片、三处同步（行 ♡ 点击 → 切片变化 → PlayerBar ♥ 反映，组件级联动）。
 */
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import type { PlaylistRow } from '../../../main/database/repositories/playlistRepo'
import { useI18nStore } from '../i18n'
import { useFavoritesStore, DEFAULT_FAVORITE_SORT } from '../stores/favoritesStore'
import { usePlayerStore } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { PlayerBar } from '../components/layout/PlayerBar'
import { flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
// 顺序留痕：playlistsStore（→ ipc/client 求值期捕获 window.api）须在 browseFixtures 之后
// import，理由同 pageWiring.test.tsx 头注。
import { usePlaylistsStore } from '../stores/playlistsStore'
import { Liked } from './Liked'

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, components }: {
    data: TrackRow[]
    itemContent: (index: number, item: TrackRow) => React.ReactElement
    components?: { Header?: () => React.ReactElement }
  }) => (
    <div className="track-list-scroll">
      {components?.Header ? <components.Header /> : null}
      {data.map((item, index) => (
        <div key={item.id}>{itemContent(index, item)}</div>
      ))}
    </div>
  )
}))

function makeTrack(id: string, over: Partial<TrackRow> = {}): TrackRow {
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
    favorite: true,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: '2020-01-01T00:00:00Z',
    ...over
  }
}

/** 用例读写：list 返回的行 + 每次 refresh 的 sortBy 序列。 */
let favoritesRows: TrackRow[] = []
let listSorts: string[] = []
const setCalls: Array<[string, boolean]> = []

function installFavoritesApi(): void {
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.favorites = {
    list: async (sortBy: string): Promise<TrackRow[]> => {
      listSorts.push(sortBy)
      return favoritesRows
    },
    set: async (trackId: string, favorite: boolean): Promise<void> => {
      setCalls.push([trackId, favorite])
    }
  }
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  favoritesRows = []
  listSorts = []
  setCalls.length = 0
  installFavoritesApi()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // 复位切片（loaded=false 基线）与播放态。
  useFavoritesStore.setState({
    favoriteIds: new Set<string>(),
    favorites: [],
    sortBy: DEFAULT_FAVORITE_SORT,
    loading: false,
    error: null,
    loaded: false
  })
  usePlayerStore.setState({ currentTrack: null })
})

/** 挂载 Liked 页并等挂载 refresh 落地。 */
async function mountLiked(): Promise<{ container: HTMLElement; unmount: () => void }> {
  const page = mountPage(
    <MemoryRouter>
      <Liked />
    </MemoryRouter>
  )
  await flushBrowse()
  return page
}

const rows = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.track-row:not(.track-row--head)'))

describe('Liked 页 Hero（T6.1）', () => {
  it('渲染 .hero--liked 渐变 + 标题 + 真实曲目数（千位分隔由 formatCount 承担）', async () => {
    // 真实文案（哨兵 i18n 不插值；此处验证端到端形态）。
    act(() => {
      useI18nStore.setState({
        messages: {
          'liked.title': '收藏',
          'liked.label': '自动歌单',
          'liked.subtitle': '你收藏的歌曲会自动出现在这里',
          'liked.trackCount': '{count} 首曲目',
          'liked.metaSort': '按{sort}排序',
          'liked.sectionHeading': '收藏曲目',
          'songs.column.artist': '艺术家'
        },
        loaded: true,
        language: 'zh-CN'
      })
    })
    favoritesRows = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    const page = await mountLiked()

    expect(page.container.querySelector('.hero.hero--liked')).not.toBeNull()
    expect(page.container.querySelector('.hero h2')!.textContent).toBe('收藏')
    // 曲目数 = 真实行数（3），非假总数。
    expect(page.container.querySelector('.hero-meta')!.textContent).toContain('3 首曲目')
    page.unmount()
  })

  it('TrackList 行数为真实收藏数', async () => {
    favoritesRows = [makeTrack('a'), makeTrack('b')]
    const page = await mountLiked()
    expect(rows(page.container)).toHaveLength(2)
    page.unmount()
  })
})

describe('Liked 页排序下拉（T6.1）', () => {
  it('渲染 5 键白名单（favorited_at/artist/album/title/playCount），当前值为切片 sortBy', async () => {
    favoritesRows = [makeTrack('a')]
    const page = await mountLiked()
    const select = page.container.querySelector<HTMLSelectElement>('.sort-control select')!
    expect(select).not.toBeNull()
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['favorited_at', 'artist', 'album', 'title', 'playCount'])
    expect(select.value).toBe(DEFAULT_FAVORITE_SORT)
    page.unmount()
  })

  it('选中新排序 → 触发切片 refresh(sortBy) 且服务端以该 sortBy 重取', async () => {
    favoritesRows = [makeTrack('a')]
    const page = await mountLiked()
    listSorts = [] // 清掉挂载 refresh 的记录

    const select = page.container.querySelector<HTMLSelectElement>('.sort-control select')!
    act(() => {
      select.value = 'playCount'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flushBrowse()

    expect(listSorts).toEqual(['playCount'])
    expect(useFavoritesStore.getState().sortBy).toBe('playCount')
    expect(select.value).toBe('playCount')
    page.unmount()
  })
})

describe('Liked 页空态（T6.1）', () => {
  it('零收藏 → 空态文案 + 心形图标，不渲染 Hero / 曲目表', async () => {
    favoritesRows = []
    const page = await mountLiked()
    expect(page.container.querySelector('.liked-empty')).not.toBeNull()
    expect(page.container.textContent).toContain('«empty.liked.title»')
    expect(page.container.textContent).toContain('«empty.liked.hint»')
    expect(page.container.querySelector('.liked-empty .library-icon')).not.toBeNull()
    expect(page.container.querySelector('.hero--liked')).toBeNull()
    page.unmount()
  })
})

describe('Liked 页行 ♡ 取切片（T6.1）', () => {
  it('行 ♡ 显示切片收藏态，点击 → toggle 走 favorites.set 且行随集合移除', async () => {
    favoritesRows = [makeTrack('a'), makeTrack('b')]
    const page = await mountLiked()
    // 两行均已在切片集合（refresh 建立），显示已收藏语义（哨兵 key）。
    const fav = page.container.querySelector<HTMLButtonElement>('button[aria-label="«track.unfavorite»"]')!
    expect(fav).not.toBeNull()

    act(() => {
      fav.click()
    })
    await flushBrowse()

    expect(setCalls).toEqual([['a', false]])
    expect(useFavoritesStore.getState().isFavorite('a')).toBe(false)
    // 取消收藏后该行从 Liked 列表移除（乐观），仅剩 1 行。
    expect(rows(page.container)).toHaveLength(1)
    page.unmount()
  })
})

describe('Liked 页「添加到歌单」子菜单接线（T6.6 前置，四页闭环的最后一页）', () => {
  it('右键 → 点既有歌单 → addTracks(playlistId, [track.id]) + 成功 toast', async () => {
    // 播种歌单切片（usePlaylistMenu 的子菜单数据源）+ 监听写动作。
    const playlistRows: PlaylistRow[] = [
      { id: 5, name: '夜航', description: null, trackCount: 0, coverIds: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
    ]
    usePlaylistsStore.setState({ playlists: playlistRows, listLoaded: true, listLoading: false, listError: null })
    const addTracks = vi.spyOn(usePlaylistsStore.getState(), 'addTracks').mockResolvedValue(true)
    const showToast = vi.spyOn(useToastStore.getState(), 'showToast').mockImplementation(() => undefined)

    favoritesRows = [makeTrack('a')]
    const page = await mountLiked()

    // 右键打开菜单 → 点「添加到歌单」父项展开子菜单 → 点歌单「夜航」。
    act(() => {
      rows(page.container)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    })
    const menu = page.container.querySelector<HTMLElement>('.context-menu')
    expect(menu).not.toBeNull()
    act(() => {
      menu!.querySelector<HTMLElement>('.context-item--parent')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    const item = Array.from(menu!.querySelectorAll<HTMLButtonElement>('.context-submenu .context-item')).find(
      (el) => el.textContent?.includes('夜航')
    )
    expect(item, '子菜单中未找到歌单「夜航」').not.toBeNull()
    act(() => item!.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    // addTracks→toast 走 async IIFE，断言前先落微任务。
    await flushBrowse()
    expect(addTracks).toHaveBeenCalledTimes(1)
    expect(addTracks).toHaveBeenCalledWith(5, ['a'])
    expect(showToast).toHaveBeenCalledWith('«toast.addedToPlaylist»')
    page.unmount()
  })
})

describe('三处同步：TrackList 行 ♡ → 切片 → PlayerBar ♥（T6.1 组件级联动）', () => {
  it('行点击取消收藏 → PlayerBar ♥ 立即熄灭', async () => {
    favoritesRows = [makeTrack('a'), makeTrack('b')]
    usePlayerStore.setState({ currentTrack: makeTrack('a') })
    const page = mountPage(
      <MemoryRouter>
        <Liked />
        <PlayerBar />
      </MemoryRouter>
    )
    await flushBrowse()

    // 切片含 a（当前播放曲）→ 播放栏 ♥（取消收藏语义）。
    const before = page.container.querySelector<HTMLButtonElement>(
      '.player-like[aria-label="«track.unfavorite»"]'
    )!
    expect(before.getAttribute('aria-pressed')).toBe('true')

    // 点击列表行 a 的 ♡ → 经共享切片 → 播放栏 ♥ 即时反映。
    const fav = page.container.querySelector<HTMLButtonElement>(
      '.track-list button[aria-label="«track.unfavorite»"]'
    )!
    act(() => {
      fav.click()
    })
    await flushBrowse()

    const after = page.container.querySelector<HTMLButtonElement>('.player-like')!
    expect(after.getAttribute('aria-pressed')).toBe('false')
    expect(after.getAttribute('aria-label')).toBe('«track.favorite»')
    page.unmount()
  })
})
