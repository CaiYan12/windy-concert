/**
 * TrackList 焦点归还集成测试（jsdom project）——I4 二轮复审立案的重做。
 *
 * 为什么单独成文件：本文件 vi.mock('react-virtuoso') 让带数据的真实 <TrackList> 能在 jsdom 里
 * 渲染出数据行（真实 virtuoso 依赖布局测量，jsdom 高度为 0 → 一行不渲染）。该 mock 是文件级的，
 * 不能影响 TrackList.test.tsx 里「数据态走真实 virtuoso、SSR 不重复覆盖」的既有边界，故隔离于此。
 *
 * 为什么必须重做（二轮复审变异证据）：此前放在 TrackList.test.tsx 的行级 harness 测试把
 * trigger 记在测试自己的闭包里、又在测试体里手动 trigger?.focus()——删掉生产代码
 * TrackList.tsx closeMenu 里的 menuTriggerRef.current?.focus() 后测试仍全绿，属空转。
 * 本文件走真实链路：TrackRowItem contextmenu → TrackList.onOpenMenu（menuTriggerRef 记录触发行）
 * → TrackContextMenu 全局 keydown(Escape) → closeMenu → 焦点归还触发行。生产 focus 调用被删
 * 时本测试必红（实现者已变异验证：删除 → FAIL → 还原 → PASS）。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { TrackList } from './TrackList'

// jsdom 无布局 → 真实 virtuoso 渲染 0 行。用最小替身把 data 经 itemContent 直绘，
// 保留 components.Header（表头行由它渲染），使 TrackList 的生产 JSX 原样执行。
vi.mock('react-virtuoso', () => ({
  Virtuoso: function VirtuosoMock({
    data,
    itemContent,
    computeItemKey,
    components
  }: {
    data: readonly unknown[]
    itemContent: (index: number, item: unknown) => React.ReactNode
    computeItemKey: (index: number, item: unknown) => string | number
    components?: { Header?: React.ComponentType | null }
  }) {
    const Header = components?.Header
    return (
      <>
        {Header ? <Header /> : null}
        {data.map((item, i) => (
          <div key={computeItemKey(i, item)}>{itemContent(i, item)}</div>
        ))}
      </>
    )
  }
}))

const USED_KEYS = [
  'songs.tableLabel',
  'songs.error',
  'songs.contextMenu',
  'menu.playNow',
  'menu.addToQueue',
  'menu.favorite',
  'menu.unfavorite',
  'menu.addToPlaylist',
  'menu.newPlaylist',
  'track.missing',
  'track.unplayableTooltip',
  'track.favorite',
  'track.unfavorite',
  'track.playing',
  'menu.play'
]

beforeEach(() => {
  useI18nStore.setState({
    messages: Object.fromEntries(USED_KEYS.map((k) => [k, `«${k}»`])),
    loaded: true,
    language: 'zh-CN'
  })
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

function makeTrack(over: Partial<TrackRow> = {}): TrackRow {
  return {
    id: 'id-1',
    title: '夜曲',
    artistId: 1,
    artistName: '周杰伦',
    albumId: 1,
    albumTitle: '十一月的萧邦',
    albumArtist: '周杰伦',
    trackNumber: 1,
    discNumber: 1,
    year: 2005,
    genre: 'Pop',
    duration: 226,
    filePath: 'D:/music/01-夜曲.mp3',
    format: 'mp3',
    bitrate: 320,
    sampleRate: 96000,
    bitDepth: 24,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2024-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null,
    ...over
  }
}

describe('TrackList 焦点归还（I4，真实集成：contextmenu → Escape → 焦点回触发行）', () => {
  it('右键打开菜单后按 Escape，焦点归还到触发右键的那一行', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<TrackList songs={[makeTrack()]} />)
    })

    const row = container.querySelector<HTMLElement>('.track-row:not(.track-row--head)')
    expect(row, 'mock virtuoso 应渲染出数据行').not.toBeNull()

    // 键盘用户路径：行上按出右键菜单（真实 TrackList 接线记录触发行）。
    act(() => {
      row!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })
      )
    })
    const menu = document.body.querySelector('.context-menu')
    expect(menu, '右键后应渲染出 .context-menu').not.toBeNull()

    // Escape 关闭（TrackContextMenu 的全局 keydown → onClose = TrackList.closeMenu）。
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.body.querySelector('.context-menu')).toBeNull()

    // 核心断言：焦点回到触发行（由生产代码 menuTriggerRef.current?.focus() 完成；
    // 删除该调用时 activeElement 停留在已卸载菜单项/body，本断言必红）。
    expect(document.activeElement).toBe(row)

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
