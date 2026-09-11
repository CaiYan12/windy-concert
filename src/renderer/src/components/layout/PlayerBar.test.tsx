/**
 * PlayerBar 单测（T5.4，jsdom project）—— F4-3 全要素交互与状态接线。
 *
 * 形态（与 SearchBox/TrackList 一致，无 @testing-library）：
 *   · 哨兵 i18n（任意 key → «key»）让 aria-label 断言直接证明「用了哪个 key」；
 *   · react-dom/client + act 客户端挂载（事件需真实派发）；
 *   · playerStore 为应用单例（usePlayerStore）：测试用「单例 + 复位」隔离——
 *     模块顶层捕获 INITIAL_STATE，beforeEach 以 replace 形态整体复位，需要断言动作调用时再
 *     把特定动作替换为 vi.fn（见 playerStore.test.ts 工厂 vs 单例的取舍）。
 *   · favorites:set 走 window.api.favorites.set —— 测试中把 window.api.favorites 替换为 { set: vi.fn() }。
 */
import { act } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../../shared/types'
import { installSentinelI18n, mountPage } from '../../pages/browseFixtures'
import { usePlayerStore } from '../../stores/playerStore'
import { PlayerBar } from './PlayerBar'

// 单例初始快照（replace 复位基线；含原始动作闭包，复位后恢复真实行为）。
const INITIAL_STATE = usePlayerStore.getState()

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

/** 设置单例播放态（在复位之后调用）。 */
function setPlayer(partial: Partial<ReturnType<typeof usePlayerStore.getState>>): void {
  usePlayerStore.setState(partial as never)
}

/** 把特定动作替换为 spy（断言「点击调用 store 动作」用，不改动状态）。返回 spy。 */
function spyAction(name: 'togglePlay' | 'next' | 'previous' | 'seek' | 'setVolume' | 'toggleMute') {
  const spy = vi.fn()
  usePlayerStore.setState({ [name]: spy } as never)
  return spy
}

/** 把动作替换为 spy 但转发到原始实现（既要断言调用、又要状态真的变更以驱动 DOM 断言）。 */
function spyWraps(name: 'setShuffle' | 'setRepeat') {
  const orig = (INITIAL_STATE as unknown as Record<string, (...a: unknown[]) => unknown>)[name]
  const spy = vi.fn((...args: unknown[]) => orig(...args))
  usePlayerStore.setState({ [name]: spy } as never)
  return spy
}

function mount(): { container: HTMLElement; unmount: () => void } {
  return mountPage(
    <MemoryRouter>
      <PlayerBar />
    </MemoryRouter>
  )
}

/** 带 location 探针的挂载（断言标题点击跳专辑）。 */
function mountWithLocationProbe(albumId: number): {
  container: HTMLElement
  unmount: () => void
  getPath: () => string
} {
  let path = '/'
  function Probe(): null {
    const loc = useLocation()
    path = `${loc.pathname}`
    return null
  }
  const mounted = mountPage(
    <MemoryRouter initialEntries={['/']}>
      <PlayerBar />
      <Probe />
    </MemoryRouter>
  )
  void albumId
  return { ...mounted, getPath: () => path }
}

