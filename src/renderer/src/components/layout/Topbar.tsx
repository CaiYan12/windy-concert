import type { ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { DEFAULT_ROUTE, matchRoute } from '../../routes'
import { Icon } from '../Icon'

/**
 * Topbar —— 顶栏（T4.1）。对照 mockups/Songs.html:45-58 与 mockup.css:314-391。
 * 标题随路由变化：由 matchRoute(pathname) 取 i18n key；'/' 与未知路径回退落地页 Songs
 * （与 router 的重定向目标一致，避免重定向那一帧出现空标题）。
 *
 * 搜索框为静态外观：输入/下拉/debounce 属 T4.5；此处不接任何状态与副作用。
 * 顶栏「更多选项」按钮的菜单属后续任务，占位期 disabled。
 */
export function Topbar(): ReactElement {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const route = matchRoute(pathname) ?? DEFAULT_ROUTE

  return (
    <header className="topbar">
      <div className="title-lockup">
        <span className="eyebrow">{t(route.eyebrowKey)}</span>
        <h1 className="page-title">{t(route.titleKey)}</h1>
      </div>
      <div className="topbar-tools">
        <label className="search-box">
          <Icon name="search" />
          {/* 静态外观：可聚焦/可输入，但无受控状态、无 debounce、无 Ctrl K 绑定——全部属 T4.5。
              aria-label 落在 input 上（label 元素自身不是命名目标），与 mockup 的 label 包裹结构一致。 */}
          <input
            type="search"
            placeholder={t('search.placeholder')}
            aria-label={t('search.ariaLabel')}
          />
          <kbd>{t('search.shortcut')}</kbd>
        </label>
        <button className="icon-button" type="button" aria-label={t('topbar.moreOptions')} disabled>
          <Icon name="more-horizontal" />
        </button>
      </div>
    </header>
  )
}

export default Topbar
