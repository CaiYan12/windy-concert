/**
 * SearchResults 页单测（T4.5，jsdom project）——?q= 读取与四段式渲染。
 *
 * 覆盖点：
 *   · q 为空 → 引导空态（不发起搜索——browseApiData.searchCalls 保持空，禁自动搜全库）。
 *   · 有 q + 有数据 → 四段式：分组头（标签 + 计数 + 查看全部）、紧凑曲目表、专辑卡、艺术家行、歌单行。
 *   · 空组不渲染（歌单空 → 歌单段缺席，禁凑数）。
 *   · 四组全空 → empty.searchResults.* 空态。
 *   · 错误态 → songs.error 哨兵 + 具体错误。
 */
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  browseApiData,
  flushBrowse,
  installSentinelI18n,
  mountPage,
  resetBrowseApiData
} from './browseFixtures'
import { SearchResults } from './SearchResults'
import type { SearchResult, TrackRow } from '../../../shared/types'

function makeTrack(i: number): TrackRow {
  return {
    id: `t${i}`,
    title: `夜曲${i}`,
    artistId: 1,
    artistName: '周杰伦',
    albumId: 1,
    albumTitle: '十一月的萧邦',
    albumArtist: '周杰伦',
    trackNumber: i,
    discNumber: null,
    year: 2005,
    genre: null,
    duration: 226,
    filePath: `C:/m/${i}.flac`,
    format: 'FLAC',
    bitrate: 1000,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2026-01-01',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

const RESULT: SearchResult = {
  tracks: Array.from({ length: 3 }, (_, i) => makeTrack(i)),
  albums: [{ id: 1, title: '十一月的萧邦', artistName: '周杰伦', year: 2005, coverId: null, trackCount: 12 }],
  artists: [{ id: 1, name: '周杰伦', trackCount: 132, albumCount: 10 }],
  playlists: [{ id: 1, name: '通勤 · 夜行', trackCount: 24 }]
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
})

function mountAt(search: string): { container: HTMLElement; unmount: () => void } {
  return mountPage(
    <MemoryRouter initialEntries={[`/search${search}`]}>
      <SearchResults />
    </MemoryRouter>
  )
}

describe('SearchResults 页', () => {
  it('q 为空 → 引导空态，且不发起任何搜索请求（禁自动搜全库）', () => {
    const { container, unmount } = mountAt('')
    expect(container.textContent).toContain('«search.emptyQuery.title»')
    expect(container.textContent).toContain('«search.emptyQuery.hint»')
    expect(browseApiData.searchCalls).toHaveLength(0)
    unmount()
  })

  it('有 q + 有数据 → 四段式渲染：分组头/计数/查看全部 + 三类卡行', async () => {
    browseApiData.searchResult = RESULT
    const { container, unmount } = mountAt('?q=%E5%A4%9C%E6%9B%B2')
    await flushBrowse()

    // 请求确实带着 q 发出。
    expect(browseApiData.searchCalls).toEqual(['夜曲'])

    // 页头标题走带插值的 i18n（哨兵键 + 真实 q 文本可见）。
    expect(container.textContent).toContain('«search.resultsHeading»')
    expect(container.textContent).toContain('夜曲')

    // 四个分组段（四组均非空）。
    const groups = container.querySelectorAll('.result-group')
    expect(groups.length).toBe(4)

    // 曲目组：紧凑表 3 行（不虚拟滚动、10 列全尺寸表不用）。
    expect(container.querySelectorAll('.track-table--compact .track-row').length).toBe(3)
    // 副标题为「艺术家 · 专辑」（Minor-7③ 回归锚：紧凑表不留只写艺术家的退化形态）。
    const subtitle = container.querySelector('.track-table--compact .track-subtitle')
    expect(subtitle?.textContent).toBe('周杰伦 · 十一月的萧邦')

    // 专辑组：album-card（复用 Albums 页形态）；艺术家组：artist-row；歌单组：非链接行。
    expect(container.querySelectorAll('.album-card').length).toBe(1)
    expect(container.querySelectorAll('.artist-row').length).toBe(2) // 艺术家 1 + 歌单 1（同形态类）

    // 每组「查看全部」链到对应媒体库分区页（对照 SearchResults.html）。
    const viewAll = Array.from(container.querySelectorAll('.result-group-head a')).map((a) =>
      a.getAttribute('href')
    )
    expect(viewAll).toEqual(['/songs', '/albums', '/artists', '/playlists'])
    unmount()
  })

  it('空组不渲染（歌单为空 → 歌单段缺席，不凑数）', async () => {
    browseApiData.searchResult = { ...RESULT, playlists: [] }
    const { container, unmount } = mountAt('?q=%E5%A4%9C%E6%9B%B2')
    await flushBrowse()
    const groups = container.querySelectorAll('.result-group')
    expect(groups.length).toBe(3)
    expect(container.textContent).not.toContain('«search.group.playlists»')
    unmount()
  })

  it('四组全空 → empty.searchResults.* 空态', async () => {
    browseApiData.searchResult = { tracks: [], albums: [], artists: [], playlists: [] }
    const { container, unmount } = mountAt('?q=%E4%B8%8D%E5%AD%98%E5%9C%A8')
    await flushBrowse()
    expect(container.textContent).toContain('«empty.searchResults.title»')
    expect(container.textContent).toContain('«empty.searchResults.hint»')
    expect(container.querySelectorAll('.result-group').length).toBe(0)
    unmount()
  })

  it('错误态 → songs.error 哨兵 + 具体错误', async () => {
    browseApiData.failSearch = true
    const { container, unmount } = mountAt('?q=%E5%A4%9C%E6%9B%B2')
    await flushBrowse()
    expect(container.textContent).toContain('«songs.error»')
    expect(container.textContent).toContain('search failed')
    unmount()
  })
})