/** 模拟条元素布局宽度（jsdom 默认全 0，须手动给）。 */
function mockRect(el: HTMLElement, width: number): void {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 4, right: width, bottom: 4, x: 0, y: 0, toJSON() {} } as DOMRect)
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  installSentinelI18n()
  // window.api 复位为 browseFixtures 桩；再为 favorites 提供可断言的 set。
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.favorites = { set: vi.fn() }
  // 整体复位单例到初始（含原始动作）。
  usePlayerStore.setState(INITIAL_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('空队列（currentTrack=null）：全部控件 disabled', () => {
  it('传输五钮 + 收藏 + 队列 + 静音均 disabled；进度/音量条 aria-disabled=true', () => {
    setPlayer({ currentTrack: null })
    const { container, unmount } = mount()
    const labels = ['«player.shuffle»', '«player.previous»', '«player.play»', '«player.next»', '«player.repeat»']
    for (const label of labels) {
      const btn = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      expect(btn, label).not.toBeNull()
      expect(btn!.disabled, label).toBe(true)
    }
    const fav = container.querySelector<HTMLButtonElement>('button[aria-label="«track.favorite»"]')!
    const queue = container.querySelector<HTMLButtonElement>('button[aria-label="«queue.open»"]')!
    const mute = container.querySelector<HTMLButtonElement>('button[aria-label="«player.mute»"]')!
    expect(fav.disabled).toBe(true)
    expect(queue.disabled).toBe(true)
    expect(mute.disabled).toBe(true)
    const progress = container.querySelector<HTMLElement>('.progress-bar')!
    const volume = container.querySelector<HTMLElement>('.volume-bar')!
    expect(progress.getAttribute('aria-disabled')).toBe('true')
    expect(volume.getAttribute('aria-disabled')).toBe('true')
    unmount()
  })

  it('空队列不渲染曲目信息与均衡器（仅占位封面）', () => {
    setPlayer({ currentTrack: null })
    const { container, unmount } = mount()
    expect(container.querySelector('.player-title')).toBeNull()
    expect(container.querySelector('.equalizer')).toBeNull()
    expect(container.querySelector('.cover--placeholder')).not.toBeNull()
    unmount()
  })
})

describe('有曲目：传输控件可用 + 图标变体', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack(), playing: true, duration: 200, position: 0, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('播放中：传输钮 enabled；主按钮图标为 pause--on-accent', () => {
    const { container, unmount } = mount()
    const play = container.querySelector<HTMLButtonElement>('button[aria-label="«player.pause»"]')!
    expect(play.disabled).toBe(false)
    const img = play.querySelector('img')!
    expect(img.getAttribute('src')).toContain('pause--on-accent')
    unmount()
  })

  it('暂停态：主按钮图标为 play--on-accent', () => {
    setPlayer({ playing: false })
    const { container, unmount } = mount()
    const play = container.querySelector<HTMLButtonElement>('button[aria-label="«player.play»"]')!
    const img = play.querySelector('img')!
    expect(img.getAttribute('src')).toContain('play--on-accent')
    unmount()
  })

  it('点击播放/上一首/下一首调用对应 store 动作', () => {
    const toggleSpy = spyAction('togglePlay')
    const nextSpy = spyAction('next')
    const prevSpy = spyAction('previous')
    const { container, unmount } = mount()
    const play = container.querySelector<HTMLButtonElement>('button[aria-label="«player.pause»"]')!
    const next = container.querySelector<HTMLButtonElement>('button[aria-label="«player.next»"]')!
    const prev = container.querySelector<HTMLButtonElement>('button[aria-label="«player.previous»"]')!
    act(() => { play.click() })
    act(() => { next.click() })
    act(() => { prev.click() })
    expect(toggleSpy).toHaveBeenCalledTimes(1)
    expect(nextSpy).toHaveBeenCalledTimes(1)
    expect(prevSpy).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('点击标题跳专辑详情（/albums/:id）', () => {
    const { container, unmount, getPath } = mountWithLocationProbe(7)
    const title = container.querySelector<HTMLButtonElement>('.player-title')!
    act(() => { title.click() })
    expect(getPath()).toBe('/albums/7')
    unmount()
  })
})

describe('收藏按钮', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack({ favorite: false }), playing: true, duration: 200, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('点击收藏：调用 favorites:set(trackId,true) 并乐观更新 currentTrack.favorite + 图标变 heart--accent', () => {
    const { container, unmount } = mount()
    const fav = container.querySelector<HTMLButtonElement>('button[aria-label="«track.favorite»"]')!
    expect(fav.getAttribute('aria-pressed')).toBe('false')
    act(() => { fav.click() })
    const w = globalThis.window as unknown as { api: { favorites: { set: ReturnType<typeof vi.fn> } } }
    expect(w.api.favorites.set).toHaveBeenCalledWith('t1', true)
    expect(usePlayerStore.getState().currentTrack?.favorite).toBe(true)
    const after = container.querySelector<HTMLButtonElement>('button[aria-label="«track.unfavorite»"]')!
    expect(after.getAttribute('aria-pressed')).toBe('true')
    expect(after.querySelector('img')!.getAttribute('src')).toContain('heart--accent')
    unmount()
  })

  it('已收藏再点击：favorites:set(trackId,false) + 乐观更新为 false', () => {
    setPlayer({ currentTrack: makeTrack({ favorite: true }) })
    const { container, unmount } = mount()
    const fav = container.querySelector<HTMLButtonElement>('button[aria-label="«track.unfavorite»"]')!
    act(() => { fav.click() })
    const w = globalThis.window as unknown as { api: { favorites: { set: ReturnType<typeof vi.fn> } } }
    expect(w.api.favorites.set).toHaveBeenCalledWith('t1', false)
    expect(usePlayerStore.getState().currentTrack?.favorite).toBe(false)
    unmount()
  })
})

describe('进度条 seek 拖动', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack(), playing: true, duration: 200, position: 0, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('pointerdown + 松手(pointerup clientX=50/宽100) → seek(0.5*200=100)', () => {
    const seekSpy = spyAction('seek')
    const { container, unmount } = mount()
    const bar = container.querySelector<HTMLElement>('.progress-bar')!
    mockRect(bar, 100)
    act(() => {
      bar.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, bubbles: true }))
    })
    expect(seekSpy).toHaveBeenCalledWith(100)
    unmount()
  })

  it('aria-valuenow 反映 position/duration', () => {
    setPlayer({ position: 40, duration: 200 })
    const { container, unmount } = mount()
    const bar = container.querySelector<HTMLElement>('.progress-bar')!
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(bar.getAttribute('aria-valuemax')).toBe('200')
    unmount()
  })
})

