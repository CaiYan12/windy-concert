import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Outlet } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { usePlayerStore } from '../../stores/playerStore'
import { PlayerBar } from './PlayerBar'
import { QueuePanel } from './QueuePanel'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/**
 * AppShell —— 应用壳层（T4.1）。逐元素对照 docs/design/mockups/Songs.html 的 .app-shell 层。
 *
 * 几何（mockup.css:132-146 / 306-312）：
 *   .app-shell  grid-template-columns: var(--sidebar-w) minmax(0, 1fr)（Sidebar 232 + 主区可收缩）
 *   .app-frame  grid-template-rows: var(--topbar-h) minmax(0,1fr) var(--playerbar-h)（顶栏 56 / 主区 / 播放栏 72）
 *   .queue-panel / .skip-link 为 fixed 定位，脱离 grid 流（故 grid 的两个在流子项 = Sidebar + .app-frame）。
 *
 * skip-link 置于 .app-shell 首个子节点（设计稿中它是 body 直接子节点）；因 position: fixed 不参与
 * grid 布局，位置等价而 React 树更聚合。
 *
 * C1（T4.1 评审）：hash 路由下 `href="#main-content"` 会被当作路由跳转——点击后 location.hash 变为
 *   `#main-content`，react-router 读到 path `main-content`，未命中任何路由 → `*` 兜底 Navigate 回
 *   落地页 Songs。任何非 Songs 页激活「跳到主要内容」都会被弹回 Songs。
 *   修法：保留 href 语义（可访问性 / 无 JS 降级），但 onClick preventDefault 阻断 hash 变更，
 *   改为把焦点程序化移交给 <main id="main-content" tabIndex={-1}>（tabIndex=-1 使其可编程聚焦）。
 *
 * T6.0（Phase 6 前置小包）：① 挂载 effect 调 ensureVolumeRestored（音量/静音持久化读回）；
 *   ③ 队列面板关闭后焦点回落触发按钮（计划 903 行验收项）。落位与取舍见组件体内注释。
 */
export function AppShell(): ReactElement {
  const { t } = useI18n()
  // T5.5 队列面板开合 UI 态：局部 useState 即可（不进全局 store——开合纯壳层视觉态，
  // 无跨页语义；PlayerBar onToggleQueue 切换、面板头部 x 关闭）。
  // 状态类挂 .app-shell 祖先而非 .queue-panel 本体：设计稿选择器为 `.queue-open .queue-panel`
  // （mockup.css:1682-1684），shell.css 逐字沿用——任务原文「类挂 .queue-panel」与设计稿
  // 冲突处从设计稿，留痕。
  const [queueOpen, setQueueOpen] = useState(false)

  // T6.0③ 焦点回落：记录队列钮触发元素，面板经头部 x 关闭后把焦点还给它（计划 903 行验收项）。
  // 取舍：入参触发元素而非 AppShell 侧查 DOM/ref 透传——PlayerBar 的 onClick 天然持有
  // e.currentTarget（最小改动、零 DOM 查询、对按钮节点身份无假设）。
  const queueTriggerRef = useRef<HTMLElement | null>(null)

  // T6.0① 启动恢复音量/静音：AppShell 挂载 effect 调一次（同 Sidebar ensureStatsLoaded 形态）。
  // 落位取舍：App.tsx 按 T4.1 定位为纯路由出口（不持业务副作用），AppShell 为承载 PlayerBar/
  // QueuePanel 的播放域壳层且全生命周期只挂载一次；ensureVolumeRestored 自身幂等（await 前置位），
  // StrictMode 开发态 effect 双调用不重复请求 settings:get。
  useEffect(() => {
    void usePlayerStore.getState().ensureVolumeRestored()
  }, [])

  /** 关闭队列面板：置关 + 焦点回落触发按钮（无触发记录时 no-op，如程序化初次关闭）。 */
  const closeQueue = (): void => {
    setQueueOpen(false)
    queueTriggerRef.current?.focus()
  }

  return (
    <div className={`app-shell${queueOpen ? ' queue-open' : ''}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        {t('a11y.skipToContent')}
      </a>
      <Sidebar />
      <section className="app-frame">
        <Topbar />
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <PlayerBar
          onToggleQueue={(trigger) => {
            queueTriggerRef.current = trigger // T6.0③：记录触发元素供关闭时回落焦点
            setQueueOpen((o) => !o)
          }}
        />
      </section>
      <QueuePanel open={queueOpen} onClose={closeQueue} />
    </div>
  )
}

export default AppShell
