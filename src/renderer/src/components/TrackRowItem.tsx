import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement
} from 'react'
import type { TrackRow } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Cover } from './Cover'
import { Icon, type IconName } from './Icon'
import {
  formatDuration,
  formatIndex,
  resolveRowState,
  specParts
} from './trackListUtils'

/**
 * TrackRowItem —— 曲目表单行（T4.3 评审修复拆出；自 TrackList.tsx 原样迁出）。
 *
 * 六态与判定（§3.7 line 572 + Songs.html 样本）：
 *   normal / hover / playing / missing / unplayable / selected。
 *   · missing / unplayable / normal 由 resolveRowState(status, playable) 判定（纯函数，单测锚点）。
 *   · hover 由 CSS :hover / :focus-within 承担（非 JS 状态）。
 *   · playing 由父级传入的 isPlaying 叠加。
 *   · selected 由父级传入的 isSelected 叠加。
 *
 * 与虚拟滚动解耦：本组件不感知 virtuoso，便于单测直接 SSR / 客户端挂载断言六态与交互。
 */

export interface TrackRowItemProps {
  track: TrackRow
  /** 0-based 列表序号（用于展示 01、02……）。 */
  index: number
  isPlaying: boolean
  isSelected: boolean
  onSelect?: (id: string) => void
  /** 双击 / 行内播放按钮 → 播放该曲目（传 track 与行内 index，供整队 playContext 定位）。 */
  onActivate?: (track: TrackRow, index: number) => void
  /**
   * 双击 / 行内播放按钮作用到 missing / 不可播曲目时触发（T5.6 不可播 toast 接线）。
   * 与 onActivate 互斥：playable 走 onActivate，否则走 onUnplayableActivate（留痕）。
   */
  onUnplayableActivate?: (track: TrackRow, index: number) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onOpenMenu?: (event: ReactMouseEvent, track: TrackRow) => void
  /**
   * T6.3：本行可拖拽重排。true 时行挂 draggable="true" + .drag-row，并在首列渲染
   * grip-vertical 手柄格（设计稿 PlaylistDetail.html:9）。
   */
  draggable?: boolean
  /** T6.3：拖拽视觉态——'dragging'（源行 60% 透明）/ 'drop-target'（目标行上缘 2px 插入线）。 */
  dragState?: 'dragging' | 'drop-target' | null
  onDragStartRow?: (index: number) => void
  onDragOverRow?: (index: number) => void
  onDropRow?: (index: number) => void
  onDragEndRow?: () => void
}

export function TrackRowItem({
  track,
  index,
  isPlaying,
  isSelected,
  onSelect,
  onActivate,
  onUnplayableActivate,
  onToggleFavorite,
  onOpenMenu,
  draggable = false,
  dragState = null,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow
}: TrackRowItemProps): ReactElement {
  const { t } = useI18n()
  const state = resolveRowState(track)
  const playable = state === 'normal'
  const spec = specParts(track.sampleRate, track.bitDepth)

  const rowClass = [
    'track-row',
    draggable ? 'drag-row' : '',
    dragState === 'dragging' ? 'is-dragging' : '',
    dragState === 'drop-target' ? 'is-drop-target' : '',
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
    if (event.key === 'Enter') {
      // playable 走 onActivate，否则走 onUnplayableActivate（不可播 toast 接线）。
      if (playable) onActivate?.(track, index)
      else onUnplayableActivate?.(track, index)
    }
  }

  return (
    <div
      className={rowClass}
      role="row"
      tabIndex={0}
      draggable={draggable ? true : undefined}
      aria-selected={isSelected || undefined}
      onClick={() => onSelect?.(track.id)}
      onDragStart={
        draggable
          ? (event) => {
              // Firefox 等要求 dragstart 里写入 data 才会真正启动拖拽；内容仅供浏览器识别，
              // 重排语义由 TrackList 的 index 状态承担（不依赖 dataTransfer 读回）。
              event.dataTransfer?.setData('text/plain', String(index))
              if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
              onDragStartRow?.(index)
            }
          : undefined
      }
      onDragOver={
        draggable
          ? (event) => {
              // 必须 preventDefault 才允许 drop（HTML5 DnD 默认拒绝）。
              event.preventDefault()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
              onDragOverRow?.(index)
            }
          : undefined
      }
      onDrop={
        draggable
          ? (event) => {
              event.preventDefault()
              onDropRow?.(index)
            }
          : undefined
      }
      onDragEnd={draggable ? () => onDragEndRow?.() : undefined}
      onDoubleClick={() => {
        // missing / 不可播：双击不触发播放，改走 onUnplayableActivate（T5.6 不可播 toast，
        // §3.7 line 572）。此拦截由 TrackList.test.tsx 客户端挂载用例锚定：缺失 / 不可播行
        // 双击不触发 onActivate，而触发 onUnplayableActivate；正常行触发 onActivate 一次。
        if (playable) onActivate?.(track, index)
        else onUnplayableActivate?.(track, index)
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => {
        event.preventDefault()
        onOpenMenu?.(event, track)
      }}
    >
      {draggable ? (
        // T6.3：首列拖拽手柄（设计稿 PlaylistDetail.html:9 的首列）。手柄是纯视觉把手——
        // 拖拽由整行承担（draggable="true"），故不进 tab 序、不单独挂事件。
        <div className="track-cell track-cell--drag" role="cell">
          <span className="drag-handle" title={t('playlists.dragHint')} aria-hidden="true">
            <Icon name="grip-vertical" size={16} />
          </span>
        </div>
      ) : null}

      <div className="track-cell track-cell--cover" role="cell">
        <Cover coverId={track.coverId} size={64} className="cover--table" />
      </div>

      <div className="track-cell track-cell--index numeric" role="cell">
        {isPlaying ? (
          // C1：语义色 = 选对变体文件名（T4.0 铁律）。Icon 渲染 <img>，CSS color 对 SVG 内部 stroke
          // 无效；music-2.svg 的 stroke 已烘焙 #ffffff，播放态对应 #1ed760 的变体是 music-2--accent。
          <Icon name="music-2--accent" size={16} className="is-playing-icon" alt={t('track.playing')} />
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
                if (playable) onActivate?.(track, index)
                else onUnplayableActivate?.(track, index)
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

export default TrackRowItem
