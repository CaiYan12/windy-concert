// T5.3 playerStore —— F4-2 播放状态集（zustand 单一状态源；T5.4 播放栏 / T5.5 队列面板 /
// T5.6 曲目接线只消费此 store，不触碰 AudioEngine/playbackService）。
//
// 设计留痕：
//   · 工厂 + 单例双形态：createPlayerStore(deps?) 注入 fake audio / fake api / fake queue 供
//     jsdom 单测（同 settingsStore 注入决定）；usePlayerStore 为应用单例（T5.6 playerBridge
//     唯一接线点，签名对齐 playerBridge.playContext(tracks, startIndex)，届时只换实现不改调用方）。
//   · F4-2 状态集（计划 T5.3 原文）：currentTrack/duration/position/playing/volume/muted/playMode。
//     paused 不单列——playing 取反即可（计划文本未列 paused，以计划为准）。
//   · position 经 timeupdate 250ms 节流（createThrottle，前沿立即 + 尾沿补发最后值），
//     避免 timeupdate 高频触发（浏览器约 4-66Hz）造成重渲染风暴。
//   · 上下文自管（self-managed context）：loadContext 存 TrackRow[] 于工厂闭包，队列只存 id；
//     trackId → TrackRow 解析经 resolve 注入 playbackService。
//   · 与 playbackService 分工：service 管计费与队列推进（§3.5c）；store 管 audio 事件接线与
//     zustand 状态。ended 事件由 store 订阅并调 service.handleEnded()，按返回的 AdvanceResult
//     同步状态——service 不反向依赖 store（依赖单向：store → service → audio/queue/api）。
//   · 音量/静音恢复：ensureVolumeRestored() 幂等读 settings:get（Settings.volume/muted 键
//     T3.4 key 清单已存在，无需扩展——留痕）；App 挂载时调用（T5.4+ 接线）。
//   · 层间约束（计划 679 行）：player/** 不得 import library/playlists 数据模块——曲目数据
//     全部经参数注入（loadContext(tracks) 由页面传入），本文件只依赖 shared 类型。
import { useSyncExternalStore } from 'react';
import { create, type StoreApi } from 'zustand';
import type { Settings, TrackRow } from '../../../shared/types';
import { createAudioEngine, type AudioEngine } from '../player/audioEngine';
import {
  createPlaybackService,
  type AdvanceResult,
  type PlaybackApi,
} from '../player/playbackService';
import { PlayQueue, type RepeatMode } from '../player/queue';

/** 本 store 用到的 api 能力面（结构性类型，同 libraryStore 留痕）。 */
export type PlayerApi = PlaybackApi;

function getDefaultApi(): PlayerApi | undefined {
  return (globalThis as unknown as { window?: { api?: PlayerApi } }).window?.api;
}

// ---------------------------------------------------------------------------
// position 250ms 节流（导出以便独立单测；前沿立即执行 + 尾沿补发最后值）
// ---------------------------------------------------------------------------

/** position 节流窗口（计划 T5.3 原文 250ms）。 */
export const POSITION_THROTTLE_MS = 250;

