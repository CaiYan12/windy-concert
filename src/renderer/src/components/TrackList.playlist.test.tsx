/**
 * TrackList 歌单扩展单测（T6.2 移除曲目菜单项 + T6.3 行拖拽重排）—— jsdom project。
 *
 * 难点与 pageWiring.test.tsx 相同：TrackList 用 react-virtuoso，jsdom 无布局测量 → 行不挂载。
 * 故此处 vi.mock('react-virtuoso') 把列表退化为「直接 map 渲染 itemContent」，让行真实出现在
 * DOM 里以便派发 dragstart / dragover / drop / dragend。
 *
 * 断言对象：
 *   · draggable=true → 表头多出 sr-only「拖拽」列、行挂 draggable="true" + .drag-row + grip 手柄、
 *     表格根多出 .track-table--draggable；draggable=false（默认）→ 这些一概不出现。
 *   · 拖拽态流转：dragstart → 源行 .is-dragging；dragover 目标行 → .is-drop-target；
 *     悬停源行本身不显示插入线；drop → onReorder(from, to) 一次并清态；dragend → 清态。
 *   · onRemoveFromPlaylist 提供时菜单末尾追加「从歌单中移除」并可点；未提供时不渲染。
 */
import { act, type ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { useI18nStore } from '../i18n'
import { mountPage } from '../pages/browseFixtures'
import { TrackList } from './TrackList'

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
    components
  }: {
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

const MESSAGES: Record<string, string> = {
  'songs.tableLabel': '«songs.tableLabel»',
  'playlists.dragHint': '«playlists.dragHint»',
  'menu.removeFromPlaylist': '«menu.removeFromPlaylist»'
}

beforeEach(() => {
  // 哨兵 i18n：未登记的 key 一律映射为 «key»，断言「组件确实经 t() 取用了正确的 key」。
  useI18nStore.setState({
    messages: new Proxy(MESSAGES, { get: (t, k: string) => t[k] ?? `«${k}»` }),
    loaded: true,
    language: 'zh-CN'
  })
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

function makeTrack(id: string): TrackRow {
  return {
    id,
    title: `曲 ${id}`,
    artistId: 1,
    artistName: 'A',
    albumId: 1,
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
    favoritedAt: null
  }
}

const TRACKS = [makeTrack('a'), makeTrack('b'), makeTrack('c')]

function rowEls(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.track-row:not(.track-row--head)'))
}

/** 派发原生拖拽事件（jsdom 无 DragEvent/DataTransfer；组件对 dataTransfer 全程可选链，故用 Event）。 */
function fire(el: HTMLElement, type: string): void {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
  })
}

describe('TrackList draggable（T6.3 开关与结构）', () => {
  it('draggable=true：表格根带变体类、表头有 sr-only 拖拽列、每行有 grip 手柄且 draggable', () => {
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} draggable onReorder={() => undefined} />
    )

    expect(container.querySelector('.track-table--draggable')).not.toBeNull()
    // 表头首列：sr-only「拖拽」（设计稿 PlaylistDetail.html:9）。
    const head = container.querySelector('.track-row--head')
    expect(head?.querySelector('.sr-only')?.textContent).toBe('«playlists.dragHint»')

    const rows = rowEls(container)
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.classList.contains('drag-row')).toBe(true)
      expect(row.getAttribute('draggable')).toBe('true')
      expect(row.querySelector('.drag-handle')).not.toBeNull()
    }
    // 手柄图标为 grip-vertical（文件名带 grip-vertical）。
    expect(rows[0].querySelector('.drag-handle img')?.getAttribute('src')).toContain('grip-vertical')

    unmount()
  })

  it('draggable 缺省：无手柄 / 无 draggable / 无变体类（其余页面不受影响）', () => {
    const { container, unmount } = mountPage(<TrackList songs={TRACKS} />)

    expect(container.querySelector('.track-table--draggable')).toBeNull()
    for (const row of rowEls(container)) {
      expect(row.classList.contains('drag-row')).toBe(false)
      expect(row.getAttribute('draggable')).toBeNull()
      expect(row.querySelector('.drag-handle')).toBeNull()
    }
    expect(container.querySelector('.sr-only')?.textContent).not.toBe('playlists.dragHint')

    unmount()
  })
})

