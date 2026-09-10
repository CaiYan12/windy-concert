import type { ReactElement } from 'react'
import { useMatches } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { DEFAULT_ROUTE } from '../../routes'
import type { RouteHandle } from '../../router'
import { Icon } from '../Icon'

/**
 * Topbar —— 顶栏（T4.1）。对照 mockups/Songs.html:45-58 与 mockup.css:314-391。
 *
 * 标题随路由变化：从 useMatches() 命中的 RouteObject.handle 取 i18n key（router.tsx 注册）。
 * '#' 根路径（index 重定向那一帧）与未知路径（`*` 兜底）没有 handle → 回退落地页 Songs
 * （与 router 的重定向目标一致，避免重定向帧出现空标题）。
 *
 * 单一匹配器（I2 评审留痕）：此前用自实现的 matchRoute(pathname) 平行匹配，语义（大小写敏感）
 * 与 react-router（默认 caseSensitive:false）不一致，`#/Albums` 会侧栏高亮「专辑」而顶栏「歌曲」。
 * 改读 handle 后，路径匹配完全交给 react-router，天然一致，不再可能漂移。
 *
 * 搜索框为静态外观：输入/下拉/debounce 属 T4.5；此处不接任何状态与副作用。
 * 顶栏「更多选项」按钮的菜单属后续任务，占位期 disabled。
 */
export function Topbar(): ReactElement {
  const { t } = useI18n()
  const matches = useMatches()
  // 取最深的带 handle 匹配（页面子路由）；根布局路由无 handle。
  const handle = [...matches]
    .reverse()
    .map((match) => match.handle as RouteHandle | undefined)
    .find((h): h is RouteHandle => Boolean(h))
  const route = handle ?? DEFAULT_ROUTE

  return (
    <header className="topbar">
      <div className="title-lockup">
        <span className="eyebrow">{t(route.eyebrowKey)}</span>
        <h1 className="page-title">{t(route.titleKey)}</h1>
      </div>
      <div className="topbar-tools">
        <label className="search-box">
          <Icon name="search" />
          {/* 静态外观：可聚焦（Ctrl K / 焦点样式在 T4.5 接线），但 readOnly——占位期不接受控状态，
              若可输入却无任何响应属误导（T4.1 评审 M4）。aria-label 落在 input 上（label 元素自身
              不是命名目标），与 mockup 的 label 包裹结构一致。 */}
          <input
            type="search"
            placeholder={t('search.placeholder')}
            aria-label={t('search.ariaLabel')}
            readOnly
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
