import type { TrackRow } from '../../../shared/types'

/**
 * 播放接线占位（T4.4 → T5.6）。
 *
 * 详情页「播放 / 随机播放」按钮需要把曲目数组交给 playerStore 的 loadContext 入队播放，
 * 但 playerStore 属 T5.6，本任务不越界创建。此处挂占位函数并集中留痕，作为 T5.6 接线的
 * 唯一切换点：届时把 playContext / shuffleContext 改为调用 playerStore.playContext（洗牌后入队）。
 *
 * 注意：函数签名与未来 playerStore.loadContext(tracks, startIndex) 对齐，便于直接替换实现，
 * 调用方无需改动。
 */

/** 顺序播放：从 startIndex 起整队入队（T5.6 接通 playerStore.loadContext）。 */
export function playContext(_tracks: TrackRow[], _startIndex = 0): void {
  console.warn('[playerBridge] playContext 占位：playerStore 尚未接通（T5.6）')
}

/** 随机播放：洗牌后整队入队（T5.6 接通 playerStore.loadContext(shuffle(tracks), 0)）。 */
export function shuffleContext(_tracks: TrackRow[]): void {
  console.warn('[playerBridge] shuffleContext 占位：playerStore 尚未接通（T5.6）')
}

/** 纯函数：洗牌（Fisher–Yates）；T5.6 接通前 AlbumDetail 随机播放复用此函数生成顺序。 */
export function shuffleTracks<T>(tracks: readonly T[]): T[] {
  const out = tracks.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
