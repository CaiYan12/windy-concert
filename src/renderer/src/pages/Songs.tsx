import { useEffect, type ReactElement } from 'react'
import { useI18n } from '../i18n'
import { useLibrary } from '../stores/libraryStore'
import { TrackList } from '../components/TrackList'

/**
 * Songs 页（T4.4）——用真实页面替换 PagePlaceholder 的 Songs 分支。
 *
 * 接线（沿用 T4.2 libraryStore 既有模式）：
 *   · useLibrary() 取列表 + 分页/排序参数；首屏经 refresh() 取数（setSort 内部自动 refresh）。
 *   · onSortChange 直接接 libraryStore.setSort（§3.7 七键排序白名单 → 自动重取）。
 *   · TrackList 纯展示，playingTrackId 当前无 playerStore 不注入（T5.6 接通）。
 *
 * 页头（对照 mockups/Songs.html）：标题绑定真实字段，但**总数不渲染**——
 * library:listSongs 是服务端分页（默认 limit 50、clamp 上界 200），songs.length 是
 * 当前页长度而非总数（T4.2 已核查无 songsCount 通道），用页长冒充总数即回归假数据
 * （违反 T4.1「不渲染假数据」）。故只渲染「全部歌曲」标题，不附计数。计数通道（library:getStats
 * 或 listSongs 返回 {items,total}）待 Phase 4 后补，届时再补总数行（计划 T4.2 备注已留痕）。
 *
 * 页脚翻页（T4.9，接 libraryStore.setPage）：设计稿 mockups/Songs.html 无分页区（grep
 * pagination/翻页零命中），最小形态自定——「‹（上一页）第 N 页（下一页）›」，按钮可见内容
 * 为箭头字形、语义名走 aria-label（i18n 键 songs.pagination.*）。硬约束「禁假总数」：
 *   · 不渲染「共 M 条 / 共 X 页」（总数通道缺失）；
 *   · 页码 N = offset / limit + 1；
 *   · 末页判定 = 当页行数 < limit 时禁用「下一页」；首页（offset=0）禁用「上一页」。
 * 渲染门槛：加载/错误态不渲染；首页空态（offset=0 且无行）不渲染。唯一放宽：offset>0 的
 * 「越界空页」（总数恰为 limit 整数倍时点下一页会落空）仍渲染控件——否则翻页 UI 随空页
 * 消失、空态文案「还没有歌曲」误导，用户失去「上一页」退路（功能性死路）。
 */
export function Songs(): ReactElement {
  const { t } = useI18n()
  const library = useLibrary()

  useEffect(() => {
    void library.refresh()
  }, [library.refresh])

  const { offset, limit } = library.params
  const rowCount = library.songs.length
  const canPrev = offset > 0
  // 禁假总数：行数 < limit 即视为末页（可能漏判「总数恰为 limit 整数倍」的末页，
  // 点下一页落空页——由上方越界空页放宽兜底退路）。
  const canNext = rowCount >= limit
  const page = Math.floor(offset / limit) + 1
  const showPagination =
    !library.loading && !library.error && (rowCount > 0 || offset > 0)

  const goPrev = (): void => library.setPage(Math.max(0, offset - limit), limit)
  const goNext = (): void => library.setPage(offset + limit, limit)

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <h2>{t('songs.heading')}</h2>
      </div>
      <TrackList
        songs={library.songs}
        loading={library.loading}
        error={library.error}
        sortBy={library.params.sortBy}
        order={library.params.order}
        onSortChange={library.setSort}
      />
      {showPagination && (
        <nav className="songs-pagination" aria-label={t('songs.pagination.label')}>
          <button
            type="button"
            className="songs-pagination-button"
            aria-label={t('songs.pagination.prev')}
            disabled={!canPrev}
            onClick={goPrev}
          >
            ‹
          </button>
          <span className="songs-pagination-page">{t('songs.pagination.page', { page })}</span>
          <button
            type="button"
            className="songs-pagination-button"
            aria-label={t('songs.pagination.next')}
            disabled={!canNext}
            onClick={goNext}
          >
            ›
          </button>
        </nav>
      )}
    </div>
  )
}

export default Songs
