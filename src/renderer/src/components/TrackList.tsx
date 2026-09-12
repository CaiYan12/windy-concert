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
 *     T6.1：可选 favoriteIds（ReadonlySet<string>）——提供时以其为**收藏唯一事实源**（覆盖
 *     track 列表数据里可能陈旧的 favorite 快照），未提供则回退 track.favorite。本组件仍不
 *     import 任何 store：切片由消费方经 props 注入（合成派生 track 传下行与右键菜单）。
 *   · 双击 → onActivate（传 track + 行内 index）；missing / 不可播行被拦截改走
 *     onUnplayableActivate（T5.6 不可播 toast，与 onActivate 互斥）。
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
  /**
   * T4.11：排序开关（默认 true，向后兼容）。false = 表头为纯文本列名——可排序列不渲染
   * .sort-button / chevron，且全部列不输出 aria-sort（含 none）。设计稿依据：AlbumDetail /
   * ArtistDetail 表头 grep sort-button 零命中（Songs.html 有）——详情页曲目表为固定序
   * （album: disc→trackNumber / artist: 专辑归组序），表头不承担排序语义，顺带消除
   * 「aria-sort="ascending" 但用户无法改序」的失真。
   */
  sortable?: boolean
  /**
   * T6.3：可拖拽模式——表头首列多出一个 sr-only「拖拽」列（设计稿 PlaylistDetail.html:9），
   * 与数据行首列的手柄格对齐（列数差一即全表错位）。
   */
  draggable?: boolean
}

/** 表头行：sortable 时可排序列渲染 .sort-button、当前列显示 12px chevron（icons.md）；
 *  不可排序时全部列渲染纯文本列名（无 button / aria-sort / chevron）。 */
