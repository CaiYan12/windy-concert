import { useMemo, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../ipc/client'
import { useI18n } from '../i18n'
import { formatRelative, parsePlayedAt } from '../i18n/formatRelative'
import { formatDuration } from '../components/trackListUtils'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { useBrowseData } from './useBrowseData'

/**
 * Recent 页（T6.5）——最近播放（对照 mockups/Recent.html）。
 *
 * 数据：`history:listRecent`（repo 侧 §2 口径去重：每曲仅取 MAX(id) 的最新一条，按
 * played_at DESC 排序，T1.3 修复后不受同秒并列影响）。F7-2「同一曲只占一行、时间为
 * 最新」由该 SQL 语义直接保证，页面只做呈现。
 *
 * limit 取值留痕：计划未定义条数，取 RECENT_LIMIT = 100（一屏可滚动的合理上限；
 * 设计稿副标题的「最近 30 天」时间窗 repo 无对应参数，未实现——呈现文案改为
 * 「按最新一次播放去重 · 最多显示 {count} 条」，如实告知，不给假承诺）。
 *
 * 列表形态取舍留痕：**轻量列表自绘**（.track-table--recent），不复用 TrackList——
 * TrackList 是固定十列的 §3.7 表（无「播放时间」列，也不支持列子集；SearchResults 的
 * compact 行是自建组件先例），为一张表给 TrackList 加列裁剪能力超出本任务范围。
 * 计划对 Recent 行的点击/双击行为未定义 → **只读展示**：无双击播放、无右键菜单、
 * 无行内 ♡ 切换（末列心形仅按行数据 favorite 只读呈现收藏态）。
 *
 * 时间列：formatRelative（i18n 工具模块，now 注入本渲染批次共享一个基准，避免
 * 同屏各行时刻漂移）+ parsePlayedAt（SQLite datetime('now') 为 UTC 形态，显式按
 * UTC 解析，详见 formatRelative.ts 头注）。
 */
export const RECENT_LIMIT = 100

export function Recent(): ReactElement {
  const { t } = useI18n()
  const { data, loading, error } = useBrowseData(
    () => api.history.listRecent(RECENT_LIMIT),
    []
  )
  const rows = data ?? []
  // now 以取数完成批次为基准（rows 引用变化时刷新），同屏各行共享同一「当前时刻」。
  const now = useMemo(() => new Date(), [data])

  if (loading) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state">
          <div className="browse-state-title">{t('songs.loading')}</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page-wrap browse-page">
        <div className="browse-state" role="status">
          <div className="browse-state-title">{t('songs.error')}</div>
          <div className="browse-state-hint">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap browse-page recent-page">
      <div className="page-head">
        <div>
          <h2>{t('nav.recent')}</h2>
          {/* 设计稿副行为「按最新一次播放去重 · 最近 30 天」；30 天窗口未实现（repo 无时间
              参数，见头注留痕），文案如实改为条数上限。 */}
          <p>{t('recent.subtitle', { count: RECENT_LIMIT })}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="browse-state recent-empty" role="status">
          <Icon name="history" size={24} className="recent-empty-icon" />
          <div className="browse-state-title">{t('empty.recent.title')}</div>
          <div className="browse-state-hint">{t('empty.recent.hint')}</div>
          <Link to="/songs" className="button button--primary">
            {t('empty.recent.action')}
          </Link>
        </div>
      ) : (
        <div
          className="track-table track-table--recent"
          role="table"
          aria-label={t('recent.tableLabel')}
          aria-rowcount={rows.length}
        >
          {/* 表头六列对照 mockups/Recent.html：封面 / 标题 / 艺术家 / 专辑 / 播放时间 / 状态 */}
          <div className="track-row track-row--head" role="row">
            <div className="track-cell track-cell--cover" role="columnheader">
              <span className="sr-only">{t('songs.column.cover')}</span>
            </div>
            <div className="track-cell" role="columnheader">
              {t('songs.column.title')}
            </div>
            <div className="track-cell" role="columnheader">
              {t('songs.column.artist')}
            </div>
            <div className="track-cell" role="columnheader">
              {t('songs.column.album')}
            </div>
            <div className="track-cell duration numeric" role="columnheader">
              {t('recent.column.playedAt')}
            </div>
            <div className="track-cell" role="columnheader">
              <span className="sr-only">{t('songs.column.status')}</span>
            </div>
          </div>
          {rows.map((track) => {
            const played = parsePlayedAt(track.lastPlayedAt)
            const favoriteLabel = t(track.favorite ? 'track.unfavorite' : 'track.favorite')
            return (
              <div className="track-row" role="row" key={track.id}>
                <div className="track-cell track-cell--cover" role="cell">
                  <Cover coverId={track.coverId} size={64} className="cover--table" />
                </div>
                <div className="track-cell" role="cell">
                  <div className="track-title" title={track.title}>
                    {track.title}
                  </div>
                  <div className="track-subtitle">{formatDuration(track.duration)}</div>
                </div>
                <div className="track-cell track-subtitle" role="cell">
                  {track.artistName || '—'}
                </div>
                <div className="track-cell track-subtitle" role="cell">
                  {track.albumTitle || '—'}
                </div>
                {/* 播放时间（相对格式，最新在前由服务端排序保证；此处按行数据只读呈现） */}
                <div className="track-cell duration numeric" role="cell" data-field="played-at">
                  {played
                    ? formatRelative(track.lastPlayedAt, now, t)
                    : t('recent.time.unknown')}
                </div>
                <div className="track-cell track-status" role="cell">
                  {/* 只读收藏态标识（计划未定义 Recent 行交互，不做切换） */}
                  <span className="track-status-mark" title={favoriteLabel}>
                    <Icon
                      name={track.favorite ? 'heart--accent' : 'heart'}
                      size={16}
                      alt={favoriteLabel}
                    />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Recent
