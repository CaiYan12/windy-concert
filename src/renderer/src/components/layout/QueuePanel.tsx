import type { ReactElement } from 'react'
import { useI18n } from '../../i18n'
import { Icon } from '../Icon'
import { Cover } from '../Cover'
import { useQueueView } from '../../stores/playerStore'
import type { TrackRow } from '../../../../shared/types'

/**
 * QueuePanel —— 播放队列面板（T5.5，结构对照 components.html QueuePanel 区 / mockup.css:1665-1763）。
 *
 * 三段结构（components.html 样本，标题文案逐字核对）：
 *   ① 正在播放（queue.nowPlaying）——当前曲行 .is-playing：标题走 --accent（CSS 着色文字）+
 *     music-2--accent 静态指示。裁定备注（2026-09-11）：design-plan §4.11 的「均衡器」在
 *     「唯一持续动画 = 全应用唯一」口径下已由播放栏（T5.4 Equalizer）占用，本面板**不引入
 *     第二无限动画**，以静态 --accent 指示替代；如需真动画走裁定流程。
 *   ② 下一首播放（queue.upNextUserQueue）——平行插队列表段（playerStore.userQueueIds 推导），
 *     每行 corner-down-right 标识（设计稿样本）。
 *   ③ 下次播放（queue.upNext）——queue.upNext 去掉插队段后的剩余；行尾为序号（numeric）。
 *     序号 = 插队段行数 + 段内序号 + 1，数值上恒等于该曲在 upNext 中的 1-based 位置
 *     （设计稿样本：1 首插队 + 1 首顺序 → 「02」，即 upNext 序、不含正在播放——评审 E.2 纠正：
 *     「全队列位置」口径被样本否决，此处留痕）。
 *
 * 0.1 只读（硬约束）：不渲染任何编辑 affordance（拖拽手柄/删除/清空/重排）——F5-4 禁区；
 *   行为纯展示 div（非 button），**不实现点击跳播**（0.1 计划未定义，只读口径从严，留痕）。
 *   唯一可交互元素 = 头部关闭按钮（aria-label=queue.close，可 Tab 到达）。
 *
 * 开合：面板常驻 DOM，关闭位由 shell.css 的 translateX(100%) 承担；展开位选择器为设计稿的
 *   `.queue-open .queue-panel`（状态类挂在 .app-shell 祖先，见 AppShell 留痕）。关闭态
 *   aria-hidden + inert（inert 防焦点 Tab 进屏外区域——关闭按钮现在可聚焦，占位期 disabled
 *   遮挡已不成立；React 19 原生支持 inert 布尔属性）。
 *
 * 空态：三段全空 → queue.empty 文案（无当前曲也无待播时整面板只渲染空态，不留壳）。
 */
export interface QueuePanelProps {
  /** 面板开合（AppShell 持有 UI 态；本组件只接受，不自持——开合入口在播放栏队列按钮）。 */
  open: boolean
  /** 关闭按钮回调（头部 x）。 */
  onClose: () => void
}

/** 行尾指示形态：playing = music-2--accent 静态指示；user-queue = 插队标识；rest = 序号。 */
type RowState = 'playing' | 'user-queue' | 'rest'

/** 行背景标尺注释：mockup 行网格 40px 封面 + 主文 + 22px 尾标（shell.css .queue-row）。 */
function QueueRow({
  track,
  state,
  position
}: {
  track: TrackRow
  state: RowState
  /** upNext 序（不含正在播放，1 起算；仅 rest 段用，渲染成两位 numeric）。 */
  position?: number
}): ReactElement {
  const { t } = useI18n()
  const rowClass =
    state === 'playing' ? 'queue-row is-playing' : state === 'user-queue' ? 'queue-row is-up-next' : 'queue-row'
  return (
    <div className={rowClass}>
      <Cover coverId={track.coverId} size={64} className="cover--table" />
      <div>
        <div className="queue-title">{track.title}</div>
        <div className="queue-artist">{track.artistName}</div>
      </div>
      {state === 'playing' && (
        <span className="queue-icon">
          <Icon name="music-2--accent" className="is-playing-icon" alt={t('queue.nowPlaying')} />
        </span>
      )}
      {state === 'user-queue' && (
        <span className="queue-icon">
          <Icon name="corner-down-right" />
        </span>
      )}
      {state === 'rest' && <span className="queue-icon numeric">{String(position ?? 0).padStart(2, '0')}</span>}
    </div>
  )
}

export function QueuePanel({ open, onClose }: QueuePanelProps): ReactElement {
  const { t } = useI18n()
  // T7.1 承接：改用 queueView 选择器——只订阅三段视图引用，不随 250ms position tick
  // 重渲整面板（见 playerStore.useQueueView 注释；渲染输出不变）。
  const queueView = useQueueView()
  const { current, upNextUserQueue, upNextRest } = queueView
  const empty = current === null && upNextUserQueue.length === 0 && upNextRest.length === 0

  return (
    <aside
      className="queue-panel"
      aria-label={t('queue.title')}
      // 仅关闭态输出（aria-hidden={false} 会渲染成 "false" 字面属性，无需存在）；
      // inert：关闭态阻断焦点进入（含关闭按钮），防「Tab 到屏外不可见控件」；React 19 布尔属性。
      aria-hidden={open ? undefined : true}
      inert={!open}
    >
      <div className="queue-head">
        <h2>{t('queue.title')}</h2>
        <button className="icon-button" type="button" aria-label={t('queue.close')} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="queue-scroll">
        {empty ? (
          <p className="muted">{t('queue.empty')}</p>
        ) : (
          <>
            {current !== null && (
              <section className="queue-section">
                <div className="queue-section-label">{t('queue.nowPlaying')}</div>
                <QueueRow track={current} state="playing" />
              </section>
            )}
            {upNextUserQueue.length > 0 && (
              <section className="queue-section">
                <div className="queue-section-label">{t('queue.upNextUserQueue')}</div>
                {upNextUserQueue.map((track) => (
                  <QueueRow key={track.id} track={track} state="user-queue" />
                ))}
              </section>
            )}
            {upNextRest.length > 0 && (
              <section className="queue-section">
                <div className="queue-section-label">{t('queue.upNext')}</div>
                {upNextRest.map((track, i) => (
                  <QueueRow
                    key={`${track.id}-${i}`}
                    track={track}
                    state="rest"
                    position={upNextUserQueue.length + i + 1}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

export default QueuePanel