describe('音量条拖动 + 静音', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack(), playing: true, duration: 200, position: 0, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('音量条 pointerup(clientX=75/宽100) → setVolume(0.75)', () => {
    const volSpy = spyAction('setVolume')
    const { container, unmount } = mount()
    const bar = container.querySelector<HTMLElement>('.volume-bar')!
    mockRect(bar, 100)
    act(() => {
      bar.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true }))
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 75, bubbles: true }))
    })
    expect(volSpy).toHaveBeenCalledWith(0.75)
    unmount()
  })

  it('点击静音按钮调用 toggleMute', () => {
    const muteSpy = spyAction('toggleMute')
    const { container, unmount } = mount()
    const mute = container.querySelector<HTMLButtonElement>('button[aria-label="«player.mute»"]')!
    act(() => { mute.click() })
    expect(muteSpy).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('Repeat 三态循环（off→all→one→off）', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack(), playing: true, duration: 200, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('连点三次依次 setRepeat(all)→(one)→(off)，且 one 态显示「1」角标', () => {
    const repeatSpy = spyWraps('setRepeat')
    const { container, unmount } = mount()
    const repeat = container.querySelector<HTMLButtonElement>('button[aria-label="«player.repeat»"]')!
    act(() => { repeat.click() })
    expect(repeatSpy).toHaveBeenLastCalledWith('all')
    expect(repeat.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.repeat-one-badge')).toBeNull()

    act(() => { repeat.click() })
    expect(repeatSpy).toHaveBeenLastCalledWith('one')
    // aria-label 切换为单曲循环
    const repeat2 = container.querySelector<HTMLButtonElement>('button[aria-label="«player.repeatOne»"]')!
    expect(repeat2.querySelector('.repeat-one-badge')).not.toBeNull()

    act(() => { repeat.click() })
    expect(repeatSpy).toHaveBeenLastCalledWith('off')
    const repeat3 = container.querySelector<HTMLButtonElement>('button[aria-label="«player.repeat»"]')!
    expect(repeat3.getAttribute('aria-pressed')).toBe('false')
    unmount()
  })
})

describe('Shuffle 开关态', () => {
  beforeEach(() => {
    setPlayer({ currentTrack: makeTrack(), playing: true, duration: 200, volume: 0.8, muted: false, playMode: { shuffle: false, repeat: 'off' } })
  })

  it('点击 → setShuffle(true) + aria-pressed=true + is-active 类', () => {
    const shuffleSpy = spyWraps('setShuffle')
    const { container, unmount } = mount()
    const shuffle = container.querySelector<HTMLButtonElement>('button[aria-label="«player.shuffle»"]')!
    act(() => { shuffle.click() })
    expect(shuffleSpy).toHaveBeenCalledWith(true)
    const after = container.querySelector<HTMLButtonElement>('button[aria-label="«player.shuffle»"]')!
    expect(after.getAttribute('aria-pressed')).toBe('true')
    expect(after.classList.contains('is-active')).toBe(true)
    unmount()
  })
})
