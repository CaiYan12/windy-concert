// T5.3 playbackService —— §3.5c 播放计数时序（F7-1）的唯一落点：负责「计费」（recordPlay /
// updatePlayOutcome）与队列推进，不持有渲染状态（zustand 状态归 playerStore）。
//
// 设计留痕：
//   · 计费口径（CONTEXT.md 既有约定）：播放过一次 = loadTrack 即计——recordPlay 在 loadTrack
//     内同步发起（fire-and-forget），不等待播放完成；返回的 historyId 异步落「会话」。
//   · §3.5c 逐字时序（计划 465-476 行）：
//       loadTrack(trackId)：仅当 trackId !== currentTrackId 时执行——
//         1. audio.src = wc-file://<encodeURIComponent(filePath)>
//         2. ipc history:recordPlay(trackId) → 返回 historyId 存入会话
//         3. currentTrackId = trackId
//       onended：updatePlayOutcome(historyId, {playedDuration: duration, completed: 1})
//         → queue.next()，null 则 stop()
//       手动切歌/停止：先 updatePlayOutcome(historyId, {playedDuration: currentTime, completed: 0})
//       暂停恢复、拖动进度条：不触发任何 IPC（口径 2.1-1）
//     payload 类型以 IPC 契约为准（shared/ipc.ts）：completed 传 boolean（契约原文即 boolean，
//     §3.5c 文字写 1/0 是 SQL 列语义，不改变 payload 形状）。
//   · 同曲守卫双保险：currentTrackId 相同的 loadTrack 整体 no-op（不结算、不换源、不 recordPlay）
//     ——手动点击正在播放的曲目不是「切歌」，不得把仍在进行的会话提前结算。
//   · 会话序号防竞态：recordPlay 是异步往返，快速切歌时旧请求晚到不得污染新会话的 historyId。
//   · repeat='one' 的 ended：queue.next() 返回当前曲（queue.ts 冻结语义）→ seek(0) 重播，
//     不再次 recordPlay（重播不是新「播放过一次」）；上一会话已按 completed 结算。
//   · 队首 previous：queue.previous() 返回当前曲（重启语义）→ 同 repeat-one，不结算不重计
//     （会话延续，ended 时按 completed 落账）。
//   · 音量持久化：debounce 500ms（计划 T5.3 原文）调 settings:set；计时器经 deps 可注入
//     （测试 vi.useFakeTimers 直接驱动全局 setTimeout 亦可）。muted 即时持久化（计划只约定
//     volume 的 debounce 持久化；muted 是离散开关且 Settings.muted 键 T3.4 已存在——
//     不持久化则重启后静音态丢失，属实现取舍留痕）。
//   · T6.0 audio error 链（跨任务系统性缺口，用户备案裁定 2026-09-11）：handleError() =
//     结算当前会话 settleOutcome(0, false)（即 updatePlayOutcome(historyId, 0, false)）后暂停
//     audio，返回 { type: 'failed', track }。**不回冲 playCount**——CONTEXT.md「播放过一次 =
//     loadTrack 即计」锚在 loadTrack，error 不走递减 IPC（playCount 只加不减）；**不自动跳
//     下一首**（避免坏文件连跳风暴，交用户手动 next）。audio error 事件的订阅点仍留在
//     playerStore（与 ended 同形：store 订阅 → 调 service.handleError() → 依返回结果同步状态），
//     保持「store → service → audio」单向依赖，service 不反向依赖 store（差于任务原文
//     「service 订阅」的字面写法，为架构一致性取舍，留痕）。
//   · api 经 getApi() 惰性注入（同 libraryStore 惰性 getApi 模式）：单例创建时机早于首次 IPC，
//     测试可逐用例换桩；api 缺失（preload 未就绪）时计费静默跳过并 warn，不阻塞播放。
import type { Settings, TrackRow } from '../../../shared/types';
import type { AudioEngine } from './audioEngine';
import { buildAudioSrc } from './audioEngine';
import type { PlayQueue } from './queue';

/** 本服务用到的 api 能力面（结构性类型，不 import preload 具体导出——同 libraryStore 留痕）。 */
export interface PlaybackApi {
  history: {
    recordPlay(trackId: string): Promise<{ historyId: number }>;
    updatePlayOutcome(
      historyId: number,
      playedDuration?: number | null,
      completed?: boolean
    ): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    set(partial: Partial<Settings>): Promise<Settings>;
  };
}

/** 计时器注入口（默认全局 setTimeout/clearTimeout；测试可用 fake timers 或自注入）。 */
export interface PlaybackTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** 队列推进结果（playerStore 据此同步 zustand 状态；service 自身不触碰 store）。 */
export type AdvanceResult =
  | { type: 'started'; track: TrackRow } // 换源并起播新曲（已 recordPlay）
  | { type: 'restarted' } // 同曲重启（repeat-one ended / 队首 previous），无新计费
  | { type: 'stopped' } // 队列播完（null）或解析失败，播放停止
  | { type: 'failed'; track: TrackRow }; // T6.0：audio error（解码/取流失效），会话已结算

