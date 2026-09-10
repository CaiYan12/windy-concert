import type { ReactElement } from 'react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { NAV_ITEMS } from '../../routes'
import { Icon } from '../Icon'

/**
 * 侧栏七项（顺序 = design-plan §4.1 侧栏结构：歌曲/专辑/艺术家/歌单/喜欢的音乐/最近播放/设置）。
 * 不再单独维护：由 routes.ts 的 ROUTE_DEFS 带 nav 的条目派生（唯一源），labelKey 即该路由的 titleKey。
 * 图标映射对照 docs/design/icons.md 与 mockup.css：music-2 / disc-3 / mic-2 / library / heart / history / settings。
 * （T4.1 评审 I1：此前 NAV_ITEMS 与 ROUTE_DEFS 二处维护、7 组 labelKey/titleKey 完全重复，无测试守护。）
 */

export interface SidebarProps {
  /**
   * 歌曲总数徽标（.nav-badge）。
   * T4.1 无数据源，未传入时**不渲染**徽标节点——避免把设计稿样本值（30,000）写成假数据；
   * T4.2 接入 libraryStore 后由 AppShell 传入真实 count，届时徽标自然出现。
   */
  songsCount?: number
}

/**
 * Sidebar —— 侧栏（T4.1）。逐元素对照 mockups/Songs.html:13-42 与 mockup.css:138-304。
 * 活跃态：NavLink 自动输出 aria-current="page"，样式由 .nav-link[aria-current="page"] 驱动
 * （mockup.css:217-243，含 ::before 左侧 3px --accent 指示条，无底色高亮）。
 */
export function Sidebar({ songsCount }: SidebarProps): ReactElement {
  const { t } = useI18n()
  return (
    <aside className="sidebar" aria-label={t('nav.ariaMain')}>
      <div className="brand-lockup">
        <div className="brand-mark">
          {/* 设计稿 brand-mark 图标为 17px（mockup.css:165-170）；Icon 尺寸档仅 12|15|16|20|24，
              取最接近的 16（1px 差异，T4.1 报告留痕）。opacity .92 由 shell.css 提供。 */}
          <Icon name="music-2" size={16} />
        </div>
        <div>
          <div className="brand-name">{t('app.name')}</div>
          <div className="brand-subtitle">{t('brand.subtitle')}</div>
        </div>
      </div>

      <nav aria-label={t('nav.ariaLibrary')}>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink className="nav-link" to={item.to}>
                <Icon name={item.icon} />
                <span>{t(item.labelKey)}</span>
                {item.to === '/songs' && songsCount !== undefined ? (
                  <span className="nav-badge">{songsCount.toLocaleString('zh-CN')}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-divider" />

      <div className="sidebar-section-head">
        <span>{t('nav.myPlaylists')}</span>
        {/* 新建歌单入口：T6.1 接线，占位期 disabled（避免无功能按钮误导）。 */}
        <button type="button" aria-label={t('nav.playlists.new')} disabled>
          <Icon name="plus" />
        </button>
      </div>

      <div className="playlist-scroll">
        {/* 歌单列表 T6 接入：占位期渲染空列表（不渲染假歌单）。 */}
        <ul className="playlist-list" />
      </div>
    </aside>
  )
}

export default Sidebar
