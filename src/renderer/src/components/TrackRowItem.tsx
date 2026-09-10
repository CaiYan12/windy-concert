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
  /** 双击 / 行内播放按钮 → 播放该曲目（missing / 不可播不触发）。 */
  onActivate?: (track: TrackRow) => void
  onToggleFavorite?: (track: TrackRow, next: boolean) => void
  onOpenMenu?: (event: ReactMouseEvent, track: TrackRow) => void
}

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
        // missing / 不可播：双击无效（§3.7 line 572）。此处拦截由 TrackList.test.tsx 的
        // 客户端挂载用例锚定（断言缺失 / 不可播行双击不触发 onActivate，正常行触发一次）。
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

export default TrackRowItem
