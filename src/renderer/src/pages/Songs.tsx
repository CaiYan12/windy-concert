import { useEffect, type ReactElement } from 'react'
import type { SortKey, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { useLibrary } from '../stores/libraryStore'
import { usePlayerStore, usePlayingTrackId } from '../stores/playerStore'
import { useToastStore } from '../stores/toastStore'
import { ensureStatsLoaded, formatCount, useStats } from '../stores/statsStore'
import { useFavorites, useFavoritesStore } from '../stores/favoritesStore'
import { playContext } from './playerBridge'
import { TrackList } from '../components/TrackList'

/**
 * Songs 页（T4.4 / T4.9 / T4.11）——用真实页面替换 PagePlaceholder 的 Songs 分支。
 *
 * 接线（沿用 T4.2 libraryStore 既有模式）：
 *   · useLibrary() 取列表 + 分页/排序参数；首屏经 refresh() 取数（setSort 内部自动 refresh）。
 *   · onSortChange 直接接 libraryStore.setSort（§3.7 七键排序白名单 → 自动重取）。
 *   · TrackList 纯展示（Songs 页可排序，sortable 默认 true），playingTrackId 当前无 playerStore
 *     不注入（T5.6 接通）。
 *
 * 页头（T4.11，对照 mockups/Songs.html:62-68 实测形态）：**h2 保持纯标题「全部歌曲」**，
 * 真实总数在设计稿中位于页头副行 <p>（「30,000 首曲目 · 按标题排序」），不在标题内——
 * 计数经 library:getStats（T4.11 新增只读聚合通道）经 statsStore 取，千位分隔（formatCount，
 * 设计稿即「30,000」形态）；「按X排序」随当前 sortBy 动态插值（SORT_LABEL_KEYS 复用既有
 * 列名/排序键文案）。加载失败/未就绪（stats === null）回退纯标题——不渲染 0 或 NaN 冒充总数
 * （T4.1「禁假数据」延续；T4.4「不渲染总数」的限制由 getStats 通道解除，非放松）。
 *
 * 页脚翻页（T4.9 / T4.11 根治）：按钮可见内容为箭头字形、语义名走 aria-label。
 *   · 末页判定根治：total 就绪后用 `offset + limit >= total` 禁「下一页」，替换 T4.9 的
 *     「当页行数 < limit」近似（该近似漏判「总数恰为 limit 整数倍」的末页）。
 *   · total 未就绪（getStats 失败/未返回）时**回退旧行数近似**——翻页功能不因统计通道失效瘫痪。
 *   · 页码呈现升级：「第 N 页 / 共 M 页」（M = ceil(total/limit)）；total 未就绪回退「第 N 页」。
 *   · 保留 T4.9 越界空页兜底：offset>0 且 0 行仍渲染控件（total 与行数瞬态不一致时保「上一页」退路）。
 * 渲染门槛：加载/错误态不渲染；首页空态（offset=0 且无行）不渲染。
 */

/** 当前排序键 → 页头副行「按X排序」文案键（全部复用既有 i18n 键，无新增重复文案）。 */
const SORT_LABEL_KEYS: Record<SortKey, string> = {
  title: 'songs.column.title',
  artist: 'songs.column.artist',
  album: 'songs.column.album',
  duration: 'songs.column.duration',
  dateAdded: 'songs.sortBy.dateAdded',
  year: 'songs.sortBy.year',
  playCount: 'songs.sortBy.playCount'
}

export function Songs(): ReactElement {
  const { t } = useI18n()
  const library = useLibrary()
  const { stats } = useStats()
  // T5.7 缺口②闭合：曲目表 C1 accent 接线——把当前播放曲目 id 下传给 TrackList，
  // 使对应行渲染 .track-row.is-playing（跨上下文 id 不匹配则不亮，正确行为）。
  const playingTrackId = usePlayingTrackId()
  // T6.1：收藏切片接线——列表行 ♡/♥ 与右键「收藏/取消收藏」以切片为唯一事实源（loaded 前回退
  // track.favorite，避免把未加载的空集合当成「全未收藏」）。toggle 乐观 + 失败回滚在切片内。
  const favorites = useFavorites()

  // T5.6：双击整队（上下文 = 当前页视图 songs，startIndex = 当页行号）；右键菜单接 playNext/enqueue；
  // 不可播双击 → 轻量 toast「M0.1 暂不支持此格式播放」。store 动作经 getState 调，避免无谓重渲染。
  const handleActivate = (_track: TrackRow, index: number): void => {
    playContext(library.songs, index)
  }
  const handlePlayNext = (track: TrackRow): void => {
    usePlayerStore.getState().playNext(track)
  }
  const handleEnqueue = (track: TrackRow): void => {
    usePlayerStore.getState().enqueue(track)
  }
  const handleUnplayableActivate = (): void => {
    useToastStore.getState().showToast(t('player.unsupportedFormat'))
  }
  // T6.1：行 ♡/右键收藏 → 切片 toggle（next 由行的当前收藏态推导，避免重复取反）。
  const handleToggleFavorite = (track: TrackRow, next: boolean): void => {
    void useFavoritesStore.getState().toggle(track.id, next)
  }

  useEffect(() => {
    void library.refresh()
  }, [library.refresh])

  // stats 拉取（幂等：多消费方首挂载共享一次；scan done 自动刷新见 statsStore）。
  useEffect(() => {
    ensureStatsLoaded()
  }, [])

  const { offset, limit } = library.params
  const rowCount = library.songs.length
  const total = stats?.tracks
  const canPrev = offset > 0
  // 末页判定：total 就绪 → offset+limit >= total 禁下一页（根治）；未就绪 → 行数近似回退。
  const canNext = total !== undefined ? offset + limit < total : rowCount >= limit
  const page = Math.floor(offset / limit) + 1
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / limit)) : null
  const showPagination =
    !library.loading && !library.error && (rowCount > 0 || offset > 0)

  const goPrev = (): void => library.setPage(Math.max(0, offset - limit), limit)
  const goNext = (): void => library.setPage(offset + limit, limit)

  return (
    <div className="page-wrap browse-page">
      <div className="page-head">
        <div>
          <h2>{t('songs.heading')}</h2>
          {/* 副行总数：仅 stats 就绪渲染（设计稿 mockups/Songs.html:66 的 <p> 形态）。
              「按X排序」随 sortBy 动态插值——设计稿为静态「按标题排序」，动态化以保证排序切换后不失真。 */}
          {stats !== null ? (
            <p>
              {t('songs.headingTotal', {
                count: formatCount(stats.tracks),
                sort: t(SORT_LABEL_KEYS[library.params.sortBy])
              })}
            </p>
          ) : null}
        </div>
      </div>
      <TrackList
        songs={library.songs}
        loading={library.loading}
        error={library.error}
        sortBy={library.params.sortBy}
        order={library.params.order}
        playingTrackId={playingTrackId}
        onSortChange={library.setSort}
        onActivate={handleActivate}
        onPlayNext={handlePlayNext}
        onEnqueue={handleEnqueue}
        onUnplayableActivate={handleUnplayableActivate}
        favoriteIds={favorites.loaded ? favorites.favoriteIds : undefined}
        onToggleFavorite={handleToggleFavorite}
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
          <span className="songs-pagination-page">
            {totalPages !== null
              ? t('songs.pagination.pageTotal', { page, pages: totalPages })
              : t('songs.pagination.page', { page })}
          </span>
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
