/**
 * Songs 页单测（T4.4，jsdom project）——哨兵 i18n + renderToStaticMarkup。
 *
 * 覆盖点：
 *   · 页头绑定真实 key（songs.heading），不渲染假总数（§3.7 无 songsCount 通道，T4.4 计划）。
 *   · 复用 TrackList 空态（含角色/可访问名）。
 * 有数据态（virtuoso 虚拟滚动）由 tests/e2e/tracklist.spec.ts 覆盖，此处不重复。
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { Songs } from './Songs'
import { installSentinelI18n } from './browseFixtures'

beforeEach(() => {
  installSentinelI18n()
})

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
  })
})
