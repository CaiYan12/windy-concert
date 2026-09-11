/**
 * ArtistDetail 页单测（T4.4，jsdom project）——哨兵 i18n + 客户端挂载（loaded / 数据 / 未找到 / 错误）。
 *
 * 覆盖点：
 *   · SSR 加载态 songs.loading（useParams 经 Routes 注入 id）。
 *   · 数据态：.hero--artist、艺术家名真实文本、artistDetail.label/back/albums/allTracks 哨兵、
 *     专辑网格 .album-card（来自 artist.albums）、曲目表头出现。
 *   · 未找到态：artistDetail.notFound 哨兵、无 hero。
 *   · 错误态：songs.error 哨兵 + 具体错误。
 */
// 必须把 browseFixtures 放在首位：其模块顶层设置 window.api 桩，页面模块 import 时
// 经 client.ts 捕获 window.api（const api = window.api），故桩必须先于页面模块求值。
import { browseApiData, flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ArtistDetail } from './ArtistDetail'
import type { AlbumCard, ArtistCard, TrackRow } from '../../../shared/types'

function renderDetail(id = '3'): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/artists/${id}`]}>
      <Routes>
        <Route path="/artists/:id" element={<ArtistDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

function makeTrack(id: string, title: string): TrackRow {
  return {
    id,
    title,
    artistId: 3,
    artistName: '李宗盛',
    albumId: 9,
    albumTitle: '山丘',
    albumArtist: '李宗盛',
    trackNumber: 1,
    discNumber: 1,
    year: 2013,
    genre: 'Folk',
    duration: 260,
    filePath: `D:/music/${id}.mp3`,
    format: 'flac',
    bitrate: null,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2024-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

const SAMPLE_ALBUMS: AlbumCard[] = [
  { id: 9, title: '山丘', artistName: '李宗盛', year: 2013, coverId: null, trackCount: 10 }
]

const SAMPLE_ARTIST: ArtistCard & {
  sortName: string | null
  avatar: string | null
  background: string | null
  description: string | null
} = {
  id: 3,
  name: '李宗盛',
  trackCount: 30,
  albumCount: 6,
  sortName: null,
  avatar: null,
  background: null,
  description: null
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
})

describe('ArtistDetail 页', () => {
  it('SSR 加载态 → songs.loading 哨兵', () => {
    const html = renderToStaticMarkup(renderDetail())
    expect(html).toContain('«songs.loading»')
  })

  it('数据态 → .hero--artist + 艺术家名 + label/back/albums/allTracks + 专辑网格 + 曲目表头', async () => {
    browseApiData.artist = SAMPLE_ARTIST
    browseApiData.albums = SAMPLE_ALBUMS
    browseApiData.tracks = [makeTrack('x', '山丘'), makeTrack('y', '给自己的歌')]
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.querySelector('.hero--artist')).not.toBeNull()
    expect(container.textContent).toContain('李宗盛')
    expect(container.textContent).toContain('«artistDetail.label»')
    expect(container.textContent).toContain('«artistDetail.back»')
    expect(container.textContent).toContain('«artistDetail.albums»')
    expect(container.textContent).toContain('«artistDetail.allTracks»')
    // 专辑网格复用 AlbumCard 形态。
    expect(container.querySelectorAll('.album-card').length).toBe(1)
    // 曲目表复用 TrackList：表头行出现。
    expect(container.querySelector('.track-row--head')).not.toBeNull()
    unmount()
  })

  it('未找到态 → artistDetail.notFound 哨兵、无 hero', async () => {
    browseApiData.artist = null
    browseApiData.albums = []
    browseApiData.tracks = []
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.querySelector('.hero--artist')).toBeNull()
    expect(container.textContent).toContain('«artistDetail.notFound»')
    unmount()
  })

  // T4.11：详情页表头为纯文本列名（设计稿 ArtistDetail.html grep sort-button 零命中）——
  // 固定序曲目表不承担排序语义，aria-sort 整体缺席（消除「ascending 但无法改序」的失真）。
  it('数据态表头 sortable=false → 无 sort-button、无 aria-sort', async () => {
    browseApiData.artist = SAMPLE_ARTIST
    browseApiData.albums = SAMPLE_ALBUMS
    browseApiData.tracks = [makeTrack('x', '山丘'), makeTrack('y', '给自己的歌')]
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.querySelector('.track-row--head')).not.toBeNull()
    expect(container.querySelector('.sort-button')).toBeNull()
    expect(container.querySelector('[aria-sort]')).toBeNull()
    unmount()
  })

  it('错误态 → songs.error 哨兵 + 具体错误', async () => {
    browseApiData.failArtist = true
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.textContent).toContain('«songs.error»')
    expect(container.textContent).toContain('artist fetch failed')
    unmount()
  })
})
