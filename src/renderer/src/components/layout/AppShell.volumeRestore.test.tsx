/**
 * T6.0① AppShell 启动恢复接线单测（jsdom project）——证明「壳层挂载即调 ensureVolumeRestored」。
 *
 * 为什么单独成文件：AppShell 挂载会触发单例 playerStore 的 ensureVolumeRestored（幂等守卫
 * volumeRestored 一旦置位，同一模块实例内不再请求 settings:get）。聚焦点单测（同目录
 * AppShell.queueFocus.test.tsx）也会挂 AppShell；vitest 按文件隔离模块图，分文件保证本用例
 * 拿到「未被消费过的守卫」，断言 `settings.get` 恰好一次才有效。
 *
 * 形态（同 QueuePanel.test.tsx 的 AppShell 夹具）：
 *   · browseFixtures 提供 window.api 桩 + 哨兵 i18n + mountPage；
 *   · 覆盖 window.api.settings.get 为可断言 mock（返回预置 volume/muted）；
 *   · 预置 stats 非 null，令 Sidebar 的 ensureStatsLoaded 幂等短路（避免异步 refresh 的 act 告警）；
 *   · StrictMode 包裹：验证开发态 effect 双调用下 settings.get 只被请求一次（既有幂等守卫）。
 *
 * 变异锚点：删除 AppShell 内 `void usePlayerStore.getState().ensureVolumeRestored()` → 本用例红
 *   （volume 停在默认 0.8，getSpy 零调用）。
 */
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Settings } from '../../../../shared/types'
import { installSentinelI18n, flushBrowse, mountPage } from '../../pages/browseFixtures'
import { usePlayerStore } from '../../stores/playerStore'
import { useStatsStore } from '../../stores/statsStore'
import { AppShell } from './AppShell'

/** 单例初始快照（replace 复位基线；含真实动作闭包）。 */
const INITIAL_STATE = usePlayerStore.getState()

/** 覆盖 window.api.settings.get 为可断言 mock（返回预置设置），返回 spy。 */
function installSettingsGet(settings: Settings): ReturnType<typeof vi.fn> {
  const get = vi.fn().mockResolvedValue(settings)
  const w = globalThis.window as unknown as { api: Record<string, unknown> }
  w.api.settings = { get, set: vi.fn() }
  return get
}

function mountShellStrict(): { container: HTMLElement; unmount: () => void } {
  const router = createMemoryRouter([{ path: '/', element: <AppShell /> }])
  return mountPage(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  installSentinelI18n()
  useStatsStore.setState({ stats: { tracks: 0, albums: 0, artists: 0 } })
  usePlayerStore.setState(INITIAL_STATE, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('T6.0① AppShell 挂载 → ensureVolumeRestored（音量/静音持久化读回）', () => {
  it('挂载后从 settings:get 恢复 volume/muted 到 store；StrictMode 双调用只请求一次', async () => {
    const getSpy = installSettingsGet({
      language: 'zh-CN',
      autoScanOnStartup: true,
      volume: 0.35,
      muted: true
    })

    const { unmount } = mountShellStrict()
    // 冲刷 ensureVolumeRestored 的异步取数链（settings:get → setState），act 包裹避免告警
    await flushBrowse()

    expect(usePlayerStore.getState().volume).toBe(0.35)
    expect(usePlayerStore.getState().muted).toBe(true) // muted 一并恢复
    expect(getSpy).toHaveBeenCalledTimes(1) // 幂等：StrictMode 双 effect 不重复请求 settings:get
    unmount()
  })
})
