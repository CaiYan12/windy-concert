import { useEffect, type ReactElement } from 'react'
import { Icon } from './Icon'
import { useToast } from '../stores/toastStore'

/** 自动消失时长（计划 T5.6：toast ~3s 自动消失；fake timers 可测）。 */
export const TOAST_AUTO_DISMISS_MS = 3000

/**
 * ToastHost —— 全局轻量通知宿主（T5.6）。
 *
 * 设计留痕：
 *   · 单例替换不堆叠：store 只持有一条 message，新提示覆盖旧提示；ToastHost 始终渲染同一
 *     个 .toast 节点（message 为空时挂 .is-hidden 由 CSS 隐藏，避免频繁卸载/挂载丢动画）。
 *   · 无障碍：role="alert"（断言性实时区域），screen reader 即时播报。
 *   · 自动消失：message 非空即起 ~3s 定时器调 hideToast；message 变化（含被新提示覆盖）重置
 *     定时器——保证「最后一条提示」也能展示满 3s。定时器用 setTimeout 便于单测 fake timers。
 *   · 单测锚点：Toast.test.tsx 用 fake timers 验证「到达时长自动 hideToast」「中途被新提示
 *     覆盖重置计时」「hideToast 取消待发定时器」。
 */
export function ToastHost(): ReactElement {
  const { message, hideToast } = useToast()

  useEffect(() => {
    if (message == null) return
    const timer = setTimeout(() => hideToast(), TOAST_AUTO_DISMISS_MS)
    // message 变化或卸载时清掉上一个定时器（避免旧提示提前消失 / 泄漏）。
    return () => clearTimeout(timer)
  }, [message, hideToast])

  return (
    <div className="toast-stack" aria-live="assertive">
      <div
        className={message == null ? 'toast is-hidden' : 'toast'}
        role="alert"
        // message 为空时 aria-hidden 避免空节点被读（CSS 已 .is-hidden 隐藏）。
        aria-hidden={message == null || undefined}
      >
        <Icon name="ban" size={20} className="toast-icon" alt="" />
        <div className="toast-copy">
          <span className="toast-label">{message ?? ''}</span>
        </div>
      </div>
    </div>
  )
}

export default ToastHost
