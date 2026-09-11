import type { ReactElement } from 'react'
import { useMatches } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { DEFAULT_ROUTE } from '../../routes'
import type { RouteHandle } from '../../router'
import { Icon } from '../Icon'
import { SearchBox } from '../SearchBox'

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
 * 搜索框（T4.5 改动留痕）：T4.1 的静态外观骨架（readOnly input + 占位注释）替换为真
 * <SearchBox /> 组件（debounce 200ms / 下拉分组预览 / 键盘可达，见 components/SearchBox.tsx）。
 * 本文件其余部分（标题锁定区、更多选项按钮）未动。
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
        <SearchBox />
        <button className="icon-button" type="button" aria-label={t('topbar.moreOptions')} disabled>
          <Icon name="more-horizontal" />
        </button>
      </div>
    </header>
  )
}

export default Topbar
