/**
 * useQueueView 选择器重渲计数单测（T7.1 承接项，jsdom project）。
 *
 * 背景：QueuePanel 曾用 usePlayer() 订阅整态，只消费 queueView 却随 250ms position
 * 节流刷新（每 tick setState({ position })）整面板重渲。本文件用 React Profiler
 * 计数重渲（countPositionChanges 先例的渲染侧对应物），锚定两件事：
 *   ① 真实 QueuePanel 在连续 position tick 下重渲计数不增长（修复后形态；
 *      变异自检锚点：QueuePanel 改回 usePlayer() 全态订阅 → 计数随 tick 增长 → 红）；
 *   ② 对照组：全态订阅（usePlayer）的探针组件在同一 tick 序列下计数确实增长
 *      （证明 tick 确实会通知订阅者，①不是「tick 没生效」的假绿）。
 * queueView 引用变更（推进/插队）仍会触发重渲——额外一条确认钩子已接线，不是死订阅。
 */
import { Profiler, type ReactElement } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { QueuePanel } from '../components/layout/QueuePanel'
import { mountPage } from '../pages/browseFixtures'
import { usePlayer, usePlayerStore, useQueueView } from './playerStore'
import { useStatsStore } from './statsStore'

function makeTrack(id: string): TrackRow {
  return {
    id,
    title: `T${id}`,
    artistId: 1,
    artistName: 'Artist',
    albumId: 1,
    albumTitle: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: null,
    year: 2020,
    genre: null,
    duration: 100,
    filePath: `/music/${id}.flac`,
    format: 'FLAC',
    bitrate: 1000,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01',
    lastPlayedAt: null,
    favoritedAt: null,
  }
}

/** 探针：按传入的订阅钩子渲染并计数（对照组用 usePlayer，实验组用 useQueueView）。 */
function makeProbe(useHook: () => unknown): { Probe: () => ReactElement | null; count: () => number } {
  let renders = 0
  const Probe = (): ReactElement | null => {
    renders += 1
    useHook()
    return null
  }
  return { Probe, count: () => renders }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // AppShell 夹具同款预置（Sidebar ensureStatsLoaded 幂等短路；本文件不挂 AppShell，
  // 预置仅为与 QueuePanel.test 的 store 状态基线一致）。
  useStatsStore.setState({ stats: { tracks: 0, albums: 0, artists: 0 } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useQueueView 选择器（T7.1 承接：QueuePanel 重渲计数下降）', () => {
  it('真实 QueuePanel：连续 5 次 position tick 重渲计数不增长；queueView 引用变更仍触发重渲', () => {
    const track = makeTrack('t1')
    usePlayerStore.setState({
      queueView: { current: track, upNextUserQueue: [], upNextRest: [] },
    })

    let renders = 0
    const { unmount } = mountPage(
      <Profiler
        id="queue-panel"
        onRender={() => {
          renders += 1
        }}
      >
        {/* open/onClose 最小桩：本文件只关心渲染计数，不测开合（QueuePanel.test 已覆盖） */}
        <QueuePanelShim />
      </Profiler>
    )
    // 挂载批次的初次渲染计入基线。
    const baseline = renders
    expect(baseline).toBeGreaterThan(0)

    // 模拟 250ms position 节流：5 次 setState({ position })，queueView 引用不变。
    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        usePlayerStore.setState({ position: i * 0.25 })
      })
    }
    expect(renders).toBe(baseline) // 修复后形态：tick 不再牵动整面板

    // queueView 引用变更（推进/插队时 computeQueueView 写入新对象）仍触发重渲。
    act(() => {
      usePlayerStore.setState({
        queueView: { current: track, upNextUserQueue: [makeTrack('t2')], upNextRest: [] },
      })
    })
    expect(renders).toBe(baseline + 1)
    unmount()
  })

  it('对照组：usePlayer() 全态订阅在同一 tick 序列下计数增长（证明 tick 会通知订阅者，非假绿）', () => {
    const { Probe, count } = makeProbe(() => usePlayer())
    const { unmount } = mountPage(<Probe />)
    const baseline = count()

    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        usePlayerStore.setState({ position: i * 0.25 })
      })
    }
    expect(count()).toBe(baseline + 5) // 每次位置变更都重渲——正是修复前 QueuePanel 的行为
    unmount()
  })

  it('useQueueView 返回 store 当前 queueView（数据形状不变，QueueView 三段）', () => {
    const track = makeTrack('t1')
    const view = { current: track, upNextUserQueue: [], upNextRest: [] as TrackRow[] }
    usePlayerStore.setState({ queueView: view })

    let captured: unknown
    const Probe = (): ReactElement | null => {
      captured = useQueueView()
      return null
    }
    const { unmount } = mountPage(<Probe />)
    expect(captured).toBe(view) // 引用语义：返回 store 键持有的对象本身
    unmount()
  })
})

/** QueuePanel 最小包装：避免本文件重复 AppShell 挂载链（同 QueuePanel.test 的直挂形态）。 */
function QueuePanelShim(): ReactElement {
  return <QueuePanel open onClose={() => {}} />
}
