import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement
} from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { PlaylistSummary, SortKey, SortOrder, TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Cover } from './Cover'
import { Icon, type IconName } from './Icon'

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
 * 六态与判定（§3.7 line 572 + Songs.html 样本）：
 *   normal / hover / playing / missing / unplayable / selected。
 *   · missing / unplayable / normal 由 resolveRowState(status, playable) 判定（纯函数，单测锚点）。
 *   · hover 由 CSS :hover / :focus-within 承担（非 JS 状态）。
 *   · playing 由 playingTrackId === track.id 叠加。
 *   · selected 由组件内单选态叠加（本任务无选中 store，仅视觉；T4.6 多选/拖拽如需再提升）。
 */

// ---------------------------------------------------------------------------
// 纯函数与常量（单测锚点）
// ---------------------------------------------------------------------------

/** §3.7 排序白名单 7 键（唯一来源 shared/types.ts 的 SortKey；此处列出允许值用于运行时守卫）。 */
export const SORT_KEYS: readonly SortKey[] = [
  'title',
  'artist',
  'album',
  'dateAdded',
  'year',
  'duration',
  'playCount'
]

/** 纯函数：字符串是否命中排序白名单（防外部传入非法键）。 */
export function isSortKey(key: string): key is SortKey {
  return (SORT_KEYS as readonly string[]).includes(key)
}

/**
 * 纯函数：表头点击 → 下一排序态。
 *   · 点击当前排序列 → 仅翻转方向（asc ⇄ desc）；
 *   · 点击其它列 → 切到该列并回到 asc（与 libraryStore.setSort 的 offset 归零语义一致）。
 */
export function nextSort(
  current: { sortBy: SortKey; order: SortOrder },
  key: SortKey
): { sortBy: SortKey; order: SortOrder } {
  if (current.sortBy === key) {
    return { sortBy: key, order: current.order === 'asc' ? 'desc' : 'asc' }
  }
  return { sortBy: key, order: 'asc' }
}

/** 行状态（视觉维度）：normal / missing / unplayable。playing、selected、hover 为其上叠加的交互态。 */
export type RowState = 'normal' | 'missing' | 'unplayable'

/**
 * 纯函数：行状态判定（§3.7 line 572）。
 * 优先级：**missing > unplayable > normal**
 *   · status === 'missing' → missing（文件缺失）：无论 playable 取值，缺失即缺失——设计稿
 *     Songs.html:121-132 缺失行只出现 file-x-2，不出现 ban；40% 透明 + 右侧「文件缺失」灰标。
 *   · 否则 !playable → unplayable（解码器不支持：APE/WMA/AIFF/DSF…，见 CONTEXT.md）：
 *     禁用播放图标 + tooltip。status === 'ignored'（扫描期跳过项）同样不可播，并入此态。
 *   · 其余 → normal。
 */
export function resolveRowState(track: Pick<TrackRow, 'status' | 'playable'>): RowState {
  if (track.status === 'missing') return 'missing'
  if (!track.playable || track.status === 'ignored') return 'unplayable'
  return 'normal'
}

/** 纯函数：秒 → m:ss（≥1h 用 h:mm:ss）；缺失/非正数显示「—」（设计稿的缺失值符号）。 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** 纯函数：0-based 序号 → 两位显示（01…99，>99 原样）。 */
export function formatIndex(index: number): string {
  return String(index + 1).padStart(2, '0')
}

/**
 * 纯函数：采样率·位深 → 展示参数；任一缺失返回 null（调用方渲染「—」）。
 * kHz 由 Hz/1000 得出（44.1 / 96 等小数保留）。
 */
export function specParts(
  sampleRate: number | null,
  bitDepth: number | null
): { bit: number; rate: number } | null {
  if (bitDepth == null || sampleRate == null || bitDepth <= 0 || sampleRate <= 0) return null
  return { bit: bitDepth, rate: sampleRate / 1000 }
}

/** 右键菜单项（§3.7 line 572：四组）。 */
export interface TrackMenuItem {
  id: 'play-next' | 'enqueue' | 'favorite' | 'add-to-playlist'
  labelKey: string
  /** 快捷键提示（仅下一首播放有，设计稿为 ↵）。 */
  shortcut?: string
  /** 是否带子菜单（添加到歌单）。 */
  submenu?: boolean
}

/**
 * 纯函数：曲目右键菜单项（固定四组，顺序与设计稿一致）。
 * 第三组的文案随收藏态切换（收藏 / 取消收藏）。
 */
export function trackMenuItems(track: Pick<TrackRow, 'favorite'>): TrackMenuItem[] {
  return [
    { id: 'play-next', labelKey: 'menu.playNow', shortcut: '↵' },
    { id: 'enqueue', labelKey: 'menu.addToQueue' },
    { id: 'favorite', labelKey: track.favorite ? 'menu.unfavorite' : 'menu.favorite' },
    { id: 'add-to-playlist', labelKey: 'menu.addToPlaylist', submenu: true }
  ]
}

