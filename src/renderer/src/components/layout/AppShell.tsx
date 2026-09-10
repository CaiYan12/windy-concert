import type { ReactElement } from 'react'
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
 */
export function AppShell(): ReactElement {
  const { t } = useI18n()
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('a11y.skipToContent')}
      </a>
      <Sidebar />
      <section className="app-frame">
        <Topbar />
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <PlayerBar />
      </section>
      <QueuePanel />
    </div>
  )
}

export default AppShell
