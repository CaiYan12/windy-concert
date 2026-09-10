import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { PlaylistSummary, SortKey, SortOrder, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import { TrackContextMenu } from './TrackContextMenu'
import { TrackRowItem } from './TrackRowItem'
import { nextSort, TRACK_COLUMNS } from './trackListUtils'

// 纯函数 / 常量 / 单测锚点经本文件再导出，保持既有 import 路径（'./TrackList'）不变。
export {
  SORT_KEYS,
  TRACK_COLUMNS,
  formatDuration,
  formatIndex,
  isSortKey,
  nextSort,
  resolveRowState,
  specParts,
  trackMenuItems
} from './trackListUtils'
export type { RowState, TrackColumnDef, TrackMenuItem } from './trackListUtils'
export { TrackRowItem } from './TrackRowItem'
export type { TrackRowItemProps } from './TrackRowItem'
export { TrackContextMenu } from './TrackContextMenu'
export type { TrackContextMenuProps } from './TrackContextMenu'

/**
 * TrackList —— 曲目表（T4.3，Phase 4 最重的 UI 组件）。
 *
 * 职责边界（重要，涉及跨任务接线）：
 *   · **纯展示组件**：曲目数组、排序态、播放态全部经 props 注入；组件自身不 import 任何 store。
 *     §3.7「排序白名单 7 键 → setSort（自动重取）」由消费方接线（T4.4)：
 *     `onSortChange={setSort}`，setSort 内部自动 refresh（libraryStore 留痕）。
 *   · 播放/队列：本任务**不创建 playerStore**（越界，属 T5.6）。「下一首播放 / 添加到队列」经
 *     onPlayNext / onEnqueue 注入，缺省为 no-op；playingTrackId 由消费方给定，缺省不渲染假播放行。
 *   · 收藏：纯视觉（按 track.favorite 渲染 ♡/♥），改动经可选 onToggleFavorite 回调外抛。
 *   · 双击 → onActivate（missing / 不可播行被拦截，不触发）。
 *
 * 分页 × 虚拟滚动取舍（T4.2 I-3 立案，本任务定调）：
 *   **采用「当前页渲染 + virtuoso 只做行渲染优化」**，不扩展 store 的 append/loadMore。
 *   理由：libraryStore 的分页语义是 offset/limit 的**整页替换**（§3.6，主进程 clampLimit 上界 200），
 *   加「追加」会把「当前页结果」与「累积结果」两种真相混在一个数组里，随之而来的重复键、
 *   去重、跨页丢失等问题需要 store 承担排序稳定性的责任——超出 T4.2 已冻结的 store 契约（禁改）。
 *   virtuoso 在此只解决「当前页 ≤200 行」的挂载量与滚动性能；真正的跨页取数仍由 setPage 驱动整页替换。
 *   若后续要无限滚动，应在 T4.4 之后单独立案（store 侧），届时 TrackList 只需换 data 来源。
 *
 * 文件拆分（T4.3 评审建议，本轮落地）：
 *   · 纯函数/常量 → trackListUtils.ts；· 单行 → TrackRowItem.tsx；· 右键菜单 → TrackContextMenu.tsx。
 *   本文件保留表头 + 列表容器。拆分是纯移动 + import 调整，行为变更仅限评审点名的修复项。
 */

// ---------------------------------------------------------------------------
// 表头
// ---------------------------------------------------------------------------

interface TrackHeaderRowProps {
  sortBy: SortKey
  order: SortOrder
  onSortChange?: (sortBy: SortKey, order: SortOrder) => void
  /**
   * I1：数据非空但存在 error 时置灰排序指示——避免「箭头指向新排序、列表是旧数据」的
   * 自相矛盾暗示（数据未按新序刷新）。排序按钮仍可点（触发消费方重试）。
   */
  sortDegraded?: boolean
}

/** 表头行：仅在可排序列渲染 .sort-button；当前排序列显示 12px chevron（icons.md）。 */
export function TrackHeaderRow({
  sortBy,
  order,
  onSortChange,
  sortDegraded = false
}: TrackHeaderRowProps): ReactElement {
  const { t } = useI18n()
  return (
    <div
      className={sortDegraded ? 'track-row track-row--head is-sort-degraded' : 'track-row track-row--head'}
      role="row"
    >
      {TRACK_COLUMNS.map((col) => {
        const isSorted = col.sortKey !== undefined && col.sortKey === sortBy
        const ariaSort =
          col.sortKey === undefined
            ? undefined
            : isSorted
              ? order === 'asc'
                ? ('ascending' as const)
                : ('descending' as const)
              : ('none' as const)
        return (
          <div
            key={col.id}
            className={col.cellClass ? `track-cell ${col.cellClass}` : 'track-cell'}
            role="columnheader"
            aria-sort={ariaSort}
          >
            {col.sortKey !== undefined ? (
              <button
                className="sort-button"
                type="button"
                onClick={() => {
                  const next = nextSort({ sortBy, order }, col.sortKey as SortKey)
                  onSortChange?.(next.sortBy, next.order)
                }}
              >
                {t(col.labelKey)}
                {isSorted && (
                  <Icon name={order === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} />
                )}
              </button>
            ) : col.srOnly ? (
              <span className="sr-only">{t(col.labelKey)}</span>
            ) : col.mark ? (
              <>
                <span aria-hidden="true">{col.mark}</span>
                <span className="sr-only">{t(col.labelKey)}</span>
              </>
            ) : (
              t(col.labelKey)
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

export interface TrackListProps {
  songs: TrackRow[]
  loading?: boolean
  error?: string | null
  sortBy?: SortKey
  order?: SortOrder
  /** 排序表头点击 → 消费方接线到 libraryStore.setSort（内部自动重取）。 */
  onSortChange?: (sortBy: SortKey, order: SortOrder) => void
  /** 正在播放的曲目 id（本任务无 playerStore，缺省不渲染任何播放行）。 */
  playingTrackId?: string
  /** 滚动区高度（number=px / string=CSS 长度）；缺省撑满父容器。 */
  height?: number | string
  className?: string
  onPlayNext?: (track: TrackRow) => void
  onEnqueue?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onActivate?: (track: TrackRow) => void
  /** 「添加到歌单」子菜单数据源（本任务无 playlist store，缺省空 → 仅「新建歌单」）。 */
  playlists?: readonly PlaylistSummary[]
  onAddToPlaylist?: (track: TrackRow, playlistId: number) => void
  onCreatePlaylist?: (track: TrackRow) => void
}

export function TrackList({
  songs,
  loading = false,
  error = null,
  sortBy = 'title',
  order = 'asc',
  onSortChange,
  playingTrackId,
  height,
  className,
  onPlayNext,
  onEnqueue,
  onToggleFavorite,
  onActivate,
  playlists = [],
  onAddToPlaylist,
  onCreatePlaylist
}: TrackListProps): ReactElement {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; track: TrackRow } | null>(null)
  // I4：记录打开菜单的触发行，菜单关闭后归还焦点（键盘用户不迷失位置）。
  const menuTriggerRef = useRef<HTMLElement | null>(null)

  const closeMenu = useCallback(() => {
    setMenu(null)
    menuTriggerRef.current?.focus()
  }, [])

  // itemContent 用 useCallback + computeItemKey 用 id：行复用时不丢 React 身份（virtuoso 建议形态）。
  const itemContent = useCallback(
    (index: number, track: TrackRow) => (
      <TrackRowItem
        track={track}
        index={index}
        isPlaying={playingTrackId === track.id}
        isSelected={selectedId === track.id}
        onSelect={setSelectedId}
        onActivate={onActivate}
        onToggleFavorite={onToggleFavorite}
        onOpenMenu={(event, t2) => {
          menuTriggerRef.current = event.currentTarget as HTMLElement
          setSelectedId(t2.id)
          setMenu({ x: event.clientX, y: event.clientY, track: t2 })
        }}
      />
    ),
    [playingTrackId, selectedId, onActivate, onToggleFavorite]
  )

  const computeItemKey = useCallback((index: number) => songs[index]?.id ?? index, [songs])

  // I1：error 存在时表头排序指示降级（数据可能未按当前排序刷新）。
  const sortDegraded = error != null

  const virtuosoComponents = useMemo(
    () => ({
      Header: () => (
        <TrackHeaderRow
          sortBy={sortBy}
          order={order}
          onSortChange={onSortChange}
          sortDegraded={sortDegraded}
        />
      )
    }),
    [sortBy, order, onSortChange, sortDegraded]
  )

  const rootStyle =
    height === undefined ? undefined : { height: typeof height === 'number' ? `${height}px` : height }

  return (
    <div className={className ? `track-list ${className}` : 'track-list'} style={rootStyle}>
      <div
        className="track-table"
        role="table"
        aria-label={t('songs.tableLabel')}
        aria-rowcount={songs.length}
      >
        {songs.length > 0 ? (
          <>
            {/* I1：数据非空时 error 以**非阻塞错误条**呈现（不遮列表）；此前仅在零数据分支渲染。 */}
            {error ? (
              <div className="track-list-error" role="status">
                <span className="track-list-error-title">{t('songs.error')}</span>
                <span className="track-list-error-hint">{error}</span>
              </div>
            ) : null}
            <Virtuoso
              className="track-list-scroll"
              data={songs}
              computeItemKey={computeItemKey}
              itemContent={itemContent}
              components={virtuosoComponents}
            />
          </>
        ) : (
          <>
            <TrackHeaderRow
              sortBy={sortBy}
              order={order}
              onSortChange={onSortChange}
              sortDegraded={sortDegraded}
            />
            <div className="track-list-state">
              {error ? (
                <>
                  <div className="track-list-state-title">{t('songs.error')}</div>
                  <div className="track-list-state-hint">{error}</div>
                </>
              ) : loading ? (
                <div className="track-list-state-title">{t('songs.loading')}</div>
              ) : (
                <>
                  <div className="track-list-state-title">{t('empty.songs.title')}</div>
                  <div className="track-list-state-hint">{t('empty.songs.hint')}</div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          track={menu.track}
          playlists={playlists}
          onClose={closeMenu}
          onPlayNext={onPlayNext}
          onEnqueue={onEnqueue}
          onToggleFavorite={onToggleFavorite}
          onAddToPlaylist={onAddToPlaylist}
          onCreatePlaylist={onCreatePlaylist}
        />
      )}
    </div>
  )
}

export default TrackList