/** 表头列定义（§3.7 列宽顺序：封面/序号/标题/艺术家/专辑/时长/格式/比特率/规格/状态）。 */
export interface TrackColumnDef {
  id: string
  labelKey: string
  /** 单元格附加类（numeric / duration / format / col-bitrate / col-spec / track-cell--cover……）。 */
  cellClass?: string
  /** 可排序键；须命中 SORT_KEYS 白名单（单测守卫）。无则表头不可点。 */
  sortKey?: SortKey
  /** 表头可见符号（如序号列 '#'）；提供时以符号呈现 + sr-only 完整标签。 */
  mark?: string
  /** 表头仅 sr-only（如状态列）。 */
  srOnly?: boolean
}

export const TRACK_COLUMNS: readonly TrackColumnDef[] = [
  { id: 'cover', labelKey: 'songs.column.cover', cellClass: 'track-cell--cover' },
  { id: 'index', labelKey: 'songs.column.index', cellClass: 'track-cell--index numeric', mark: '#' },
  { id: 'title', labelKey: 'songs.column.title', sortKey: 'title' },
  { id: 'artist', labelKey: 'songs.column.artist', sortKey: 'artist' },
  { id: 'album', labelKey: 'songs.column.album', sortKey: 'album' },
  { id: 'duration', labelKey: 'songs.column.duration', cellClass: 'duration', sortKey: 'duration' },
  { id: 'format', labelKey: 'songs.column.format', cellClass: 'format' },
  { id: 'bitrate', labelKey: 'songs.column.bitrate', cellClass: 'numeric col-bitrate' },
  { id: 'spec', labelKey: 'songs.column.quality', cellClass: 'spec col-spec' },
  { id: 'status', labelKey: 'songs.column.status', srOnly: true }
]

// ---------------------------------------------------------------------------
// 表头
// ---------------------------------------------------------------------------

interface TrackHeaderRowProps {
  sortBy: SortKey
  order: SortOrder
  onSortChange?: (sortBy: SortKey, order: SortOrder) => void
}

