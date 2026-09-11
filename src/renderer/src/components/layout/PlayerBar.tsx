import { useCallback, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { Icon } from '../Icon'
import { Cover } from '../Cover'
import { Equalizer } from '../Equalizer'
import { usePlayer, usePlayerStore } from '../../stores/playerStore'
import type { RepeatMode } from '../../player/queue'

/**
 * PlayerBar —— 播放栏（T5.4，F4-3 全要素；视觉对照 components.html PlayerBar 区 / mockup.css:1765-1942）。
 *
 * 设计落位（与占位期对比，报告留痕）：
 *   · 占位期（T4.1）全部控件 disabled、零假数据；本任务接入 playerStore 真实状态并补齐全部交互。
 *   · 进度/音量条的「已播填充用 --text-secondary 不用主色」、4px 槽 hover 增至 6px、白色滑块——
 *     均由 shell.css 的 .progress-fill/.progress-thumb/.volume-fill/.volume-thumb 承担（占位期未移植
 *     mockup.css:1877-1908 的演示填充，本次按真实 position/volume 以 inline 宽度补回）。
 *   · 收藏态语义色走变体文件名（heart--accent = 主色描边），<img> 不受 CSS color 影响（见 Icon.tsx 说明）。
 *   · Shuffle/Repeat 激活态：图标是 SVG <img> 无法变色，故以「accent 描边环」(aria-pressed=true 的
 *     box-shadow) 表达开关态；Repeat 三态再叠加「1」角标区分「单曲循环」。
 *   · 均衡器（唯一持续动画）落位见 Equalizer.tsx 头注释。
 *
 * disabled 语义：currentTrack 为空（空队列）时全部控件 disabled（占位期既有 --text-disabled 视觉）。
 *   · 队列按钮在空队列下同样 disabled；currentTrack 存在时启用，点击触发可选回调 onToggleQueue
 *     （T5.5 队列面板的开关接入点；T5.4 仅占位接线，见报告取舍）。
 * 收藏乐观更新：点击立即本地更新 store 内 currentTrack.favorite 并经 favorites:set 上报；IPC 失败仅告警
 *   不回滚（T5.4 上报取舍）。
 */
export interface PlayerBarProps {
  /**
   * 队列面板开关回调（T5.5 消费）。未提供时队列按钮启用但点击为空操作（占位期）。
   * T6.0：入参为触发按钮元素本身（e.currentTarget），供 AppShell 在面板关闭后把焦点回落到
   * 队列钮（计划 903 行验收项：关闭 QueuePanel 后焦点回落触发按钮）。
   */
  onToggleQueue?: (trigger: HTMLElement) => void
}

/** 秒数 → m:ss（缺失/非法值回退 0:00，不伪造）。 */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** 从指针 clientX 推算条内比例 [0,1]（依赖元素布局宽度）。 */
function fractionFromClientX(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect()
  const width = rect.width || 1
  const x = (clientX - rect.left) / width
  return Math.min(1, Math.max(0, x))
}

/** favorites:set 上报通道（window.api，结构性类型，避免 import electron）。 */
function reportFavorite(trackId: string, favorite: boolean): void {
  const api = (globalThis.window as unknown as {
    api?: { favorites?: { set: (id: string, fav: boolean) => void | Promise<void> } }
  }).api
  void api?.favorites?.set(trackId, favorite)
}

/** Repeat 三态轮转顺序（设计稿/计划：off → all → one → off）。 */
const REPEAT_CYCLE: RepeatMode[] = ['off', 'all', 'one']

export function PlayerBar({ onToggleQueue }: PlayerBarProps = {}): ReactElement {
  const { t } = useI18n()
  const navigate = useNavigate()
  const {
    currentTrack,
    duration,
    position,
    playing,
    volume,
    muted,
    playMode,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    setShuffle,
    setRepeat,
  } = usePlayer()

  const hasTrack = currentTrack !== null

  // 拖动预览比例（拖动中覆盖真实 position/volume，松手落 store 后才以真实值接管）。
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const [dragVolume, setDragVolume] = useState<number | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const volumeRef = useRef<HTMLDivElement>(null)

  /** 通用拖动：pointerdown 起拖动，window 上监听 move/up，仅松手 commit（节流/仅松手落取舍，见报告）。 */
  const startDrag = useCallback(
    (
      ref: React.RefObject<HTMLDivElement | null>,
      setPreview: (frac: number | null) => void,
      commit: (frac: number) => void
    ) =>
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        const el = ref.current
        if (!el) return
        e.preventDefault()
        const compute = (clientX: number) => fractionFromClientX(el, clientX)
        setPreview(compute(e.clientX))
        const onMove = (ev: PointerEvent) => setPreview(compute(ev.clientX))
        const onUp = (ev: PointerEvent) => {
          commit(compute(ev.clientX))
          setPreview(null)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
    []
  )

  const onProgressPointerDown = startDrag(
    progressRef,
    setDragProgress,
    (frac) => seek(frac * duration)
  )
  const onVolumePointerDown = startDrag(
    volumeRef,
    setDragVolume,
    (frac) => setVolume(frac)
  )

  const onProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasTrack || duration <= 0) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      seek(Math.min(duration, position + 5))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      seek(Math.max(0, position - 5))
    }
  }
  const onVolumeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setVolume(Math.min(1, volume + 0.05))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setVolume(Math.max(0, volume - 0.05))
    }
  }

  const handleFavorite = useCallback(async () => {
    if (!currentTrack) return
    const nextFav = !currentTrack.favorite
    // 乐观更新：先改 store 内 currentTrack.favorite 快照，UI 立即反映。
    usePlayerStore.setState((s) =>
      s.currentTrack ? { currentTrack: { ...s.currentTrack, favorite: nextFav } } : {}
    )
    try {
      reportFavorite(currentTrack.id, nextFav)
    } catch (err) {
      console.warn('[player] 收藏上报失败', err)
    }
  }, [currentTrack])

  const cycleRepeat = useCallback(() => {
    const idx = REPEAT_CYCLE.indexOf(playMode.repeat)
    setRepeat(REPEAT_CYCLE[(idx + 1) % REPEAT_CYCLE.length])
  }, [playMode.repeat, setRepeat])

  const progressPct = dragProgress ?? (duration > 0 ? (position / duration) * 100 : 0)
  const volumePct = dragVolume ?? volume * 100
  const repeatActive = playMode.repeat !== 'off'

  return (
    <footer className="player-bar" aria-label={t('player.bar')}>
      {/* 左区：封面 + 曲目信息 + 收藏 */}
      <div className="player-track">
        {hasTrack ? (
          <div className="player-cover">
            <Cover coverId={currentTrack.coverId} size={64} className="cover--mini" />
            {playing && <Equalizer />}
          </div>
        ) : (
          <div className="cover cover--mini cover--placeholder">
            <Icon name="music-2" size={20} />
          </div>
        )}

        {hasTrack ? (
          <div className="player-copy">
            <button
              type="button"
              className="player-title"
              onClick={() => navigate(`/albums/${currentTrack.albumId}`)}
            >
              {currentTrack.title}
            </button>
            <div className="player-artist">
              {currentTrack.artistName} · {currentTrack.albumTitle}
            </div>
          </div>
        ) : (
          <div className="player-copy" />
        )}

        <button
          className={`icon-button player-like${currentTrack?.favorite ? ' is-favorite' : ''}`}
          type="button"
          aria-label={currentTrack?.favorite ? t('track.unfavorite') : t('track.favorite')}
          aria-pressed={currentTrack?.favorite ?? false}
          onClick={handleFavorite}
          disabled={!hasTrack}
        >
          <Icon name={currentTrack?.favorite ? 'heart--accent' : 'heart'} />
        </button>
      </div>

      {/* 中区：传输控件 + 进度条 */}
      <div className="player-center">
        <div className="transport">
          <button
            className={`icon-button${playMode.shuffle ? ' is-active' : ''}`}
            type="button"
            aria-label={t('player.shuffle')}
            aria-pressed={playMode.shuffle}
            onClick={() => setShuffle(!playMode.shuffle)}
            disabled={!hasTrack}
          >
            <Icon name="shuffle" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={t('player.previous')}
            onClick={previous}
            disabled={!hasTrack}
          >
            <Icon name="skip-back" />
          </button>
          <button
            className="player-button"
            type="button"
            aria-label={playing ? t('player.pause') : t('player.play')}
            onClick={togglePlay}
            disabled={!hasTrack}
          >
            <Icon name={playing ? 'pause--on-accent' : 'play--on-accent'} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={t('player.next')}
            onClick={next}
            disabled={!hasTrack}
          >
            <Icon name="skip-forward" />
          </button>
          <button
            className={`icon-button${repeatActive ? ' is-active' : ''}`}
            type="button"
            aria-label={repeatActive && playMode.repeat === 'one' ? t('player.repeatOne') : t('player.repeat')}
            aria-pressed={repeatActive}
            onClick={cycleRepeat}
            disabled={!hasTrack}
          >
            <Icon name="repeat" />
            {playMode.repeat === 'one' && <span className="repeat-one-badge">1</span>}
          </button>
        </div>

        <div className="scrub-row">
          <span className="numeric">{formatTime(position)}</span>
          <div
            ref={progressRef}
            className="progress-bar"
            role="slider"
            aria-label={t('player.progress')}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            aria-disabled={!hasTrack}
            tabIndex={hasTrack ? 0 : -1}
            onPointerDown={hasTrack ? onProgressPointerDown : undefined}
            onKeyDown={onProgressKeyDown}
          >
            <span className="progress-fill" style={{ width: `${progressPct}%` }} />
            <span className="progress-thumb" style={{ left: `${progressPct}%` }} />
          </div>
          <span className="numeric">{formatTime(duration)}</span>
        </div>
      </div>

      {/* 右区：队列按钮 + 音量 */}
      <div className="player-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={t('queue.open')}
          onClick={(e) => onToggleQueue?.(e.currentTarget)}
          disabled={!hasTrack}
        >
          <Icon name="list-music" />
        </button>
        <div className="volume-control">
          <button
            className="icon-button"
            type="button"
            aria-label={muted ? t('player.unmute') : t('player.mute')}
            onClick={toggleMute}
            disabled={!hasTrack}
          >
            <Icon name="volume-2" />
          </button>
          <div
            ref={volumeRef}
            className="volume-bar"
            role="slider"
            aria-label={t('player.volume')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(volumePct)}
            aria-disabled={!hasTrack}
            tabIndex={hasTrack ? 0 : -1}
            onPointerDown={hasTrack ? onVolumePointerDown : undefined}
            onKeyDown={onVolumeKeyDown}
          >
            <span className="volume-fill" style={{ width: `${volumePct}%` }} />
            <span className="volume-thumb" style={{ left: `${volumePct}%` }} />
          </div>
        </div>
      </div>
    </footer>
  )
}

export default PlayerBar
