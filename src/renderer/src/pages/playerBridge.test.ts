/**
 * playerBridge 单测（jsdom project，T5.6 接线）。
 *
 * 断言对象：playContext / shuffleContext 是 playerStore.loadContext 的唯一切换点——
 * 函数只转调 store，不再走占位 console.warn。测试通过 spy store 动作验证「确实调用
 * loadContext(tracks, startIndex)」且「shuffleContext 洗牌后从 0 播」，并保留 shuffleTracks
 * 纯函数（Fisher–Yates，去重原数组、输出为乱序排列）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackRow } from '../../../shared/types'
import { usePlayerStore } from '../stores/playerStore'
import { playContext, shuffleContext, shuffleTracks } from './playerBridge'

function makeTrack(id: string): TrackRow {
  return {
    id,
    title: `曲 ${id}`,
    artistId: 1,
    artistName: 'A',
    albumId: 1,
    albumTitle: 'Al',
    albumArtist: 'A',
    trackNumber: 1,
    discNumber: 1,
    year: 2000,
    genre: 'Pop',
    duration: 100,
    filePath: `D:/m/${id}.flac`,
    format: 'flac',
    bitrate: 1000,
    sampleRate: 96000,
    bitDepth: 24,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('playContext → store.loadContext', () => {
  it('转调 usePlayerStore.loadContext(tracks, startIndex)（不再占位于 console.warn）', () => {
    const spy = vi.spyOn(usePlayerStore.getState(), 'loadContext')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c')]
    playContext(tracks, 1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(tracks, 1)
    // 占位 console.warn 不复现（接线的核心验收：占位被移除）。
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('缺省 startIndex = 0', () => {
    const spy = vi.spyOn(usePlayerStore.getState(), 'loadContext')
    const tracks = [makeTrack('a')]
    playContext(tracks)
    expect(spy).toHaveBeenCalledWith(tracks, 0)
  })
})

describe('shuffleContext → store.loadContext(shuffle(tracks), 0)', () => {
  it('洗牌后从 0 播，且集合不变（不丢曲 / 不增曲）', () => {
    const spy = vi.spyOn(usePlayerStore.getState(), 'loadContext')
    const tracks = [makeTrack('a'), makeTrack('b'), makeTrack('c'), makeTrack('d')]
    shuffleContext(tracks)
    expect(spy).toHaveBeenCalledTimes(1)
    const [arg, start] = spy.mock.calls[0]
    expect(start).toBe(0)
    expect(arg).toHaveLength(tracks.length)
    // 集合一致性：id 多重集相同。
    expect([...arg].map((t) => t.id).sort()).toEqual(tracks.map((t) => t.id).sort())
  })
})

describe('shuffleTracks（纯函数，保留）', () => {
  it('不修改原数组、返回等长排列', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffleTracks(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // 原数组不变
    expect(out).toHaveLength(input.length)
    expect([...out].sort()).toEqual([...input].sort())
  })
})
