import { useEffect, type ReactElement } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useLibrary } from '../stores/libraryStore'
import { TrackList } from '../components/TrackList'

/**
 * PagePlaceholder —— T4.1 各路由的最小页面占位。
 *
 * 页面本体（Hero / 网格 / 轨道表 / 表单）按计划在 T4.3~T4.7 逐个落地；本任务只保证路由结构与
 * 导航真实可用。故占位内**不复刻设计稿的 .page-head 页头**——设计稿每页页头文案（如 Songs 的
 * 「全部歌曲 · 30,000 首曲目」）绑定真实数据，且与顶栏标题并存会造成同一屏两处同名标题；
 * 真实页头随 T4.4 起照稿补入。当前路由的可见标识由 Topbar 的 .eyebrow/.page-title 承担。
 *
 * T4.3 临时验证入口（报告留痕）：
 *   Songs 路由（'/' 的落地页，见 routes.ts DEFAULT_ROUTE）暂时渲染真实 <TrackList>，用于本任务
 *   的真实渲染验证（e2e + 手动核对六态）。T4.4 会用真实 Songs 页替换本分支——届时 TrackList
 *   转由 Songs 页承载，本文件的 Songs 分支整体移除，PagePlaceholder 退回纯占位。
 *   router.tsx / routes.ts 属 T4.1 冻结文件（不改），故入口只能在此处按 pathname 分流。
 */
export function PagePlaceholder(): ReactElement {
  const { t } = useI18n()
  const { pathname, search } = useLocation()
  const library = useLibrary()

  // 首屏取数（store 只在 setSort/setPage/扫描完成后自动 refresh；进入页面需一次显式拉取）。
  useEffect(() => {
    void library.refresh()
  }, [library.refresh])

  if (pathname === '/songs') {
    // T4.3 临时验证钩子（报告留痕，随本分支在 T4.4 一并移除）：真实播放态由 T5.6 的 playerStore
    // 提供，当前无 store 可接线；e2e 以 `#/songs?playing=<id>` 注入 playingTrackId，用于断言
    // 播放行图标走 accent 变体（C1）。非该 query 时行为与原先完全一致。
    const playingTrackId = new URLSearchParams(search).get('playing') ?? undefined
    return (
      <div className="page-wrap tracklist-page">
        <TrackList
          songs={library.songs}
          loading={library.loading}
          error={library.error}
          sortBy={library.params.sortBy}
          order={library.params.order}
          onSortChange={library.setSort}
          playingTrackId={playingTrackId}
        />
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <p className="muted">{t('page.placeholder')}</p>
    </div>
  )
}

export default PagePlaceholder