describe('TrackList 拖拽态流转与落位（T6.3）', () => {
  it('dragstart → 源行 is-dragging；dragover 目标行 → is-drop-target；drop → onReorder(0,2) 并清态', () => {
    const onReorder = vi.fn()
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} draggable onReorder={onReorder} />
    )
    const rows = rowEls(container)

    fire(rows[0], 'dragstart')
    expect(rows[0].classList.contains('is-dragging')).toBe(true)
    expect(rows[2].classList.contains('is-drop-target')).toBe(false)

    fire(rows[2], 'dragover')
    expect(rows[2].classList.contains('is-drop-target')).toBe(true)

    fire(rows[2], 'drop')
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(0, 2)
    // 落位后清态：无残留 is-dragging / is-drop-target。
    expect(container.querySelectorAll('.is-dragging')).toHaveLength(0)
    expect(container.querySelectorAll('.is-drop-target')).toHaveLength(0)

    unmount()
  })

  it('悬停源行本身不显示插入线（无位移语义）', () => {
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} draggable onReorder={() => undefined} />
    )
    const rows = rowEls(container)

    fire(rows[1], 'dragstart')
    fire(rows[1], 'dragover')
    expect(rows[1].classList.contains('is-drop-target')).toBe(false)

    unmount()
  })

  it('drop 到源行自身 → 不触发 onReorder', () => {
    const onReorder = vi.fn()
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} draggable onReorder={onReorder} />
    )
    const rows = rowEls(container)

    fire(rows[0], 'dragstart')
    fire(rows[0], 'drop')
    expect(onReorder).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.is-dragging')).toHaveLength(0)

    unmount()
  })

  it('dragend（取消拖拽）→ 清态且不触发 onReorder', () => {
    const onReorder = vi.fn()
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} draggable onReorder={onReorder} />
    )
    const rows = rowEls(container)

    fire(rows[0], 'dragstart')
    fire(rows[2], 'dragover')
    fire(rows[0], 'dragend')

    expect(container.querySelectorAll('.is-dragging')).toHaveLength(0)
    expect(container.querySelectorAll('.is-drop-target')).toHaveLength(0)
    expect(onReorder).not.toHaveBeenCalled()

    unmount()
  })

  it('重复曲目（同一 id 出现两次）不产生重复 key 警告', () => {
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(String(args[0]))
    })
    const dup = [makeTrack('x'), makeTrack('x')]
    const { unmount } = mountPage(<TrackList songs={dup} draggable onReorder={() => undefined} />)
    expect(errors.filter((e) => e.includes('same key'))).toEqual([])
    spy.mockRestore()
    unmount()
  })
})

describe('TrackList onRemoveFromPlaylist（T6.2 右键菜单第五项）', () => {
  it('提供回调：菜单出现「从歌单中移除」，点击后以该曲目回调', () => {
    const onRemoveFromPlaylist = vi.fn()
    const { container, unmount } = mountPage(
      <TrackList songs={TRACKS} onRemoveFromPlaylist={onRemoveFromPlaylist} />
    )
    const rows = rowEls(container)

    act(() => {
      rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    })
    const menu = container.querySelector('.context-menu')
    expect(menu).not.toBeNull()
    const item = Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('«menu.removeFromPlaylist»')
    )
    expect(item).not.toBeUndefined()

    act(() => {
      item!.click()
    })
    expect(onRemoveFromPlaylist).toHaveBeenCalledTimes(1)
    expect(onRemoveFromPlaylist).toHaveBeenCalledWith(TRACKS[1])
    // 点击后菜单关闭。
    expect(container.querySelector('.context-menu')).toBeNull()

    unmount()
  })

  it('未提供回调：菜单不出现「从歌单中移除」（其它上下文保持原四组）', () => {
    const { container, unmount } = mountPage(<TrackList songs={TRACKS} />)
    const rows = rowEls(container)

    act(() => {
      rows[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    })
    const menu = container.querySelector('.context-menu')
    expect(menu).not.toBeNull()
    expect(menu!.textContent).not.toContain('menu.removeFromPlaylist')

    unmount()
  })
})
