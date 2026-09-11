import type { TrackRow } from '../../../shared/types'
import { usePlayerStore } from '../stores/playerStore'

/**
 * 播放接线（T5.6 接通）。
 *
 * 详情页「播放 / 随机播放」按钮、TrackList 双击整队，统一经此桥交给 playerStore。
 * 此处是播放域的唯一接线点：调用方（AlbumDetail / ArtistDetail / Songs / Albums 占位）
 * 只依赖本文件的 playContext / shuffleContext / shuffleTracks 三个纯函数，不直接 import
 * playerStore——未来若接线形态变化，改动收敛于此。
 *
 * 实现说明：playContext 直接转调 playerStore.loadContext(tracks, startIndex)（自管上下文整队
 * 入队并从 startIndex 播）；shuffleContext 先洗牌再 loadContext(…, 0)。签名与 playerStore
 * loadContext(tracks, startIndex) 对齐，调用方零改。
 */

/** 顺序播放：从 startIndex 起整队入队并播放（T5.6 接通 playerStore.loadContext）。 */
export function playContext(tracks: TrackRow[], startIndex = 0): void {
  usePlayerStore.getState().loadContext(tracks, startIndex)
}

/** 随机播放：洗牌后整队入队并播放（T5.6 接通 playerStore.loadContext(shuffle(tracks), 0)）。 */
export function shuffleContext(tracks: TrackRow[]): void {
  usePlayerStore.getState().loadContext(shuffleTracks(tracks), 0)
}

/** 纯函数：洗牌（Fisher–Yates）；AlbumDetail 随机播放复用此函数生成顺序。 */
export function shuffleTracks<T>(tracks: readonly T[]): T[] {
  const out = tracks.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
