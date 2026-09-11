// T5.3 AudioEngine —— 全渲染进程唯一允许触碰 <audio> 元素的模块（计划 §架构分层：UI →
// playerStore → playbackService → AudioEngine，原则 4「播放器核心与 UI 分离」）。
//
// 设计留痕：
//   · 工厂 + 注入形态：createAudioEngine(audio?) 的 audio 参数缺省时才 new Audio()（调用时机
//     求值，不在模块顶层创建真实 audio——jsdom 单测/后续 e2e 均可注入替身，避免模块加载副作用）。
//   · crossOrigin 不设（计划 T5.3 原文）：音频走本地自定义协议 wc-file://，无跨域语境；
//     显式留「不设置」的决定，防止后续误加 credentials 语义。
//   · preload='auto'（计划 T5.3 原文）：进入上下文即预取，配合下一首切换的起播延迟。
//   · wc-file src 构建为独立纯函数 buildAudioSrc 导出：§3.5c 第 1 步
//     `audio.src = wc-file://<encodeURIComponent(filePath)>` 的编码范围 = 整体 filePath 一次
//     encodeURIComponent（对照 §3.5f 原文「wc-file://<encodeURIComponent(绝对路径)>」与
//     main/library/protocols.ts 解析侧「对 host 整段 decodeURIComponent」双向对齐——
//     即 `wc-file://` 后接整体编码的绝对路径，不做路径分段编码）。
//   · 事件订阅用 addEventListener 包装并返回 unsubscribe（store/service 各自按需订阅，
//     生命周期与订阅方绑定）；元素本体不外泄（接口只暴露 AudioEngine 能力面）。

/** AudioEngine 所需的 <audio> 元素能力面（结构性类型：测试可注入普通对象替身）。 */
export interface AudioElementLike {
  src: string;
  preload: string;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export type AudioEventType = 'ended' | 'timeupdate' | 'loadedmetadata' | 'error';

/** wc-file:// 音频地址构建（§3.5c 第 1 步 / §3.5f）。编码范围 = 整体 filePath（留痕见文件头）。 */
export function buildAudioSrc(filePath: string): string {
  return `wc-file://${encodeURIComponent(filePath)}`;
}

/** AudioEngine 能力面（playbackService / playerStore 只依赖此接口，不触碰元素）。 */
export interface AudioEngine {
  /** 换源（§3.5c 第 1 步）；随后需显式 play() 起播。 */
  load(src: string): void;
  play(): Promise<void>;
  pause(): void;
  /** 跳转；非有限值忽略（无源/元数据未就绪时 currentTime 不可写的防御）。 */
  seek(t: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly muted: boolean;
  /** 订阅媒体事件，返回 unsubscribe。 */
  on(event: AudioEventType, cb: () => void): () => void;
}

export interface CreateAudioEngineDeps {
  /** 注入的音频元素；缺省时内部 new Audio()（唯一允许创建 <audio> 的位置）。 */
  audio?: AudioElementLike;
}

export function createAudioEngine(deps: CreateAudioEngineDeps = {}): AudioEngine {
  // 缺省注入：惰性到工厂调用时刻才创建（不在模块顶层——留痕见文件头）。
  const el: AudioElementLike = deps.audio ?? new Audio();

  // e2e 可观测性：挂 DOM 以支撑播放态断言。
  // 仅「自己 new Audio()」的缺省路径挂 DOM；注入替身路径（单测/后续可注入）不动——替身无真实
  // DOM 语义，挂上反而污染测试 DOM。detached audio 虽可发声但 document.querySelector('audio')
  // 恒 null，导致 e2e 无法经 DOM 断言播放态，故此处补挂。audio 无 controls 不可见、零视觉影响。
  // 幂等守卫：已 append（parentElement 存在）则不重复，防 HMR / 单例重复创建导致的重复挂 DOM。
  if (deps.audio === undefined && typeof document !== 'undefined') {
    const realAudio = el as unknown as HTMLAudioElement
    if (!realAudio.parentElement) {
      document.body.appendChild(realAudio)
    }
  }

  el.preload = 'auto'; // 计划 T5.3 原文；crossOrigin 不设（同上留痕）

  return {
    load(src) {
      el.src = src;
    },
    play() {
      return Promise.resolve(el.play());
    },
    pause() {
      el.pause();
    },
    seek(t) {
      if (Number.isFinite(t)) el.currentTime = t;
    },
    setVolume(v) {
      el.volume = Math.min(1, Math.max(0, v));
    },
    setMuted(m) {
      el.muted = m;
    },
    get currentTime() {
      return el.currentTime;
    },
    get duration() {
      return el.duration;
    },
    get paused() {
      return el.paused;
    },
    get muted() {
      return el.muted;
    },
    on(event, cb) {
      el.addEventListener(event, cb);
      return () => el.removeEventListener(event, cb);
    },
  };
}
