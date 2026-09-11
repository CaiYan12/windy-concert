/**
 * Toast 单测（jsdom project，T5.6）。
 *
 * 覆盖：toast store 自身状态改写 + ToastHost 渲染（role="alert" / 单例不堆叠）+ 自动消失
 * （~3s，fake timers 可测）+ 中途被新提示覆盖重置计时 + hideToast 取消待发定时器。
 *
 * 形态：不引 @testing-library，react-dom/client + act 最小挂载；定时器用 vi.useFakeTimers。
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useI18nStore } from '../i18n'
import { TOAST_AUTO_DISMISS_MS, ToastHost } from './Toast'
import { useToastStore as store } from '../stores/toastStore'

beforeEach(() => {
  useI18nStore.setState({ messages: { 'player.unsupportedFormat': 'M0.1 暂不支持此格式播放' }, loaded: true, language: 'zh-CN' })
  store.setState({ message: null })
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  vi.useRealTimers()
})

function mountHost(): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<ToastHost />)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

describe('toastStore 状态改写（纯逻辑）', () => {
  it('showToast 覆盖 message；hideToast 清空', () => {
    store.getState().showToast('A')
    expect(store.getState().message).toBe('A')
    store.getState().showToast('B')
    expect(store.getState().message).toBe('B') // 单例替换不堆叠
    store.getState().hideToast()
    expect(store.getState().message).toBeNull()
  })
})

describe('ToastHost 渲染与自动消失（fake timers）', () => {
  beforeEach(() => vi.useFakeTimers())

  it('showToast 后渲染 role="alert" 且显示文案；到达时长自动 hideToast', () => {
    const { container, unmount } = mountHost()
    act(() => {
      store.getState().showToast('M0.1 暂不支持此格式播放')
    })
    const alert = container.querySelector<HTMLElement>('.toast[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert!.classList.contains('is-hidden')).toBe(false)
    expect(alert!.textContent).toContain('M0.1 暂不支持此格式播放')

    // fake timers：到达自动消失时长 → hideToast 清空 message，节点回到 .is-hidden。
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS)
    })
    const after = container.querySelector<HTMLElement>('.toast')
    expect(after!.classList.contains('is-hidden')).toBe(true)
    expect(after!.textContent).toBe('')
    unmount()
  })

  it('中途被新提示覆盖 → 重置计时（旧定时被清，提示展示满 3s）', () => {
    const { container, unmount } = mountHost()
    act(() => {
      store.getState().showToast('first')
    })
    // 1.5s 后覆盖为新提示
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS / 2)
    })
    act(() => {
      store.getState().showToast('second')
    })
    // 旧定时器（距 first 仅 1.5s）不应让「first」消失：此刻已换 second
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS / 2)
    })
    const mid = container.querySelector<HTMLElement>('.toast')
    expect(mid!.classList.contains('is-hidden')).toBe(false)
    expect(mid!.textContent).toContain('second')

    // 再走满 3s（自 second 起）→ 才消失
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS / 2)
    })
    const done = container.querySelector<HTMLElement>('.toast')
    expect(done!.classList.contains('is-hidden')).toBe(true)
    unmount()
  })

  it('hideToast 取消待发定时器（不泄漏/不误消后续提示）', () => {
    const { container, unmount } = mountHost()
    act(() => {
      store.getState().showToast('temp')
    })
    act(() => {
      store.getState().hideToast()
    })
    // 即便走满时长也不再有任何副作用（message 已为 null，定时器已清）
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS + 1000)
    })
    expect(store.getState().message).toBeNull()
    // 重新 show 一条，仍正常计时消失（证明 hideToast 清的是旧定时器而非全局失效）
    act(() => {
      store.getState().showToast('again')
    })
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS)
    })
    expect(container.querySelector<HTMLElement>('.toast')!.classList.contains('is-hidden')).toBe(true)
    unmount()
  })
})
