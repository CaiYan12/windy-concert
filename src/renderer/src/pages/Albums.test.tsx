/**
 * Albums 页单测（T4.4，jsdom project）——哨兵 i18n + 客户端挂载（数据态由 useBrowseData 经
 * window.api 桩取数；loaded/empty/error 三态全覆盖）。
 *
 * 覆盖点：
 *   · 加载态哨兵 albums.loading（SSR，effect 未跑）。
 *   · 数据态：.album-card 渲染、卡片标题真实文本、card-play 的 aria-label 取 albumDetail.play、
 *     albums.total 出现（真实 count 可渲染，listAlbums 全量无分页）。
 *   · 空态：empty.albums.* 哨兵、无 .album-card。
 *   · 错误态：songs.error 哨兵 + 具体错误信息。
 */
// 必须把 browseFixtures 放在首位：其模块顶层设置 window.api 桩，页面模块 import 时
// 经 client.ts 捕获 window.api（const api = window.api），故桩必须先于页面模块求值。
import { browseApiData, flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Albums } from './Albums'
import type { AlbumCard } from '../../../shared/types'

const SAMPLE_ALBUMS: AlbumCard[] = [
  { id: 1, title: '十一月的萧邦', artistName: '周杰伦', year: 2005, coverId: 'cv-1', trackCount: 12 },
  { id: 2, title: '范特西', artistName: '周杰伦', year: 2001, coverId: null, trackCount: 10 }
]

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
})

describe('Albums 页', () => {
  it('SSR 加载态 → albums.loading 哨兵', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    )
    expect(html).toContain('«albums.loading»')
  })

  it('数据态 → .album-card ×N、卡片标题真实文本、card-play aria-label=albumDetail.play、albums.total', async () => {
    browseApiData.albums = SAMPLE_ALBUMS
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    )
    await flushBrowse()
    const cards = container.querySelectorAll('.album-card')
    expect(cards.length).toBe(2)
    expect(container.textContent).toContain('十一月的萧邦')
    expect(container.textContent).toContain('范特西')
    // 每个卡片的 hover 播放钮 aria-label 取 albumDetail.play（哨兵）。
    const playBtns = container.querySelectorAll('.card-play')
    expect(playBtns.length).toBe(2)
    for (const btn of Array.from(playBtns)) {
      expect(btn.getAttribute('aria-label')).toBe('«albumDetail.play»')
    }
    expect(container.textContent).toContain('«albums.total»')
    unmount()
  })

  it('空态 → empty.albums.* 哨兵、无 .album-card', async () => {
    browseApiData.albums = []
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    )
    await flushBrowse()
    expect(container.querySelectorAll('.album-card').length).toBe(0)
    expect(container.textContent).toContain('«empty.albums.title»')
    expect(container.textContent).toContain('«empty.albums.hint»')
    unmount()
  })

  it('错误态 → songs.error 哨兵 + 具体错误', async () => {
    browseApiData.failList = true
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Albums />
      </MemoryRouter>
    )
    await flushBrowse()
    expect(container.textContent).toContain('«songs.error»')
    expect(container.textContent).toContain('album list failed')
    unmount()
  })
})
