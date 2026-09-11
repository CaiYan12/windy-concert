/**
 * T6.0③ QueuePanel 关闭焦点回落单测（jsdom project，计划 903 行验收项）。
 *
 * 断言形态照 T4.3 TrackList.focus.test 的「真实链路 + document.activeElement」：
 *   播放栏队列钮 click（AppShell 记录触发元素）→ 面板开 → 面板头部 x click →
 *   closeQueue 置关并 queueTriggerRef.current.focus() → 焦点回到队列钮。
 *
 * 有牙性（变异锚点）：jsdom 的程序化 `.click()` 不移动焦点（activeElement 停在 body），
 *   故若不执行生产 AppShell 的 closeQueue → trigger.focus()，activeElement 必为 body → 本用例红。
 *
 * 隔离说明：本文件也挂载 AppShell（触发 ① 的 ensureVolumeRestored），但不涉及音量断言；
 *   模块级隔离保证其幂等守卫不与 AppShell.volumeRestore.test 串扰。
 */
import { act } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installSentinelI18n, mountPage } from '../../pages/browseFixtures'
import { makeTrack } from '../../player/playerStubs'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import { AppShell } from './AppShell'

const INITIAL_STATE = usePlayerStore.getState()

function mountShell(): { container: HTMLElement; unmount: () => void } {
  const router = createMemoryRouter([{ path: '/', element: <AppShell /> }])
  return mountPage(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  installSentinelI18n()
  // 预置 stats（非 null）：Sidebar ensureStatsLoaded 幂等短路，规避异步 refresh 的 act 告警。
  useStatsStore.setState({ stats: { tracks: 0, albums: 0, artists: 0 } })
  // 预置 benign settings 桩：避免 ensureVolumeRestored 走进「settings.get 非函数」的 throw 分支。
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.settings = {
    get: vi.fn().mockResolvedValue({ language: 'zh-CN', autoScanOnStartup: true, volume: 0.8, muted: false }),
    set: vi.fn()
  }
  usePlayerStore.setState(INITIAL_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('T6.0③ 关闭队列面板 → 焦点回落触发按钮', () => {
  it('队列钮开 → 面板 x 关 → document.activeElement === 队列钮', () => {
    usePlayerStore.setState({ currentTrack: makeTrack('t1') }) // 空队列下队列钮 disabled
    const { container, unmount } = mountShell()

    const shell = container.querySelector('.app-shell') as HTMLElement
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="«queue.open»"]')!
    expect(toggle.disabled).toBe(false)

    act(() => {
      toggle.click()
    })
    expect(shell.classList.contains('queue-open')).toBe(true)

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="«queue.close»"]')!
    act(() => {
      close.click()
    })
    expect(shell.classList.contains('queue-open')).toBe(false)

    // 核心断言：焦点回到触发按钮（生产 closeQueue 的 trigger.focus() 完成；删除即红）
    expect(document.activeElement).toBe(toggle)
    unmount()
  })
})
