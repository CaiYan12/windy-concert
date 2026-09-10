import type { SortKey, SortOrder, TrackRow } from '../../../shared/types'

/**
 * TrackList 纯函数与常量（T4.3 评审修复拆出；原 TrackList.tsx 的模块级定义原样迁出，零行为变更）。
 *
 * 拆出动机：TrackList.tsx 原 681 行，纯逻辑（排序白名单 / 行状态 / 格式化 / 列定义 / 菜单项）
 * 与三个渲染单元（表头 / 单行 / 右键菜单 / 列表容器）混在一个文件；本文件只承载**无副作用**的
 * 判定与常量，单测锚点（经 TrackList.tsx 再导出）保持不变。
 */

// ---------------------------------------------------------------------------
// 排序白名单与切换
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

// ---------------------------------------------------------------------------
// 行状态与格式化
// ---------------------------------------------------------------------------

/** 行状态（视觉维度）：normal / missing / unplayable。playing、selected、hover 为其上叠加的交互态。 */
export type RowState = 'normal' | 'missing' | 'unplayable'

/**
 * 纯函数：行状态判定（§3.7 line 572）。
 * 优先级：**missing > unplayable > normal**
 *   · status === 'missing' → missing（文件缺失）：无论 playable 取值，缺失即缺失——设计稿
 *     Songs.html:121-132 缺失行只出现 file-x-2，不出现 ban；不透明度 0.62（tracklist.css 的
 *     .track-row.is-missing，与 mockup.css:803 一致）+ 右侧「文件缺失」灰标。
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

// ---------------------------------------------------------------------------
// 右键菜单项
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 表头列定义
// ---------------------------------------------------------------------------

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
