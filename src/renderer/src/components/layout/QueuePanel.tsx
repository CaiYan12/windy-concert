import type { ReactElement } from 'react'
import { useI18n } from '../../i18n'
import { Icon } from '../Icon'

/**
 * QueuePanel —— 播放队列面板占位（T4.1，结构对照 mockups/Songs.html:227-234 / mockup.css:1665-1763）。
 *
 * 占位约定：
 *   · 常驻 DOM 但处于**关闭位**（shell.css 的 transform: translateX(100%)），开启动画与开合状态
 *     属 T5.5；T4.1 不提供开合入口，故对 AT 标记 aria-hidden（无可见内容，避免宣读空区域）；
 *   · 0.1 只读：不渲染任何编辑 affordance（拖拽手柄/删除/重排），符合 notes.md §8 与 design-plan
 *     的 M0.1 队列边界；
 *   · 无队列数据 → 渲染空态文案（queue.empty），不渲染假队列行。
 */
export function QueuePanel(): ReactElement {
  const { t } = useI18n()
  return (
    <aside className="queue-panel" aria-label={t('queue.title')} aria-hidden="true">
      <div className="queue-head">
        <h2>{t('queue.title')}</h2>
        <button className="icon-button" type="button" aria-label={t('queue.close')} disabled>
          <Icon name="x" />
        </button>
      </div>
      <div className="queue-scroll">
        <p className="muted">{t('queue.empty')}</p>
      </div>
    </aside>
  )
}

export default QueuePanel
