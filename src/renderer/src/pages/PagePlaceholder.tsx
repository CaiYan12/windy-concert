import type { ReactElement } from 'react'
import { useI18n } from '../i18n'

/**
 * PagePlaceholder —— T4.1 各路由的最小页面占位。
 *
 * 页面本体（Hero / 网格 / 轨道表 / 表单）按计划在 T4.3~T4.7 逐个落地；本任务只保证路由结构与
 * 导航真实可用。故占位内**不复刻设计稿的 .page-head 页头**——设计稿每页页头文案（如 Songs 的
 * 「全部歌曲 · 30,000 首曲目」）绑定真实数据，且与顶栏标题并存会造成同一屏两处同名标题；
 * 真实页头随 T4.4 起照稿补入。当前路由的可见标识由 Topbar 的 .eyebrow/.page-title 承担。
 */
export function PagePlaceholder(): ReactElement {
  const { t } = useI18n()
  return (
    <div className="page-wrap">
      <p className="muted">{t('page.placeholder')}</p>
    </div>
  )
}

export default PagePlaceholder