export interface ThrottleOpts {
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * 节流工厂：interval 窗口内首次调用立即执行（前沿），窗口内后续调用只刷新「待发值」，
 * 窗口结束时补发最后一次（尾沿）——保证停止触发后最终值不丢。
 */
export function createThrottle(
  intervalMs: number,
  opts: ThrottleOpts = {}
): (fn: () => void) => void {
  const now = opts.now ?? Date.now;
  const setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimeoutFn = opts.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let lastRun = -Infinity;
  let timer: unknown = null;
  let pending: (() => void) | null = null;

  return (fn: () => void): void => {
    pending = fn;
    const t = now();
    if (t - lastRun >= intervalMs) {
      if (timer !== null) {
        clearTimeoutFn(timer); // 前沿触发时取消已排队的尾沿（本次即最新值）
        timer = null;
      }
      lastRun = t;
      const run = pending;
      pending = null;
      run();
    } else if (timer === null) {
      timer = setTimeoutFn(() => {
        timer = null;
        lastRun = now();
        const run = pending;
        pending = null;
        if (run) run();
      }, intervalMs - (t - lastRun));
    }
  };
}

// ---------------------------------------------------------------------------
// 状态形态（F4-2）
// ---------------------------------------------------------------------------

export interface PlayModeState {
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface PlayerState {
  currentTrack: TrackRow | null;
  duration: number;
  position: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  playMode: PlayModeState;
  /** 上下文整队入队并从 startIndex 播（存 TrackRow[] + queue.loadContext(ids) + 播首曲）。 */
  loadContext(tracks: TrackRow[], startIndex?: number): void;
  /** 播放/暂停；暂停恢复零 IPC（口径 2.1-1）。无 currentTrack 时空操作。 */
  togglePlay(): void;
  next(): void;
  previous(): void;
  /** 停止：playing=false、position 归零、队列保留。 */
  stop(): void;
  /** 拖动进度条：只动 audio 与 position 状态，零 IPC。 */
  seek(t: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  setShuffle(on: boolean): void;
  setRepeat(mode: RepeatMode): void;
  /** 启动恢复音量/静音（幂等）；失败静默保留默认值。App 挂载时调用。 */
  ensureVolumeRestored(): Promise<void>;
}

export interface CreatePlayerStoreDeps {
  audio?: AudioEngine;
  queue?: PlayQueue;
  /** 惰性取 api；缺省读 globalThis.window?.api（同 libraryStore）。 */
  getApi?: () => PlayerApi | undefined;
}

/** 音量初始值：与主进程 Settings 默认值一致（T3.4 DEFAULT_SETTINGS.volume），恢复前先行生效。 */
const DEFAULT_VOLUME = 0.8;

function applyAdvance(store: StoreApi<PlayerState>, result: AdvanceResult): void {
  if (result.type === 'started') {
    store.setState({ currentTrack: result.track, playing: true, position: 0, duration: 0 });
  } else if (result.type === 'restarted') {
    store.setState({ playing: true, position: 0 });
  } else {
    // stopped：队列播完——playing=false、position 归零，队列与 currentTrack 保留。
    store.setState({ playing: false, position: 0 });
  }
}

export function createPlayerStore(deps: CreatePlayerStoreDeps = {}): StoreApi<PlayerState> {
  const audio = deps.audio ?? createAudioEngine();
  const getApi = deps.getApi ?? getDefaultApi;
  const queue = deps.queue ?? new PlayQueue();

  // 上下文自管：队列只存 id，TrackRow 原表存闭包（self-managed context，留痕见文件头）。
  let contextTracks: TrackRow[] = [];
  const resolve = (trackId: string): TrackRow | null =>
    contextTracks.find((t) => t.id === trackId) ?? null;

  const service = createPlaybackService({ audio, getApi, queue, resolve });

  // 音量恢复幂等标记（启动恢复只做一次；恢复后用户调整经 setVolume/toggleMute 正常持久化）。
  let volumeRestored = false;

  const store = create<PlayerState>()((set, get) => ({
    currentTrack: null,
    duration: 0,
    position: 0,
    playing: false,
    volume: DEFAULT_VOLUME,
    muted: false,
    playMode: { shuffle: queue.shuffle, repeat: queue.repeat },

    loadContext(tracks, startIndex = 0) {
      contextTracks = [...tracks];
      queue.loadContext(
        tracks.map((t) => t.id),
        startIndex
      );
      const first = queue.current === null ? null : resolve(queue.current);
      if (!first) {
        // 空上下文（T5.3 评审 I1 修复）：先走 service.stop()——按 §3.5c「手动切歌/停止先结算」
        // 口径结算旧会话（completed:0）并暂停 audio；此前只清 zustand 状态，导致切空上下文后
        // 声音继续、旧会话被随后的 ended 错记为播完。之后清播放态，不动音量等设置。
        service.stop();
        set({ currentTrack: null, playing: false, position: 0, duration: 0 });
        return;
      }
      set({ currentTrack: first, playing: true, position: 0, duration: 0 });
      // manual=true：若上一上下文仍在播，先按 completed:0 结算再换曲（手动切歌口径）。
      service.playTrack(first, true);
    },

    togglePlay() {
      const { currentTrack, playing } = get();
      if (!currentTrack) return; // 无曲目可播：空操作（T5.4 播放栏按钮空态语义）
      if (playing) {
        audio.pause();
        set({ playing: false });
      } else {
        void audio.play().catch((err: unknown) => console.warn('[player] 播放失败', err));
        set({ playing: true });
      }
      // 暂停恢复零 IPC（口径 2.1-1）
    },

    next() {
      applyAdvance(store, service.next());
    },

    previous() {
      applyAdvance(store, service.previous());
    },

    stop() {
      service.stop();
      set({ playing: false, position: 0 });
    },

    seek(t) {
      audio.seek(t); // 拖动进度条零 IPC
      set({ position: t });
    },

    setVolume(v) {
      service.setVolume(v); // audio 立即生效 + 500ms debounce 持久化（service 内）
      set({ volume: Math.min(1, Math.max(0, v)) });
    },

    toggleMute() {
      service.toggleMute(); // audio 立即生效 + muted 即时持久化
      set({ muted: audio.muted });
    },

    setShuffle(on) {
      queue.setShuffle(on);
      set({ playMode: { shuffle: queue.shuffle, repeat: queue.repeat } });
    },

    setRepeat(mode) {
      queue.setRepeat(mode);
      set({ playMode: { shuffle: queue.shuffle, repeat: queue.repeat } });
    },

    async ensureVolumeRestored() {
      if (volumeRestored) return; // 幂等（测试锚定：重复调用只读一次 settings:get）
      const api = getApi();
      if (!api) return; // preload 未就绪 / 测试未注入：静默跳过（同 libraryStore 留痕）
      volumeRestored = true; // 先置位：失败也不重试（下次启动再恢复，避免启动期反复拉取）
      try {
        const s: Settings = await api.settings.get();
        audio.setVolume(s.volume);
        audio.setMuted(s.muted);
        set({ volume: s.volume, muted: s.muted });
      } catch (err) {
        console.warn('[player] 音量恢复失败', err);
      }
    },
  }));

  // ----- audio 事件接线（store 订阅；ended 链经 service 返回值同步状态，见文件头分工留痕）-----
  const emitPosition = createThrottle(POSITION_THROTTLE_MS);
  const unsubscribers: Array<() => void> = [
    audio.on('timeupdate', () => {
      const pos = audio.currentTime;
      emitPosition(() => store.setState({ position: pos }));
    }),
    audio.on('loadedmetadata', () => {
      store.setState({ duration: audio.duration });
    }),
    audio.on('ended', () => {
      applyAdvance(store, service.handleEnded());
    }),
  ];
  // 订阅与 store 同生命周期（工厂私有实例，无全局泄漏）；句柄保留以防后续需要（如 dispose）。
  void unsubscribers;

  return store;
}

/** 应用单例：T5.6 playerBridge / T5.4 播放栏 / T5.5 队列面板的唯一消费入口。 */
export const usePlayerStore = createPlayerStore();

// ---------------------------------------------------------------------------
// 组件入口（useSyncExternalStore 适配，同 useLibrary 形态：显式 getState() 快照）
// ---------------------------------------------------------------------------

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    usePlayerStore.subscribe,
    usePlayerStore.getState,
    usePlayerStore.getState
  );
}
