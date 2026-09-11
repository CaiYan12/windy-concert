/**
 * AlbumDetail 页单测（T4.4，jsdom project）——哨兵 i18n + 客户端挂载（loaded / 数据 / 未找到 / 错误）。
 *
 * 覆盖点：
 *   · SSR 加载态 songs.loading（useParams 经 Routes 注入 id）。
 *   · 数据态：.hero--album（全项目唯一渐变锚点类）、专辑名真实文本、albumDetail.label/play/
 *     trackCount/totalMinutes 哨兵、曲目表头（track-row--head）出现。
 *   · 未找到态：albumDetail.notFound 哨兵、无 hero。
 *   · 错误态：songs.error 哨兵 + 具体错误。
 */
// 必须把 browseFixtures 放在首位：其模块顶层设置 window.api 桩，页面模块 import 时
// 经 client.ts 捕获 window.api（const api = window.api），故桩必须先于页面模块求值。
import { browseApiData, flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { type ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AlbumDetail } from './AlbumDetail'
import type { TrackRow } from '../../../shared/types'

function renderDetail(id = '7'): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/albums/${id}`]}>
      <Routes>
        <Route path="/albums/:id" element={<AlbumDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

function makeTrack(id: string, title: string): TrackRow {
  return {
    id,
    title,
    artistId: 1,
    artistName: '周杰伦',
    albumId: 7,
    albumTitle: '十一月的萧邦',
    albumArtist: '周杰伦',
    trackNumber: 1,
    discNumber: 1,
    year: 2005,
    genre: 'Pop',
    duration: 226,
    filePath: `D:/music/${id}.mp3`,
    format: 'mp3',
    bitrate: 320,
    sampleRate: 96000,
    bitDepth: 24,
    playable: true,
    status: 'available',
    coverId: 'cv-1',
    favorite: false,
    playCount: 0,
    dateAdded: '2024-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
})

describe('AlbumDetail 页', () => {
  it('SSR 加载态 → songs.loading 哨兵', () => {
    const html = renderToStaticMarkup(renderDetail())
    expect(html).toContain('«songs.loading»')
  })

  it('数据态 → .hero--album + 专辑名 + albumDetail.label/play/trackCount/totalMinutes + 曲目表头', async () => {
    browseApiData.album = {
      id: 7,
      title: '十一月的萧邦',
      artistName: '周杰伦',
      year: 2005,
      coverId: 'cv-1',
      trackCount: 2,
      genre: 'Pop',
      discCount: 1
    }
    browseApiData.tracks = [makeTrack('a', '夜曲'), makeTrack('b', '发如雪')]
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.querySelector('.hero--album')).not.toBeNull()
    expect(container.textContent).toContain('十一月的萧邦')
    expect(container.textContent).toContain('«albumDetail.label»')
    // 播放钮 aria-label 取 albumDetail.play。
    const playBtn = container.querySelector('.round-action--primary')
    expect(playBtn?.getAttribute('aria-label')).toBe('«albumDetail.play»')
    expect(container.textContent).toContain('«albumDetail.trackCount»')
    expect(container.textContent).toContain('«albumDetail.totalMinutes»')
    // 曲目表复用 TrackList：表头行出现。
    expect(container.querySelector('.track-row--head')).not.toBeNull()
    unmount()
  })

  it('未找到态 → albumDetail.notFound 哨兵、无 hero', async () => {
    browseApiData.album = null
    browseApiData.tracks = []
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.querySelector('.hero--album')).toBeNull()
    expect(container.textContent).toContain('«albumDetail.notFound»')
    unmount()
  })

  it('错误态 → songs.error 哨兵 + 具体错误', async () => {
    browseApiData.failAlbum = true
    const { container, unmount } = mountPage(renderDetail())
    await flushBrowse()
    expect(container.textContent).toContain('«songs.error»')
    expect(container.textContent).toContain('album fetch failed')
    unmount()
  })
})