export interface PlaybackService {
  /** 当前会话曲目 id（null = 无会话）。 */
  readonly currentTrackId: string | null;
  /**
   * 播放指定曲目（§3.5c loadTrack）。manual=true（默认）时先按 completed:0 结算进行中的会话
   * （「手动切歌」前置结算）；同曲 no-op（见文件头守卫留痕）。
   */
  playTrack(track: TrackRow, manual?: boolean): void;
  /** audio ended 链（§3.5c onended）：completed 结算 → queue.next() → 推进/停止。 */
  handleEnded(): AdvanceResult;
  /**
   * T6.0 audio error 链：结算当前会话（completed:0 / playedDuration:0）→ 暂停 audio →
   * 返回 failed（无会话时返回 stopped）。不回冲 playCount、不推进队列（口径见文件头）。
   */
  handleError(): AdvanceResult;
  /** 手动下一首：completed:0 前置结算 → queue.next()。 */
  next(): AdvanceResult;
  /** 手动上一首：换曲则 completed:0 前置结算；队首重启同曲不结算（留痕见文件头）。 */
  previous(): AdvanceResult;
  /** 停止：completed:0 结算 + 暂停 + 位置归零；队列保留（队列状态归 queue 实例）。 */
  stop(): void;
  /** 拖动进度条：只动 audio，零 IPC（口径 2.1-1）。 */
  seek(t: number): void;
  /** 设音量：立即生效到 audio；持久化经 500ms debounce 调 settings:set。 */
  setVolume(v: number): void;
  /** 切静音：立即生效；muted 即时持久化（取舍留痕见文件头）。 */
  toggleMute(): void;
  /** 立即落盘挂起的 volume（放弃 debounce 等待；测试/退出前冲刷用）。 */
  flushVolumeSave(): void;
}

export interface CreatePlaybackServiceDeps {
  audio: AudioEngine;
  /** 惰性取 api（同 libraryStore getApi 模式：每次 IPC 点现取，测试可逐用例换桩）。 */
  getApi: () => PlaybackApi | undefined;
  queue: PlayQueue;
  /** trackId → TrackRow 解析（队列只存 id；上下文 TrackRow[] 由 playerStore 持有）。 */
  resolve: (trackId: string) => TrackRow | null;
  timers?: PlaybackTimers;
}

/** 音量持久化 debounce 窗口（计划 T5.3 原文 500ms）。 */
export const VOLUME_SAVE_DEBOUNCE_MS = 500;

