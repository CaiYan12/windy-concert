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
//     T3.4 key 清单已存在，无需扩展——留痕）；**T6.0 接线**：AppShell 挂载 effect 调一次
//     （同 Sidebar ensureStatsLoaded 形态；App.tsx 按 T4.1 定位为纯路由出口、不持业务副作用，
//     故落 AppShell 壳层，留痕）。幂等守卫在 await 前先置位 volumeRestored=true，StrictMode
//     开发态 effect 双调用不会重复请求 settings:get。
//   · T6.0 audio error 链：订阅 audio 的 'error' 事件（此前 AudioEventType 已声明、渲染层零订阅
//     ——播放损坏/解码失败文件时 recordPlay 已 fire（假计费）+ playing 乐观置位无回退 + 进度冻结，
//     仅手动 next 可解）。处理：service.handleError() 结算当前会话（completed:0 / playedDuration:0）
//     并暂停 → 本层依 failed 结果置 playing=false（不推进队列、不自动跳下一首）→ 经
//     toastStore.showToast 提示「无法播放该文件」（player.playFailed）。**取舍留痕**：store 直接
//     引 toastStore 为单向依赖（playerStore → toastStore，后者无依赖叶子，无环）——toastStore 的
//     「与播放域解耦」指不复用播放状态，不禁止单向通知；且页面层（Songs/AlbumDetail/ArtistDetail）
//     已有 useToastStore.getState().showToast(t(...)) 先例，形态一致。i18n 用模块级 t()（读当前
//     资源快照，错误发生在资源就绪后）。
//   · 层间约束（计划 679 行）：player/** 不得 import library/playlists 数据模块——曲目数据
//     全部经参数注入（loadContext(tracks) 由页面传入），本文件只依赖 shared 类型。
//   · T5.5 平行插队列表（用户裁定 2026-09-11）：queue.ts §3.5b 逐字冻结，order 中无法区分
//     「插队曲」与「顺序曲」，故插队意图在本层以 userQueueIds 平行记录（playNext 语义序）。
//     维护规则：
//       a) 播放推进（ended / 手动 next/previous）换到某曲时，该曲若在列表中则移除（播过即
//          离开「下一首播放」段）；restarted（repeat-one / 队首重启）不换曲，不消费；
//       b) loadContext 新上下文整体清空；
//       c) shuffle 开关不动列表——它是「用户意图序」，渲染时与 queue.upNext 求交过滤，
//          已不在 upNext 中的 id 丢弃（裁定原文：shuffle 下不依赖差集推断）；
//       d) 列表只记 playNext：enqueue 尾插曲在视觉上与顺序曲无差别（同在「下次播放」段尾），
//          两动作语义区分留给 T5.6 右键菜单，视图层无需区分。
//     层位取舍：记在 store 层而非 service——service 职责是计费与队列推进（§3.5c），插队意图
//     属 UI 视图状态；store 本就持有 queue 闭包与上下文 TrackRow[]，推进事件（applyAdvance）
//     也只在 store 侧可见，消费钩子天然落位。
import { useSyncExternalStore } from 'react';
import { create, type StoreApi } from 'zustand';
import type { Settings, TrackRow } from '../../../shared/types';
import { t } from '../i18n';
import { createAudioEngine, type AudioEngine } from '../player/audioEngine';
import {
  createPlaybackService,
  type AdvanceResult,
  type PlaybackApi,
} from '../player/playbackService';
import { PlayQueue, type RepeatMode } from '../player/queue';
import { useToastStore } from './toastStore';

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

/**
 * T5.5 队列面板三段视图数据（正在播放 / 下一首播放(插队) / 下次播放）。
 * 由 createPlayerStore 闭包内的 queue + userQueueIds + contextTracks 推导，
 * 在每次队列/推进相关状态变更时重算并写入 zustand（queueView 键）。
 */
