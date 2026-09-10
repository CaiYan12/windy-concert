import type { ReactElement } from 'react'
import { useI18n } from '../../i18n'
import { Icon } from '../Icon'

/**
 * PlayerBar —— 播放栏占位（T4.1，结构对照 mockups/Songs.html:203-224 / mockup.css:1765-1942）。
 *
 * 占位约定（任务书）：控件全部 disabled、**不渲染任何假数据**——
 *   · 左区无曲目信息（.player-copy 留空，不写占位曲名/艺术家）；封面用中性占位封面 + music-2；
 *   · 进度条与音量条只渲染轨道（--bg-input），不渲染 mockup.css:1877-1890 的 36% 假填充与滑块；
 *   · 时间标签用设计稿既有的「缺失值」符号「—」（不伪造 0:00/时长）。
 * 真实状态（currentTrack/position/volume/playMode）与交互属 T5.4；disabled 视觉见 shell.css
 * （设计稿未定义 disabled 按钮样式，占位期以 tokens 既有 --text-disabled 语义表达）。
 */
export function PlayerBar(): ReactElement {
  const { t } = useI18n()
  return (
    <footer className="player-bar" aria-label={t('player.bar')}>
      <div className="player-track">
        <div className="cover cover--mini cover--placeholder">
          <Icon name="music-2" size={20} />
        </div>
        <div className="player-copy" />
        <button
          className="icon-button player-like"
          type="button"
          aria-label={t('track.favorite')}
          disabled
        >
          <Icon name="heart" />
        </button>
      </div>

      <div className="player-center">
        <div className="transport">
          <button className="icon-button" type="button" aria-label={t('player.shuffle')} disabled>
            <Icon name="shuffle" />
          </button>
          <button className="icon-button" type="button" aria-label={t('player.previous')} disabled>
            <Icon name="skip-back" />
          </button>
          <button className="player-button" type="button" aria-label={t('player.play')} disabled>
            <Icon name="play--on-accent" />
          </button>
          <button className="icon-button" type="button" aria-label={t('player.next')} disabled>
            <Icon name="skip-forward" />
          </button>
          <button className="icon-button" type="button" aria-label={t('player.repeat')} disabled>
            <Icon name="repeat" />
          </button>
        </div>
        <div className="scrub-row">
          <span className="numeric">—</span>
          {/* M5（T4.1 评审）：占位期无进度值，去掉 aria-valuenow——此前硬写 0 会让 AT 宣读「进度 0%」，
              与「不伪造 0:00/时长」的占位立场矛盾。保留 role/label/min/max 与 aria-disabled，
              T5.4 接入真实 position 后再补 aria-valuenow。 */}
          <div
            className="progress-bar"
            role="slider"
            aria-label={t('player.progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-disabled="true"
          />
          <span className="numeric">—</span>
        </div>
      </div>

      <div className="player-actions">
        <button className="icon-button" type="button" aria-label={t('queue.open')} disabled>
          <Icon name="list-music" />
        </button>
        <div className="volume-control">
          <button className="icon-button" type="button" aria-label={t('player.mute')} disabled>
            <Icon name="volume-2" />
          </button>
          {/* M5：同进度条，占位期不声明 aria-valuenow（避免宣读「音量 0%」）。 */}
          <div
            className="volume-bar"
            role="slider"
            aria-label={t('player.volume')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-disabled="true"
          />
        </div>
      </div>
    </footer>
  )
}

export default PlayerBar