export function createPlaybackService(deps: CreatePlaybackServiceDeps): PlaybackService {
  const { audio, getApi, queue, resolve } = deps;
  const timers: PlaybackTimers = deps.timers ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };

  let currentTrackId: string | null = null;
  let historyId: number | null = null;
  // 会话序号：每次 startTrack 递增；recordPlay 晚到时序号不符则丢弃（快速切歌防竞态）。
  let sessionSeq = 0;

  // ----- 音量持久化 debounce（500ms 尾沿触发，只发最后一次值）-----
  let volumeSaveTimer: unknown = null;
  let pendingVolume: number | null = null;

  function scheduleVolumeSave(v: number): void {
    pendingVolume = v;
    if (volumeSaveTimer !== null) timers.clearTimeout(volumeSaveTimer);
    volumeSaveTimer = timers.setTimeout(() => {
      volumeSaveTimer = null;
      flushVolumeSave();
    }, VOLUME_SAVE_DEBOUNCE_MS);
  }

  function flushVolumeSave(): void {
    if (volumeSaveTimer !== null) {
      timers.clearTimeout(volumeSaveTimer);
      volumeSaveTimer = null;
    }
    const v = pendingVolume;
    pendingVolume = null;
    if (v === null) return;
    void getApi()
      ?.settings.set({ volume: v })
      .catch((err: unknown) => console.warn('[playback] 音量持久化失败', err));
  }

  /** 结算当前会话（幂等：historyId 即刻清空，重复调用/无会话均为 no-op）。 */
  function settleOutcome(playedDuration: number, completed: boolean): void {
    const id = historyId;
    historyId = null;
    if (id === null) return;
    void getApi()
      ?.history.updatePlayOutcome(id, playedDuration, completed)
      .catch((err: unknown) => console.warn('[playback] 播放结果上报失败', err));
  }

  /** §3.5c loadTrack 主体（已过同曲守卫）：1. 换源 2. recordPlay 3. currentTrackId。 */
  function startTrack(track: TrackRow): void {
    audio.load(buildAudioSrc(track.filePath)); // 第 1 步
    const session = ++sessionSeq;
    // 第 2 步：同步发起，不等待播放完成（计费口径：loadTrack 即计）；historyId 异步入会话。
    void getApi()
      ?.history.recordPlay(track.id)
      .then((r) => {
        // 晚到守卫：仅当仍是本曲目、本会话时采纳返回的 historyId。
        if (session === sessionSeq && currentTrackId === track.id) {
          historyId = r.historyId;
        }
      })
      .catch((err: unknown) => console.warn('[playback] recordPlay 失败', err));
    currentTrackId = track.id; // 第 3 步
    void audio.play().catch((err: unknown) => console.warn('[playback] 起播失败', err));
  }

  /** 结算 + 队列推进的公共尾段。manual=false 表示来自 ended（按 completed 结算）。 */
  function advance(settle: { playedDuration: number; completed: boolean }): AdvanceResult {
    settleOutcome(settle.playedDuration, settle.completed);
    const nextId = queue.next();
    if (nextId === null) {
      // §3.5c：null 则 stop。会话已结算（上方），此处只落「停止」的媒体态（暂停 + 归零；
      // 队列保留在 queue 实例，zustand 状态由 store 依 AdvanceResult 同步）。
      audio.pause();
      audio.seek(0);
      return { type: 'stopped' };
    }
    const track = resolve(nextId);
    if (!track) return { type: 'stopped' }; // 解析失败兜底停止（上下文与队列失配的防御）
    if (track.id === currentTrackId) {
      // repeat='one'：同曲重启，不再次计费（留痕见文件头）。
      audio.seek(0);
      void audio.play().catch((err: unknown) => console.warn('[playback] 重播失败', err));
      return { type: 'restarted' };
    }
    startTrack(track);
    return { type: 'started', track };
  }

  const service: PlaybackService = {
    get currentTrackId() {
      return currentTrackId;
    },

    playTrack(track, manual = true) {
      if (track.id === currentTrackId) {
        // 同曲不重复计费（§3.5c 前置条件）；暂停中则续播，不换源不结算。
        if (audio.paused) {
          void audio.play().catch((err: unknown) => console.warn('[playback] 续播失败', err));
        }
        return;
      }
      if (manual) settleOutcome(audio.currentTime, false); // 手动切歌：completed:0 前置结算
      startTrack(track);
    },

    handleEnded() {
      // §3.5c onended：completed 结算，playedDuration 用曲目时长（audio.duration）。
      return advance({ playedDuration: audio.duration, completed: true });
    },

    handleError() {
      // T6.0：播放出错（解码失败 / 取流失效）——按「未播成」口径结算：playedDuration:0、
      // completed:false。settleOutcome 幂等（historyId 即刻清空），重复 error 不会重复结算。
      settleOutcome(0, false);
      audio.pause();
      // 不推进队列（不 queue.next()）：坏文件连跳风暴防护，交用户手动 next。
      const track = currentTrackId === null ? null : resolve(currentTrackId);
      if (!track) return { type: 'stopped' };
      return { type: 'failed', track };
    },

    next() {
      // 用户裁定（2026-09-11）：repeat-one 下手动 next = 未切歌——不结算、seek(0)、会话延续，
      // ended 时正常落账（completed 正确计入）。主流播放器「repeat-one 不劫持手动 next（跳下一首）」
      // 语义需修改 queue 冻结代码才能实现，本实现按裁定取续会话重播（留痕，如需改走裁定流程）。
      if (queue.repeat === 'one' && currentTrackId !== null) {
        audio.seek(0);
        void audio.play().catch((err: unknown) => console.warn('[playback] 重播失败', err));
        return { type: 'restarted' };
      }
      // 手动切歌：先 completed:0 结算（currentTime），再走 queue.next()。
      return advance({ playedDuration: audio.currentTime, completed: false });
    },

    previous() {
      const prevId = queue.previous();
      const track = prevId === null ? null : resolve(prevId);
      if (!track) return { type: 'stopped' };
      if (track.id === currentTrackId) {
        // 队首重启当前曲：会话延续，不结算不重计（留痕见文件头）。
        audio.seek(0);
        void audio.play().catch((err: unknown) => console.warn('[playback] 重播失败', err));
        return { type: 'restarted' };
      }
      settleOutcome(audio.currentTime, false);
      startTrack(track);
      return { type: 'started', track };
    },

    stop() {
      settleOutcome(audio.currentTime, false); // 手动停止：completed:0 结算
      audio.pause();
      audio.seek(0);
    },

    seek(t) {
      audio.seek(t); // 拖动进度条零 IPC（口径 2.1-1）
    },

    setVolume(v) {
      audio.setVolume(v);
      scheduleVolumeSave(v);
    },

    toggleMute() {
      audio.setMuted(!audio.muted);
      const muted = audio.muted;
      void getApi()
        ?.settings.set({ muted })
        .catch((err: unknown) => console.warn('[playback] 静音态持久化失败', err));
    },

    flushVolumeSave,
  };

  return service;
}
