// T5.3 测试共享桩（仅供 *.test.ts 使用，非应用代码；不匹配 vitest include 的 *.test.ts 模式）。
// 形态对照 libraryStore.test.ts 的 api 桩 + 注入式 AudioElement 替身（jsdom 不创建真实媒体元素）。
import type { Settings, TrackRow } from '../../../shared/types';
import type { AudioElementLike } from './audioEngine';
import type { PlaybackApi } from './playbackService';

/** history/settings 调用记录（断言 §3.5c 时序顺序）。 */
export type HistoryCall =
  | { kind: 'recordPlay'; trackId: string }
  | {
      kind: 'updateOutcome';
      historyId: number;
      playedDuration?: number | null;
      completed?: boolean;
    };

export interface PlaybackApiHarness {
  api: PlaybackApi;
  /** history 通道调用（按时间顺序，断言「先结算后切歌」等次序）。 */
  calls: HistoryCall[];
  /** settings:set 收到的 partial（断言 debounce 后的单次写入）。 */
  settingsSets: Partial<Settings>[];
  settingsGets: number;
  /** 替换 recordPlay 实现（deferred 竞态用例）；默认立即回 historyId 递增。 */
  setRecordPlayImpl(impl: (trackId: string) => Promise<{ historyId: number }>): void;
}

export function makePlaybackApi(): PlaybackApiHarness {
  const calls: HistoryCall[] = [];
  const settingsSets: Partial<Settings>[] = [];
  let settingsGets = 0;
  let nextHistoryId = 100;
  let recordPlayImpl: (trackId: string) => Promise<{ historyId: number }> = () => {
    return Promise.resolve({ historyId: nextHistoryId++ });
  };
  const harness: PlaybackApiHarness = {
    calls,
    settingsSets,
    get settingsGets() {
      return settingsGets;
    },
    setRecordPlayImpl(impl) {
      recordPlayImpl = impl;
    },
    api: {
      history: {
        recordPlay: (trackId) => {
          calls.push({ kind: 'recordPlay', trackId });
          return recordPlayImpl(trackId);
        },
        updatePlayOutcome: (historyId, playedDuration, completed) => {
          calls.push({ kind: 'updateOutcome', historyId, playedDuration, completed });
          return Promise.resolve();
        },
      },
      settings: {
        get: () => {
          settingsGets += 1;
          return Promise.resolve<Settings>({
            language: 'zh-CN',
            autoScanOnStartup: true,
            volume: 0.8,
            muted: false,
          });
        },
        set: (partial) => {
          settingsSets.push(partial);
          return Promise.resolve<Settings>({
            language: 'zh-CN',
            autoScanOnStartup: true,
            volume: 0.8,
            muted: false,
            ...partial,
          });
        },
      },
    },
  };
  return harness;
}

/** 可手动派发事件的 <audio> 替身。 */
export class FakeAudioElement implements AudioElementLike {
  src = '';
  preload = '';
  currentTime = 0;
  duration = 0;
  volume = 1;
  muted = false;
  paused = true;
  crossOrigin: string | undefined; // AudioEngine 不得设置（留痕断言用）
  playCalls = 0;
  pauseCalls = 0;
  private listeners = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** 测试手动派发媒体事件（timeupdate/ended/loadedmetadata/error）。 */
  emit(type: string): void {
    this.listeners.get(type)?.forEach((cb) => cb());
  }
}

/** TrackRow 测试样本（形状对齐 shared/types.ts 全字段）。 */
export function makeTrack(id: string, overrides: Partial<TrackRow> = {}): TrackRow {
  return {
    id,
    title: `T${id}`,
    artistId: 1,
    artistName: 'Artist',
    albumId: 1,
    albumTitle: 'Album',
    albumArtist: 'Artist',
    trackNumber: 1,
    discNumber: 1,
    year: 2020,
    genre: 'Genre',
    duration: 100,
    filePath: `/music/${id}.flac`,
    format: 'flac',
    bitrate: 1000,
    sampleRate: 44100,
    bitDepth: 16,
    playable: true,
    status: 'available',
    coverId: null,
    favorite: false,
    playCount: 0,
    dateAdded: '2020-01-01T00:00:00Z',
    lastPlayedAt: null,
    favoritedAt: null,
    ...overrides,
  };
}

/** 微任务冲刷（recordPlay 的 .then 链落 historyId；fake timers 下不能用 setTimeout flush）。 */
export async function microflush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