export function TrackHeaderRow({
  sortBy,
  order,
  onSortChange,
  sortDegraded = false,
  sortable = true,
  draggable = false
}: TrackHeaderRowProps): ReactElement {
  const { t } = useI18n()
  return (
    <div
      className={sortDegraded ? 'track-row track-row--head is-sort-degraded' : 'track-row track-row--head'}
      role="row"
    >
      {draggable ? (
        // T6.3：与数据行首列手柄格对位的 sr-only 列头（设计稿原文 `<span class="sr-only">拖拽</span>`）。
        <div className="track-cell" role="columnheader">
          <span className="sr-only">{t('playlists.dragHint')}</span>
        </div>
      ) : null}
      {TRACK_COLUMNS.map((col) => {
        const isSorted = sortable && col.sortKey !== undefined && col.sortKey === sortBy
        // 不可排序表头不输出 aria-sort（含 none）——排序语义整体缺席，而非「当前列无序」。
        const ariaSort = !sortable
          ? undefined
          : col.sortKey === undefined
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
            {!sortable ? (
              // 纯文本列名：保留 sr-only / mark 分支语义（序号列、状态列等无可见列名）。
              col.srOnly ? (
                <span className="sr-only">{t(col.labelKey)}</span>
              ) : col.mark ? (
                <>
                  <span aria-hidden="true">{col.mark}</span>
                  <span className="sr-only">{t(col.labelKey)}</span>
                </>
              ) : (
                t(col.labelKey)
              )
            ) : col.sortKey !== undefined ? (
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
  /**
   * T4.11：排序开关（默认 true）。false → 表头纯文本列名（无 sort-button/aria-sort/chevron），
   * sortBy/order/onSortChange 被忽略。AlbumDetail/ArtistDetail 传 false（设计稿详情页表头
   * 无排序按钮，曲目为固定序）。
   */
  sortable?: boolean
  /** 正在播放的曲目 id（本任务无 playerStore，缺省不渲染任何播放行）。 */
  playingTrackId?: string
  /** 滚动区高度（number=px / string=CSS 长度）；缺省撑满父容器。 */
  height?: number | string
  className?: string
  onPlayNext?: (track: TrackRow) => void
  onEnqueue?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  /**
   * T6.1：收藏集合（favoritesStore.favoriteIds）。提供时行内 ♡/♥ 与右键菜单一律读它
   * （覆盖 track.favorite 的陈旧快照）；省略则回退 track.favorite。切片未加载时消费方应
   * 省略本 prop（loaded=false 时集合不完整，见 favoritesStore.useFavorites 说明）。
   */
  favoriteIds?: ReadonlySet<string>
  /** 双击 / 行内播放 → 播放该曲目（传 track 与行内 index，供整队 playContext 定位）。 */
  onActivate?: (track: TrackRow, index: number) => void
  /** 双击 / 行内播放作用到 missing / 不可播曲目时触发（T5.6 不可播 toast）。 */
  onUnplayableActivate?: (track: TrackRow, index: number) => void
  /** 「添加到歌单」子菜单数据源（本任务无 playlist store，缺省空 → 仅「新建歌单」）。 */
  playlists?: readonly PlaylistSummary[]
  onAddToPlaylist?: (track: TrackRow, playlistId: number) => void
  onCreatePlaylist?: (track: TrackRow) => void
  /**
   * T6.3：行可拖拽重排（默认 false）。true → 表头与数据行首列各多出一个拖拽格
   * （表头 sr-only「拖拽」+ 行内 grip-vertical 手柄），行挂 draggable="true" 与 .drag-row。
   * 拖拽语义为**插入到目标行上缘**（applyTrackOrder）；落位后经 onReorder 外抛。
   */
  draggable?: boolean
  /** T6.3：拖拽落位 → (fromIndex, toIndex) 行内 index，消费方据此重排并持久化。 */
  onReorder?: (fromIndex: number, toIndex: number) => void
  /**
   * T6.2：从歌单移除该曲目。提供时右键菜单末尾追加「从歌单中移除」项
   * （仅歌单详情页传入；其它上下文不传，菜单保持原四组）。
   */
  onRemoveFromPlaylist?: (track: TrackRow) => void
}

export function TrackList({
  songs,
  loading = false,
  error = null,
  sortBy = 'title',
  order = 'asc',
  onSortChange,
  sortable = true,
  playingTrackId,
  height,
  className,
  onPlayNext,
  onEnqueue,
  onToggleFavorite,
  favoriteIds,
  onActivate,
  onUnplayableActivate,
  playlists = [],
  onAddToPlaylist,
  onCreatePlaylist,
  draggable = false,
  onReorder,
  onRemoveFromPlaylist
}: TrackListProps): ReactElement {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; track: TrackRow } | null>(null)
  // I4：记录打开菜单的触发行，菜单关闭后归还焦点（键盘用户不迷失位置）。
  const menuTriggerRef = useRef<HTMLElement | null>(null)
  // T6.3：拖拽状态（源行 index / 当前悬停的目标行 index）。null = 无拖拽。
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  // 源行 index 的 ref 镜像：dragover/drop/dragend 处理器需读最新值，但又不能把 dragIndex
  // 放进 useCallback 依赖（否则每次拖动都重建 itemContent，行整批重渲染）。
  const dragIndexRef = useRef<number | null>(null)

  const closeMenu = useCallback(() => {
    setMenu(null)
    menuTriggerRef.current?.focus()
  }, [])

  /** T6.3：拖拽结束（落位或取消）→ 清空两个 index；drop 分支读落位目标行 index。 */
  const endDrag = useCallback(() => {
    dragIndexRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
    setDragIndex(index)
    setDropIndex(null)
  }, [])

  const handleDragOver = useCallback((index: number) => {
    // 悬停在源行上不显示插入线（无位移语义，也是 applyTrackOrder 的 no-op 情形）。
    if (index === dragIndexRef.current) return
    setDropIndex(index)
  }, [])

  const handleDrop = useCallback(
    (index: number) => {
      const from = dragIndexRef.current
      endDrag()
      if (from === null || from === index) return
      onReorder?.(from, index)
    },
    [endDrag, onReorder]
  )

  // itemContent 用 useCallback + computeItemKey 用 id：行复用时不丢 React 身份（virtuoso 建议形态）。
  const itemContent = useCallback(
    (index: number, track: TrackRow) => {
      // T6.1：favoriteIds 提供时，合成一个「收藏态以切片为准」的派生 track 传下行与菜单——
      // 纯展示组件只是消费外部注入的有效收藏态，自身不 import store（纪律不破）。省略则原样
      // 传 track（回退 track.favorite，兼容未接收藏切片的消费方）。
      const view = favoriteIds
        ? { ...track, favorite: favoriteIds.has(track.id) }
        : track
      return (
        <TrackRowItem
          track={view}
          index={index}
          isPlaying={playingTrackId === view.id}
          isSelected={selectedId === view.id}
          onSelect={setSelectedId}
          onActivate={onActivate}
          onUnplayableActivate={onUnplayableActivate}
          onToggleFavorite={onToggleFavorite}
          draggable={draggable}
          dragState={
            dragIndex === index ? 'dragging' : dropIndex === index ? 'drop-target' : null
          }
          onDragStartRow={handleDragStart}
          onDragOverRow={handleDragOver}
          onDropRow={handleDrop}
          onDragEndRow={endDrag}
          onOpenMenu={(event, t2) => {
            menuTriggerRef.current = event.currentTarget as HTMLElement
            setSelectedId(t2.id)
            setMenu({ x: event.clientX, y: event.clientY, track: t2 })
          }}
        />
      )
    },
    [
      playingTrackId,
      selectedId,
      onActivate,
      onUnplayableActivate,
      onToggleFavorite,
      favoriteIds,
      draggable,
      dragIndex,
      dropIndex,
      handleDragStart,
      handleDragOver,
      handleDrop,
      endDrag
    ]
  )

  /**
   * 行键：默认用曲目 id（利于重排/排序时的行身份稳定）。
   * T6.3 例外：歌单**允许同一曲目多次入单**（repo 的 reorder/addTracks 语义），纯 id 键会碰撞
   * （React 报重复 key、virtuoso 复用错行）→ 可拖拽模式叠加行内 index 保证唯一。
   */
  const computeItemKey = useCallback(
    (index: number) => {
      const track = songs[index]
      if (!track) return index
      return draggable ? `${track.id}#${index}` : track.id
    },
    [songs, draggable]
  )

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
          sortable={sortable}
          draggable={draggable}
        />
      )
    }),
    [sortBy, order, onSortChange, sortDegraded, sortable, draggable]
  )

  const rootStyle =
    height === undefined ? undefined : { height: typeof height === 'number' ? `${height}px` : height }

  return (
    <div className={className ? `track-list ${className}` : 'track-list'} style={rootStyle}>
      <div
        className={draggable ? 'track-table track-table--draggable' : 'track-table'}
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
              sortable={sortable}
              draggable={draggable}
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
          onRemoveFromPlaylist={onRemoveFromPlaylist}
        />
      )}
    </div>
  )
}

export default TrackList