export interface QueueView {
  /** 正在播放段（queue.current 解析；无会话为 null）。 */
  current: TrackRow | null;
  /** 下一首播放段：userQueueIds（用户插队意图序）∩ queue.upNext，按插队序。 */
  upNextUserQueue: TrackRow[];
  /** 下次播放段：queue.upNext 去掉插队段后的剩余（顺序曲 + 尾插曲，视觉无差别）。 */
  upNextRest: TrackRow[];
}

export interface PlayerState {
  currentTrack: TrackRow | null;
  duration: number;
  position: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  playMode: PlayModeState;
  /** T5.5 队列面板三段视图（正在播放/下一首播放(插队)/下次播放），见 QueueView。 */
  queueView: QueueView;
  /** 上下文整队入队并从 startIndex 播（存 TrackRow[] + queue.loadContext(ids) + 播首曲）。 */
  loadContext(tracks: TrackRow[], startIndex?: number): void;
  /** T5.5 插队（T5.6 右键菜单「下一首播放」接线）：queue.playNext + 平行列表登记。 */
  playNext(track: TrackRow): void;
  /** T5.5 尾插（T5.6 右键菜单接线）：queue.enqueue；视觉上与顺序曲无差别，不进平行列表。 */
  enqueue(track: TrackRow): void;
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
  } else if (result.type === 'failed') {
    // T6.0：播放失败——停播但保留 currentTrack 与 position（进度冻结语义），仅置 playing=false。
    // 不推进队列、不动 queueView.current（队列保留，交用户手动 next）。
    store.setState({ playing: false });
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

  // T5.5 平行插队列表（维护规则见文件头裁定留痕）：只记 playNext 的 trackId，按插队序。
  let userQueueIds: string[] = [];

  /**
   * 三段视图推导（T5.5）。resolve 不到的 id（上下文与队列失配的防御路径）从视图丢弃并
   * console.warn 留痕——宁可少显示一行也不渲染假数据；正常路径 playNext/enqueue 会把
   * TrackRow 补进 contextTracks，不会走到该分支。
   */
  function computeQueueView(): QueueView {
    const current = queue.current === null ? null : resolve(queue.current);
    const upNext = queue.upNext;
    const upNextSet = new Set(upNext);
    const userQueueRows: TrackRow[] = [];
    const seen = new Set<string>();
    for (const id of userQueueIds) {
      if (seen.has(id)) continue; // 同曲重复插队：视图去重（queue 冻结语义允许 order 重复，留痕）
      seen.add(id);
      if (!upNextSet.has(id)) continue; // 已被播过/已随 loadContext 清走：求交过滤（裁定 d)
      const row = resolve(id);
      if (row) userQueueRows.push(row);
      else console.warn('[player] 插队列表中的曲目解析不到，已从队列面板丢弃', id);
    }
    // 插队段显示序与 queue 真实顺序一致：queue.playNext 是「插到当前曲后」，后插的先播，
    // 故按 upNext 中的位置排序渲染（userQueueIds 的 push 序只是意图登记序，不作显示序）。
    userQueueRows.sort((a, b) => upNext.indexOf(a.id) - upNext.indexOf(b.id));
    const userQueueIdSet = new Set(userQueueRows.map((t) => t.id));
    const rest: TrackRow[] = [];
    for (const id of upNext) {
      if (userQueueIdSet.has(id)) continue;
      const row = resolve(id);
      if (row) rest.push(row);
      else console.warn('[player] 队列中的曲目解析不到，已从队列面板丢弃', id);
    }
    return { current, upNextUserQueue: userQueueRows, upNextRest: rest };
  }

  /** T5.5 推进统一尾段：applyAdvance 同步播放态 → 消费插队列表 → 重算队列视图。
   *  换曲即消费（裁定 a)/b)）：ended 推进与手动 next/previous 走同一出口；
   *  restarted（repeat-one / 队首重启）不换曲，不消费；stopped 队列不变，重算幂等。 */
  function advanceWithView(result: AdvanceResult): void {
    applyAdvance(store, result);
    if (result.type === 'started') {
      const idx = userQueueIds.indexOf(result.track.id);
      if (idx !== -1) userQueueIds.splice(idx, 1); // 播过即离开插队段；previous 回跳不回填
    }
    store.setState({ queueView: computeQueueView() });
  }

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
    queueView: { current: null, upNextUserQueue: [], upNextRest: [] },

    loadContext(tracks, startIndex = 0) {
      contextTracks = [...tracks];
      // T5.5：新上下文 = 平行插队列表整体清空（裁定 c)）。
      userQueueIds = [];
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
        set({ queueView: computeQueueView() });
        return;
      }
      set({ currentTrack: first, playing: true, position: 0, duration: 0 });
      // manual=true：若上一上下文仍在播，先按 completed:0 结算再换曲（手动切歌口径）。
      service.playTrack(first, true);
      set({ queueView: computeQueueView() });
    },

    playNext(track) {
      queue.playNext(track.id);
      // 平行列表去重：同曲重复插队不再登记（视图去重兜底之外从源头保证一次意图一条记录）；
      // queue.playNext 冻结语义原样调用（order 中出现两份，视图只显示插队段一份，留痕）。
      if (!userQueueIds.includes(track.id)) userQueueIds.push(track.id);
      // 上下文外的曲目（如跨专辑右键）补进 TrackRow 原表：保证 resolve 与后续播放可解析。
      if (!contextTracks.some((t) => t.id === track.id)) contextTracks.push(track);
      set({ queueView: computeQueueView() });
    },

    enqueue(track) {
      queue.enqueue(track.id);
      // 尾插曲不进平行列表（裁定 d)：与顺序曲在「下次播放」段尾视觉无差别。
      if (!contextTracks.some((t) => t.id === track.id)) contextTracks.push(track);
      set({ queueView: computeQueueView() });
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
      advanceWithView(service.next());
    },

    previous() {
      advanceWithView(service.previous());
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
      // T5.5：shuffle 只重排 queue.order，「下一首播放」段的剩余曲目顺序跟随 upNext 变化，
      // 平行列表内容不动（裁定 c)）——视图重算时求交过滤。
      set({ queueView: computeQueueView() });
    },

    setRepeat(mode) {
      queue.setRepeat(mode);
      // repeat 不改变 order/current，队列视图无需重算（留痕）。
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
      advanceWithView(service.handleEnded());
    }),
    audio.on('error', () => {
      // T6.0 audio error 链：解码失败/取流失效 → service 结算会话（completed:0/playedDuration:0）
      // 并暂停 → failed 结果置 playing=false（不推进队列）→ toast 提示。error 事件无载荷可用
      // （AudioElementLike 的 listener 签名 () => void，也不读 MediaError 细节——文案统一）。
      const result = service.handleError();
      advanceWithView(result);
      if (result.type === 'failed') {
        useToastStore.getState().showToast(t('player.playFailed'));
      }
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

/**
 * T5.7 缺口②：当前播放曲目 id 选择器（曲目表 C1 accent 接线用）。
 * 经 useSyncExternalStore 订阅，但只返回原始值（string | undefined），故仅当 currentTrack.id
 * 变化时才触发消费页（Songs / AlbumDetail / ArtistDetail）重渲染——不随 position 节流
 * 刷新（每 250ms）重渲整张曲目表（对照 usePlayer() 返回整态、会随每个字段变更重渲）。
 * 无当前曲目时返回 undefined（对齐 TrackListProps.playingTrackId 可选形态：缺省不渲染播放行）。
 * getServerSnapshot 与 getSnapshot 一致（同 usePlayer 留痕：显式 getState() 保证 node 可测）。
 */
export function usePlayingTrackId(): string | undefined {
  const selector = (): string | undefined => usePlayerStore.getState().currentTrack?.id ?? undefined
  return useSyncExternalStore(usePlayerStore.subscribe, selector, selector);
}
