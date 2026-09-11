/**
 * QueuePanel 单测（T5.5，jsdom project）—— 三段渲染 / 当前曲静态 accent / 插队标识 /
 * 0.1 只读零编辑 affordance / 空态 / 开合可达性 / AppShell 开合类切换。
 *
 * 形态（与 PlayerBar.test.tsx 一致，无 @testing-library）：
 *   · 哨兵 i18n（任意 key → «key»）断言「用了哪个 key」；
 *   · playerStore 为应用单例：模块顶层捕获 INITIAL_STATE，beforeEach 整体复位；
 *     QueuePanel 只读 queueView（三段数据由 playerStore.queueView.test.ts 覆盖推导逻辑，
 *     本文件直接注入视图快照，聚焦渲染契约）。
 */
import { act } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../../shared/types'
import { installSentinelI18n, mountPage } from '../../pages/browseFixtures'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import { AppShell } from './AppShell'
import { QueuePanel } from './QueuePanel'

function makeTrack(over: Partial<TrackRow> = {}): TrackRow {
  return {
    id: 't1',
    title: '夜曲',
    artistId: 1,
    artistName: '周杰伦',
    albumId: 7,
    albumTitle: '十一月的萧邦',
    albumArtist: '周杰伦',
    trackNumber: 1,
    discNumber: null,
    year: 2005,
    genre: null,
    duration: 226,
    filePath: 'C:/m/1.flac',
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
    favoritedAt: null,
    ...over
  }
}

const cur = makeTrack({ id: 't1' })
const uq = makeTrack({ id: 't2', title: '发如雪' })
const rest1 = makeTrack({ id: 't3', title: '晴天' })
const rest2 = makeTrack({ id: 't4', title: '七里香' })

/** 注入三段视图快照（组件只读，推导逻辑在 playerStore.queueView.test.ts 锚定）。 */
function setQueueView(partial: Partial<{ current: TrackRow | null; upNextUserQueue: TrackRow[]; upNextRest: TrackRow[] }>): void {
  usePlayerStore.setState({
    queueView: {
      current: null,
      upNextUserQueue: [],
      upNextRest: [],
      ...partial
    }
  } as never)
}

function mountPanel(open = true, onClose: () => void = () => {}): { container: HTMLElement; unmount: () => void } {
  return mountPage(<QueuePanel open={open} onClose={onClose} />)
}

beforeEach(() => {
  installSentinelI18n()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // AppShell 夹具：预置 stats（非 null）——Sidebar 的 ensureStatsLoaded 幂等短路，避免
  // 异步 refresh 的 act 告警；browseFixtures 的 library 桩无 getStats，预置即规避。
  useStatsStore.setState({ stats: { tracks: 0, albums: 0, artists: 0 } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QueuePanel 三段结构（components.html 样本）', () => {
  it('渲染三段：标题 key 正确、当前曲行 is-playing + music-2--accent 静态指示（裁定：无第二无限动画）', () => {
    setQueueView({ current: cur, upNextUserQueue: [uq], upNextRest: [rest1] })
    const { container, unmount } = mountPanel()

    const sections = container.querySelectorAll('.queue-section')
    expect(sections).toHaveLength(3)
    const labels = [...container.querySelectorAll('.queue-section-label')].map((el) => el.textContent)
    expect(labels).toEqual(['«queue.nowPlaying»', '«queue.upNextUserQueue»', '«queue.upNext»'])

    const playingRow = container.querySelector('.queue-row.is-playing')
    expect(playingRow).not.toBeNull()
    expect(playingRow!.querySelector('.queue-title')!.textContent).toBe('夜曲')
    const playingIcon = playingRow!.querySelector('img.is-playing-icon') as HTMLImageElement
    expect(playingIcon.src).toContain('music-2--accent')
    // 裁定留痕：静态指示，不得渲染 Equalizer（无 .equalizer 节点）
    expect(container.querySelector('.equalizer')).toBeNull()
    unmount()
  })

  it('插队行 corner-down-right 标识；下次播放段行尾 numeric 序号 = 插队段行数 + 段内序号 + 1', () => {
    setQueueView({ current: cur, upNextUserQueue: [uq], upNextRest: [rest1, rest2] })
    const { container, unmount } = mountPanel()

    const uqRow = container.querySelector('.queue-row.is-up-next')
    expect(uqRow).not.toBeNull()
    const uqIcon = uqRow!.querySelector('.queue-icon img') as HTMLImageElement
    expect(uqIcon.src).toContain('corner-down-right')
    expect(uqRow!.querySelector('.queue-title')!.textContent).toBe('发如雪')

    const numerics = [...container.querySelectorAll('.queue-icon.numeric')].map((el) => el.textContent)
    expect(numerics).toEqual(['02', '03']) // 设计稿样本：1 首插队 + 1 首顺序 → 「02」
    unmount()
  })

  it('行内容 = 封面占位 + 标题 + 艺术家（对照样本列）', () => {
    setQueueView({ current: cur, upNextUserQueue: [], upNextRest: [rest1] })
    const { container, unmount } = mountPanel()
    const row = container.querySelector('.queue-row')!
    expect(row.querySelector('.cover')).not.toBeNull() // cover--table 占位（coverId=null）
    expect(row.querySelector('.queue-artist')!.textContent).toBe('周杰伦')
    unmount()
  })
})

describe('QueuePanel 0.1 只读硬约束', () => {
  it('除头部关闭按钮外零按钮、零拖拽/删除 affordance（F5-4 禁区；不实现点击跳播，留痕）', () => {
    setQueueView({ current: cur, upNextUserQueue: [uq], upNextRest: [rest1, rest2] })
    const { container, unmount } = mountPanel()

    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].getAttribute('aria-label')).toBe('«queue.close»')
    // 行是纯展示 div：无 button/role=button/可拖拽节点/grip-vertical 手柄
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0)
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
    expect(container.querySelectorAll('img[src*="grip-vertical"]')).toHaveLength(0)
    unmount()
  })
})

