/**
 * TrackContextMenu 单测（jsdom project）——I2 / I4 / M1 修复的事件驱动锚点。
 *
 * 承既有测试形态：不引入 @testing-library，用 react-dom/client + act 做最小客户端挂载。
 * 覆盖：打开即聚焦首项、方向键轮转、子菜单父项 aria-expanded + ←/→、菜单内滚动不关闭 /
 * 菜单外滚动关闭、首帧坐标按视口钳制。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaylistSummary, TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { TrackContextMenu } from './TrackContextMenu'

const KEYS = [
  'songs.contextMenu',
  'menu.playNow',
  'menu.addToQueue',
  'menu.favorite',
  'menu.unfavorite',
  'menu.addToPlaylist',
  'menu.newPlaylist'
]

beforeEach(() => {
  useI18nStore.setState({
    messages: Object.fromEntries(KEYS.map((k) => [k, `«${k}»`])),
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

const PLAYLISTS: PlaylistSummary[] = [{ id: 1, name: '晨间', trackCount: 3 }]

interface Mounted {
  container: HTMLElement
  menu: HTMLElement
  onClose: ReturnType<typeof vi.fn>
  unmount: () => void
}

function mountMenu(props: Partial<Parameters<typeof TrackContextMenu>[0]> = {}): Mounted {
  const onClose = vi.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <TrackContextMenu
        x={props.x ?? 0}
        y={props.y ?? 0}
        track={props.track ?? makeTrack()}
        playlists={props.playlists ?? PLAYLISTS}
        onClose={onClose}
      />
    )
  })
  const menu = container.querySelector<HTMLElement>('.context-menu')
  if (!menu) throw new Error('未渲染出 .context-menu')
  return {
    container,
    menu,
    onClose,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

function press(el: Element, key: string): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('I4 键盘可达性', () => {
  it('打开即聚焦首个菜单项', () => {
    const { menu, unmount } = mountMenu()
    const first = menu.querySelector<HTMLElement>(':scope > [role="menuitem"]')
    expect(document.activeElement).toBe(first)
    unmount()
  })

  it('ArrowDown / ArrowUp 在菜单项间轮转（含环绕）', () => {
    const { menu, unmount } = mountMenu()
    const items = Array.from(menu.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]'))
    expect(items).toHaveLength(4)
    expect(document.activeElement).toBe(items[0])

    press(items[0], 'ArrowDown')
    expect(document.activeElement).toBe(items[1])

    press(items[1], 'ArrowUp')
    expect(document.activeElement).toBe(items[0])

    // 从首项向上 → 环绕到末项
    press(items[0], 'ArrowUp')
    expect(document.activeElement).toBe(items[3])
    unmount()
  })

  it('子菜单父项 aria-expanded 随 ←/→ 切换，且焦点在父项与子项间往返', () => {
    const { menu, unmount } = mountMenu()
    const parent = menu.querySelector<HTMLElement>('.context-item--parent')!
    expect(parent.getAttribute('aria-expanded')).toBe('false')

    act(() => parent.focus())
    press(parent, 'ArrowRight')
    expect(parent.getAttribute('aria-expanded')).toBe('true')
    const firstSub = menu.querySelector<HTMLElement>('.context-submenu [role="menuitem"]')
    expect(document.activeElement).toBe(firstSub)

    press(firstSub!, 'ArrowLeft')
    expect(parent.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(parent)
    unmount()
  })
})

describe('I2 滚动关闭不误伤菜单内滚动', () => {
  it('子菜单自身滚动不关闭；菜单外滚动照常关闭', () => {
    const { menu, onClose, unmount } = mountMenu()
    const submenu = menu.querySelector<HTMLElement>('.context-submenu')!
    act(() => {
      submenu.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      document.body.dispatchEvent(new Event('scroll'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('Escape 仍然关闭（回归）', () => {
    const { menu, onClose, unmount } = mountMenu()
    press(menu, 'Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('M1 首帧坐标钳制', () => {
  it('贴右下边打开 → 位置被钳制在视口内（margin 8）', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    // jsdom 的 getBoundingClientRect 全为 0 → 钳制上界 = innerWidth - 0 - 8 / innerHeight - 0 - 8
    const { menu, unmount } = mountMenu({ x: 5000, y: 5000 })
    expect(menu.style.left).toBe('992px')
    expect(menu.style.top).toBe('792px')
    unmount()
  })
})