/** 表头行：仅在可排序列渲染 .sort-button；当前排序列显示 12px chevron（icons.md）。 */
export function TrackHeaderRow({ sortBy, order, onSortChange }: TrackHeaderRowProps): ReactElement {
  const { t } = useI18n()
  return (
    <div className="track-row track-row--head" role="row">
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
// 单行
// ---------------------------------------------------------------------------

export interface TrackRowItemProps {
  track: TrackRow
  /** 0-based 列表序号（用于展示 01、02……）。 */
  index: number
  isPlaying: boolean
  isSelected: boolean
  onSelect?: (id: string) => void
  /** 双击 / 行内播放按钮 → 播放该曲目（missing / 不可播不触发）。 */
  onActivate?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onOpenMenu?: (event: ReactMouseEvent, track: TrackRow) => void
}

/** 单行渲染（与虚拟滚动解耦，便于单测直接 SSR 断言六态）。 */
export function TrackRowItem({
  track,
  index,
  isPlaying,
  isSelected,
  onSelect,
  onActivate,
  onToggleFavorite,
  onOpenMenu
}: TrackRowItemProps): ReactElement {
  const { t } = useI18n()
  const state = resolveRowState(track)
  const playable = state === 'normal'
  const spec = specParts(track.sampleRate, track.bitDepth)

  const rowClass = [
    'track-row',
    isSelected ? 'is-selected' : '',
    isPlaying ? 'is-playing' : '',
    state === 'missing' ? 'is-missing' : '',
    state === 'unplayable' ? 'is-unavailable' : ''
  ]
    .filter(Boolean)
    .join(' ')

  const subtitle =
    state === 'missing'
      ? t('track.missing')
      : state === 'unplayable'
        ? t('track.unplayableTooltip')
        : track.artistName

  const playIcon: IconName =
    state === 'missing' ? 'file-x-2' : state === 'unplayable' ? 'ban' : 'play'

  const playLabel =
    state === 'missing'
      ? `${track.title} ${t('track.missing')}`
      : state === 'unplayable'
        ? `${track.title} ${t('track.unplayableTooltip')}`
        : `${t('menu.play')} ${track.title}`

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' && playable) onActivate?.(track)
  }

  return (
    <div
      className={rowClass}
      role="row"
      tabIndex={0}
      aria-selected={isSelected || undefined}
      onClick={() => onSelect?.(track.id)}
      onDoubleClick={() => {
        // missing / 不可播：双击无效（§3.7 line 572）
        if (playable) onActivate?.(track)
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenMenu?.(event, track)
      }}
    >
      <div className="track-cell track-cell--cover" role="cell">
        <Cover coverId={track.coverId} size={64} className="cover--table" />
      </div>

      <div className="track-cell track-cell--index numeric" role="cell">
        {isPlaying ? (
          <Icon name="music-2" size={16} className="is-playing-icon" alt={t('track.playing')} />
        ) : (
          <>
            <span className="index-number">{formatIndex(index)}</span>
            <button
              className="row-play"
              type="button"
              disabled={!playable}
              aria-label={playLabel}
              title={state === 'unplayable' ? t('track.unplayableTooltip') : undefined}
              onClick={() => {
                if (playable) onActivate?.(track)
              }}
            >
              <Icon name={playIcon} size={16} />
            </button>
          </>
        )}
      </div>

      <div className="track-cell" role="cell">
        <div className="track-title" title={track.title}>
          {track.title}
        </div>
        {subtitle ? <div className="track-subtitle">{subtitle}</div> : null}
      </div>

      <div className="track-cell track-subtitle" role="cell">
        {track.artistName || '—'}
      </div>

      <div className="track-cell track-subtitle" role="cell">
        {track.albumTitle || '—'}
      </div>

      <div className="track-cell duration numeric" role="cell">
        {formatDuration(track.duration)}
      </div>

      <div className="track-cell format" role="cell">
        {track.format ? track.format.toUpperCase() : '—'}
      </div>

      <div className="track-cell numeric col-bitrate" role="cell">
        {track.bitrate != null ? t('hires.kbps', { value: track.bitrate }) : '—'}
      </div>

      <div className="track-cell spec col-spec" role="cell">
        {spec ? t('songs.spec.format', { bit: spec.bit, rate: spec.rate }) : '—'}
      </div>

      <div className="track-cell track-status" role="cell">
        {state === 'missing' ? (
          <span className="track-status-mark" title={t('track.missing')}>
            <Icon name="file-x-2" size={15} alt={t('track.missing')} />
          </span>
        ) : state === 'unplayable' ? (
          <span className="track-status-mark" title={t('track.unplayableTooltip')}>
            <Icon name="ban" size={15} alt={t('track.unplayableTooltip')} />
          </span>
        ) : (
          <button
            className={track.favorite ? 'icon-button is-favorite' : 'icon-button'}
            type="button"
            aria-label={track.favorite ? t('track.unfavorite') : t('track.favorite')}
            onClick={() => onToggleFavorite?.(track, !track.favorite)}
          >
            <Icon name={track.favorite ? 'heart--accent' : 'heart'} size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 右键菜单
// ---------------------------------------------------------------------------

interface TrackContextMenuProps {
  x: number
  y: number
  track: TrackRow
  playlists: readonly PlaylistSummary[]
  onClose: () => void
  onPlayNext?: (track: TrackRow) => void
  onEnqueue?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onAddToPlaylist?: (track: TrackRow, playlistId: number) => void
  onCreatePlaylist?: (track: TrackRow) => void
}

/** 右键菜单：四组（下一首播放 / 添加到队列 / 收藏或取消收藏 / 添加到歌单▸）。 */
function TrackContextMenu({
  x,
  y,
  track,
  playlists,
  onClose,
  onPlayNext,
  onEnqueue,
  onToggleFavorite,
  onAddToPlaylist,
  onCreatePlaylist
}: TrackContextMenuProps): ReactElement {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 打开后按实际尺寸钳制到视口内（避免贴边溢出）。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    })
  }, [x, y])

  // 点击外部 / Escape / 滚动 / 尺寸变化 → 关闭。
  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  const items = trackMenuItems(track)

  const run = (id: TrackMenuItem['id']): void => {
    if (id === 'play-next') onPlayNext?.(track)
    else if (id === 'enqueue') onEnqueue?.(track)
    else if (id === 'favorite') onToggleFavorite?.(track, !track.favorite)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={t('songs.contextMenu')}
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item) =>
        item.submenu ? (
          <div
            key={item.id}
            className="context-item context-item--parent"
            role="menuitem"
            tabIndex={0}
            aria-haspopup="menu"
          >
            <span>{t(item.labelKey)}</span>
            <Icon name="chevron-right" size={16} />
            <div className="context-submenu" role="menu">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  className="context-item"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onAddToPlaylist?.(track, playlist.id)
                    onClose()
                  }}
                >
                  {playlist.name}
                </button>
              ))}
              <button
                className="context-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  onCreatePlaylist?.(track)
                  onClose()
                }}
              >
                <Icon name="plus" size={16} />
                <span>{t('menu.newPlaylist')}</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            key={item.id}
            className="context-item"
            type="button"
            role="menuitem"
            onClick={() => run(item.id)}
          >
            <span>{t(item.labelKey)}</span>
            {item.shortcut ? <span className="shortcut">{item.shortcut}</span> : null}
          </button>
        )
      )}
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

  const closeMenu = useCallback(() => setMenu(null), [])

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
          setSelectedId(t2.id)
          setMenu({ x: event.clientX, y: event.clientY, track: t2 })
        }}
      />
    ),
    [playingTrackId, selectedId, onActivate, onToggleFavorite]
  )

  const computeItemKey = useCallback((index: number) => songs[index]?.id ?? index, [songs])

  const virtuosoComponents = useMemo(
    () => ({
      Header: () => <TrackHeaderRow sortBy={sortBy} order={order} onSortChange={onSortChange} />
    }),
    [sortBy, order, onSortChange]
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
          <Virtuoso
            className="track-list-scroll"
            data={songs}
            computeItemKey={computeItemKey}
            itemContent={itemContent}
            components={virtuosoComponents}
          />
        ) : (
          <>
            <TrackHeaderRow sortBy={sortBy} order={order} onSortChange={onSortChange} />
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