describe('QueuePanel 空态与开合可达性', () => {
  it('三段全空 → queue.empty 空态文案；头部关闭按钮仍可达', () => {
    setQueueView({})
    const onClose = vi.fn()
    const { container, unmount } = mountPanel(true, onClose)
    expect(container.textContent).toContain('«queue.empty»')
    expect(container.querySelectorAll('.queue-section')).toHaveLength(0)
    act(() => {
      ;(container.querySelector('button[aria-label="«queue.close»"]') as HTMLButtonElement).click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('关闭态 aria-hidden + inert（防焦点落屏外）；展开态两者解除', () => {
    setQueueView({ current: cur })
    const closed = mountPanel(false)
    const aside = closed.container.querySelector('aside.queue-panel') as HTMLElement
    expect(aside.getAttribute('aria-hidden')).toBe('true')
    expect(aside.hasAttribute('inert')).toBe(true)
    closed.unmount()

    const opened = mountPanel(true)
    const asideOpen = opened.container.querySelector('aside.queue-panel') as HTMLElement
    expect(asideOpen.getAttribute('aria-hidden')).toBeNull()
    expect(asideOpen.hasAttribute('inert')).toBe(false)
    opened.unmount()
  })
})

describe('AppShell 开合接线（queue-open 状态类）', () => {
  it('播放栏队列按钮切换 .queue-open；面板头部 x 关闭', () => {
    usePlayerStore.setState({ currentTrack: cur }) // 空队列下队列按钮 disabled，需有当前曲
    // Topbar 用 useMatches（data router 专属），故用 createMemoryRouter 而非 MemoryRouter
    const router = createMemoryRouter([{ path: '/', element: <AppShell /> }])
    const { container, unmount } = mountPage(<RouterProvider router={router} />)

    const shell = container.querySelector('.app-shell') as HTMLElement
    const panel = container.querySelector('.queue-panel') as HTMLElement
    expect(shell.classList.contains('queue-open')).toBe(false)
    expect(panel.getAttribute('aria-hidden')).toBe('true')

    const toggle = container.querySelector('button[aria-label="«queue.open»"]') as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(shell.classList.contains('queue-open')).toBe(true)
    expect(panel.getAttribute('aria-hidden')).toBeNull()

    const close = container.querySelector('button[aria-label="«queue.close»"]') as HTMLButtonElement
    act(() => {
      close.click()
    })
    expect(shell.classList.contains('queue-open')).toBe(false)
    expect(panel.getAttribute('aria-hidden')).toBe('true')
    unmount()
  })
})
