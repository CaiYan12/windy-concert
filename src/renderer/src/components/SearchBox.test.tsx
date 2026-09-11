/**
 * SearchBox 单测（T4.5，jsdom project）——debounce → 取数 → 下拉渲染 → 键盘/点外关闭链路。
 *
 * 夹具：复用 browseFixtures（window.api 桩先行 + 哨兵 i18n + 客户端挂载），search 通道读
 * browseApiData.searchResult。防抖用假计时器驱动（与 searchUtils.test.ts 的纯函数时序锚点
 * 分层：此处锚「输入 → 200ms 后才发起 IPC」的组件级集成时序）。
 */
import { act } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  browseApiData,
  installSentinelI18n,
  mountPage,
  resetBrowseApiData
} from '../pages/browseFixtures'
import { SearchBox } from './SearchBox'
import type { SearchResult, TrackRow } from '../../../shared/types'

function makeTrack(i: number): TrackRow {
  return {
    id: `t${i}`,
    title: `曲目${i}`,
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

const FULL_RESULT: SearchResult = {
  tracks: Array.from({ length: 7 }, (_, i) => makeTrack(i)),
  albums: [{ id: 1, title: '十一月的萧邦', artistName: '周杰伦', year: 2005, coverId: null, trackCount: 12 }],
  artists: [{ id: 1, name: '周杰伦', trackCount: 132, albumCount: 10 }],
  playlists: []
}

/** 受控输入赋值（React 18 受控组件需走原型 setter + input 事件）。 */
async function type(container: HTMLElement, text: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')
  expect(input).not.toBeNull()
  input!.focus()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input!, text)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(() => {
  installSentinelI18n()
  resetBrowseApiData()
  browseApiData.searchResult = FULL_RESULT
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function mount(): { container: HTMLElement; unmount: () => void } {
  return mountPage(
    <MemoryRouter>
      <SearchBox />
    </MemoryRouter>
  )
}

/** 带 location 探针的挂载（断言「是否发生路由跳转」用，如 IME Enter 不得触发跳页）。 */
function mountWithLocationProbe(): {
  container: HTMLElement
  unmount: () => void
  getPath: () => string
} {
  let path = '/'
  function Probe(): null {
    const location = useLocation()
    path = `${location.pathname}${location.search}`
    return null
  }
  const mounted = mountPage(
    <MemoryRouter>
      <SearchBox />
      <Probe />
    </MemoryRouter>
  )
  return { ...mounted, getPath: () => path }
}

describe('SearchBox', () => {
  it('输入后 200ms 内不发起搜索、不出下拉；静默 200ms 后发起一次并渲染下拉', async () => {
    const { container, unmount } = mount()
    await type(container, '夜曲')

    // 变异验证锚点：searchUtils 的 debounce 被删除（同步直调）时此断言红。
    vi.advanceTimersByTime(199)
    expect(browseApiData.searchCalls).toHaveLength(0)
    expect(container.querySelector('.search-preview')).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(browseApiData.searchCalls).toEqual(['夜曲'])
    expect(container.querySelector('.search-preview')).not.toBeNull()
    unmount()
  })

  it('下拉四组各最多 5 条；空组（歌单）不渲染；「查看全部」链到 /search?q=…', async () => {
    const { container, unmount } = mount()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })

    const groups = container.querySelectorAll('.search-preview-group')
    // 歌单组为空 → 不渲染（components.html：「无结果组不渲染」；禁假数据）。
    expect(groups.length).toBe(3)
    // 曲目 7 条 → 只渲染前 5（SEARCH_PREVIEW_LIMIT）。
    const trackItems = groups[0].querySelectorAll('.search-preview-item')
    expect(trackItems.length).toBe(5)
    expect(container.textContent).not.toContain('曲目5')
    expect(container.textContent).toContain('曲目4')
    // 每组「查看全部」→ /search?q=…
    const links = Array.from(container.querySelectorAll('.search-preview-head a'))
    expect(links.length).toBe(3)
    for (const link of links) {
      expect(link.getAttribute('href')).toContain('/search?q=')
    }
    // 28px 前导列：曲目/专辑组渲染封面盒（fixture coverId 为 null → 占位形态），
    // 艺术家组渲染中性图标占位盒（无封面数据，禁造假数据）；歌单组空缺席。
    expect(container.querySelectorAll('.search-preview-item .cover--preview').length).toBe(6) // 5 曲目 + 1 专辑
    expect(container.querySelectorAll('.search-preview-item .preview-badge').length).toBe(1)
    unmount()
  })

  it('四组全空 → search.noResults 空态（不渲染任何组）', async () => {
    browseApiData.searchResult = { tracks: [], albums: [], artists: [], playlists: [] }
    const { container, unmount } = mount()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelectorAll('.search-preview-group').length).toBe(0)
    expect(container.textContent).toContain('«search.noResults»')
    unmount()
  })

  it('Escape 关闭下拉并把焦点归还输入框；点外部关闭下拉', async () => {
    const { container, unmount } = mount()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).not.toBeNull()

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    // Escape：关下拉 + 归还焦点（焦点本就在输入框——验证其保持，且下拉被移除）。
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.search-preview')).toBeNull()
    expect(document.activeElement).toBe(input)

    // 重新输入出下拉后，点容器外部 → 关闭。
    await type(container, '萧邦')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).not.toBeNull()
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(container.querySelector('.search-preview')).toBeNull()
    unmount()
  })

  it('ArrowDown 把焦点移入下拉首个链接；组内 ↑ 回到输入框', async () => {
    const { container, unmount } = mount()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    const firstLink = container.querySelector<HTMLAnchorElement>('.search-preview a[href]')
    expect(firstLink).not.toBeNull()
    expect(document.activeElement).toBe(firstLink)

    await act(async () => {
      firstLink!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(document.activeElement).toBe(input)
    unmount()
  })

  it('点击下拉内链接导航后下拉关闭（路由变化统一收口）', async () => {
    const { container, unmount } = mount()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).not.toBeNull()

    // Topbar/SearchBox 跨页持续挂载：Link 导航不改组件挂载状态，
    // 必须由 location 变化 effect 关闭下拉，否则残影浮在新页之上。
    const link = container.querySelector<HTMLAnchorElement>('.search-preview-head a')!
    await act(async () => {
      link.click()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).toBeNull()
    unmount()
  })

  it('Escape 后在途响应落地不重开下拉（seq 作废在途响应）', async () => {
    const { container, unmount } = mount()
    // 第一次查询正常出下拉。
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).not.toBeNull()

    // 第二次输入触发新的防抖请求；推进 200ms 让请求发起（Promise 已创建，
    // 但**不**冲刷微任务——响应仍在途），随后按 Escape。
    await type(container, '萧邦')
    vi.advanceTimersByTime(200)
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('.search-preview')).toBeNull()

    // 此时在途响应才落地：seq 已被 Escape 作废 → 不得把刚关掉的下拉重新打开。
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.querySelector('.search-preview')).toBeNull()
    unmount()
  })

  it('IME 组合中（isComposing）的 Enter/Escape 不触发跳页/关下拉', async () => {
    const { container, unmount, getPath } = mountWithLocationProbe()
    await type(container, '夜曲')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(container.querySelector('.search-preview')).not.toBeNull()

    // 候选词确认的 Enter：不是「跳全结果页」指令。
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })
      )
    })
    expect(getPath()).toBe('/')

    // 取消组合的 Escape：不是「关下拉」指令。
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true })
      )
    })
    expect(container.querySelector('.search-preview')).not.toBeNull()
    unmount()
  })

  it('全空白输入（仅空格）不发起请求（trim 守卫回归锚）', async () => {
    const { container, unmount } = mount()
    await type(container, '   ')
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(browseApiData.searchCalls).toHaveLength(0)
    expect(container.querySelector('.search-preview')).toBeNull()
    unmount()
  })

  it('Ctrl+K 聚焦搜索输入框', () => {
    const { container, unmount } = mount()
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(document.activeElement).not.toBe(input)
    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
      )
    })
    expect(document.activeElement).toBe(input)
    unmount()
  })
})
