/**
 * Artists 页单测（T4.4，jsdom project）——哨兵 i18n + 客户端挂载（loaded/empty/error 三态）。
 *
 * 覆盖点：
 *   · 加载态 artists.loading 哨兵（SSR）。
 *   · 数据态：.artist-row 渲染、艺术家名真实文本、artist-count 取 artists.trackCount、
 *     artists.total 出现（真实 count，listArtists 全量）。
 *   · 空态 / 错误态哨兵。
 */
// 必须把 browseFixtures 放在首位：其模块顶层设置 window.api 桩，页面模块 import 时
// 经 client.ts 捕获 window.api（const api = window.api），故桩必须先于页面模块求值。
import { browseApiData, flushBrowse, installSentinelI18n, mountPage, resetBrowseApiData } from './browseFixtures'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artists } from './Artists'
import type { ArtistCard } from '../../../shared/types'

const SAMPLE_ARTISTS: ArtistCard[] = [
  { id: 1, name: '周杰伦', trackCount: 88, albumCount: 14 },
  { id: 2, name: '李宗盛', trackCount: 30, albumCount: 6 }
]

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
})

describe('Artists 页', () => {
  it('SSR 加载态 → artists.loading 哨兵', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Artists />
      </MemoryRouter>
    )
    expect(html).toContain('«artists.loading»')
  })

  it('数据态 → .artist-row ×N、艺术家名真实文本、artist-count 取 artists.trackCount、artists.total', async () => {
    browseApiData.artists = SAMPLE_ARTISTS
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Artists />
      </MemoryRouter>
    )
    await flushBrowse()
    const rows = container.querySelectorAll('.artist-row')
    expect(rows.length).toBe(2)
    expect(container.textContent).toContain('周杰伦')
    expect(container.textContent).toContain('李宗盛')
    expect(container.textContent).toContain('«artists.trackCount»')
    expect(container.textContent).toContain('«artists.total»')
    unmount()
  })

  it('空态 → empty.artists.* 哨兵、无 .artist-row', async () => {
    browseApiData.artists = []
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Artists />
      </MemoryRouter>
    )
    await flushBrowse()
    expect(container.querySelectorAll('.artist-row').length).toBe(0)
    expect(container.textContent).toContain('«empty.artists.title»')
    expect(container.textContent).toContain('«empty.artists.hint»')
    unmount()
  })

  it('错误态 → songs.error 哨兵 + 具体错误', async () => {
    browseApiData.failList = true
    const { container, unmount } = mountPage(
      <MemoryRouter>
        <Artists />
      </MemoryRouter>
    )
    await flushBrowse()
    expect(container.textContent).toContain('«songs.error»')
    expect(container.textContent).toContain('artist list failed')
    unmount()
  })
})
