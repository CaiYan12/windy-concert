import { useState, type ReactElement } from 'react'
import { Outlet } from 'react-router-dom'
import { useI18n } from '../../i18n'
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
 */
export function AppShell(): ReactElement {
  const { t } = useI18n()
  // T5.5 队列面板开合 UI 态：局部 useState 即可（不进全局 store——开合纯壳层视觉态，
  // 无跨页语义；PlayerBar onToggleQueue 切换、面板头部 x 关闭）。
  // 状态类挂 .app-shell 祖先而非 .queue-panel 本体：设计稿选择器为 `.queue-open .queue-panel`
  // （mockup.css:1682-1684），shell.css 逐字沿用——任务原文「类挂 .queue-panel」与设计稿
  // 冲突处从设计稿，留痕。
  const [queueOpen, setQueueOpen] = useState(false)
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
        <PlayerBar onToggleQueue={() => setQueueOpen((o) => !o)} />
      </section>
      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  )
}

export default AppShell
