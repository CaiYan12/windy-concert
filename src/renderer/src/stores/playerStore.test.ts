/**
 * T5.3 playerStore 单测（jsdom project）—— F4-2 状态集 + 动作 + position 250ms 节流。
 *
 * 形态：createPlayerStore({ audio, getApi, queue }) 注入替身（同 settingsStore 注入决定 /
 * libraryStore api 桩）；queue 用真实 PlayQueue；fake timers 驱动节流与 volume debounce。
 * 变异自检锚点：删除 store 内 ended 订阅 → 「ended 链」组红；删除节流 → 「setState 受控」红；
 * 删除 recordPlay（service 层）→ playbackService.test.ts 红。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackRow } from '../../../shared/types';
import { useI18nStore } from '../i18n';
import { buildAudioSrc, createAudioEngine } from '../player/audioEngine';
import { PlayQueue } from '../player/queue';
import {
  FakeAudioElement,
  makePlaybackApi,
  makeTrack,
  microflush,
  type PlaybackApiHarness,
} from '../player/playerStubs';
import { POSITION_THROTTLE_MS, createPlayerStore } from './playerStore';
import { useToastStore } from './toastStore';

const t1 = makeTrack('t1', { filePath: 'D:\\Music\\one.flac', duration: 100 });
const t2 = makeTrack('t2', { filePath: 'D:\\Music\\two.flac', duration: 200 });
const t3 = makeTrack('t3', { filePath: 'D:\\Music\\three.flac', duration: 300 });

type PlayerStore = ReturnType<typeof createPlayerStore>;

function setup(_context: TrackRow[] = []): { // _context 未用留痕：store 上下文一律经 loadContext 注入（计划 679 行），构造期不注入
  store: PlayerStore;
  api: PlaybackApiHarness;
  el: FakeAudioElement;
  queue: PlayQueue;
} {
  const api = makePlaybackApi();
  const el = new FakeAudioElement();
  const queue = new PlayQueue();
  const store = createPlayerStore({
    audio: createAudioEngine({ audio: el }),
    getApi: () => api.api,
    queue,
  });
  return { store, api, el, queue };
}

/** 统计 position 状态变更次数（节流受控断言用）。 */
function countPositionChanges(store: PlayerStore): () => number {
  let changes = 0;
  let last: number = store.getState().position; // 以订阅时刻为基线，之后的每次变化都计数
  store.subscribe((s) => {
    if (s.position !== last) changes += 1;
    last = s.position;
  });
  return () => changes;
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('F4-2 初始状态', () => {
  it('currentTrack=null、position/duration=0、playing=false、volume=0.8、muted=false、playMode 复位', () => {
    const { store } = setup();
    const s = store.getState();
    expect(s.currentTrack).toBeNull();
    expect(s.position).toBe(0);
    expect(s.duration).toBe(0);
    expect(s.playing).toBe(false);
    expect(s.volume).toBe(0.8); // 与主进程 Settings 默认一致
    expect(s.muted).toBe(false);
    expect(s.playMode).toEqual({ shuffle: false, repeat: 'off' });
  });
});

describe('loadContext（上下文整队 + 首曲加载）', () => {
  it('存 TrackRow[] + queue 整队 + 首曲换源起播 + recordPlay（计费口径：loadTrack 即计）', async () => {
    const { store, api, el } = setup([t1, t2, t3]);
    store.getState().loadContext([t1, t2, t3], 1);

    const s = store.getState();
    expect(s.currentTrack).toEqual(t2); // startIndex=1 → 第 2 首
    expect(s.playing).toBe(true);
    expect(s.position).toBe(0);
    expect(el.src).toBe(buildAudioSrc(t2.filePath));
    expect(el.paused).toBe(false);
    expect(api.calls).toEqual([{ kind: 'recordPlay', trackId: 't2' }]);
    await microflush();
  });

  it('队列推进走 queue 语义：next/previous 后 currentTrack 跟随', async () => {
    const { store } = setup([t1, t2, t3]);
    store.getState().loadContext([t1, t2, t3], 0);
    await microflush();

    store.getState().next();
    expect(store.getState().currentTrack?.id).toBe('t2');
    store.getState().next();
    expect(store.getState().currentTrack?.id).toBe('t3');
    store.getState().previous();
    expect(store.getState().currentTrack?.id).toBe('t2');
    await microflush();
  });

  it('切上下文时先按 completed:0 结算上一会话（手动切歌口径），再计新首曲', async () => {
    const { store, api } = setup([t1, t2]);
    store.getState().loadContext([t1, t2], 0);
    await microflush(); // t1 的 historyId=100 落会话

    store.getState().loadContext([t3], 0); // 换上下文
    await microflush();

    expect(api.calls[1]).toMatchObject({ kind: 'updateOutcome', historyId: 100, completed: false });
    expect(api.calls[2]).toEqual({ kind: 'recordPlay', trackId: 't3' });
    expect(store.getState().currentTrack?.id).toBe('t3');
  });

  it('新上下文首曲与当前曲相同：不重复计费（§3.5c 同曲守卫贯穿 store）', async () => {
    const { store, api } = setup([t1, t2]);
    store.getState().loadContext([t1, t2], 0);
    await microflush();

    store.getState().loadContext([t1, t2, t3], 0); // 首曲仍是 t1
    await microflush();

    const recordPlays = api.calls.filter((c) => c.kind === 'recordPlay');
    expect(recordPlays).toHaveLength(1);
    expect(store.getState().currentTrack?.id).toBe('t1');
    expect(store.getState().playing).toBe(true);
  });

  it('空上下文：无旧会话时清空播放态、零计费', () => {
    const { store, api, el } = setup();
    store.getState().loadContext([], 0);
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().playing).toBe(false);
    expect(api.calls).toHaveLength(0);
    expect(el.src).toBe('');
  });

  // T5.3 评审 I1 回归锚：有在播会话时切空上下文，必须先按 §3.5c「停止结算」口径
  // 落 completed:0 并暂停 audio——此前只清 zustand 状态（声音继续、旧会话被 ended 错记播完）。
  it('空上下文：旧会话先 completed:0 结算并暂停 audio', async () => {
    const { store, api, el } = setup();
    store.getState().loadContext([t1], 0);
    await microflush(); // recordPlay 回包落地，historyId 进入会话
    const sessionCalls = api.calls.length;

    store.getState().loadContext([], 0);
    expect(store.getState().currentTrack).toBeNull();
    expect(store.getState().playing).toBe(false);
    expect(el.paused).toBe(true);
    // 恰好多一条结算调用：旧会话 completed:0，且无新的 recordPlay。
    const outcomes = api.calls.slice(sessionCalls).filter((c) => c.kind === 'updateOutcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ historyId: 100, completed: false });
    expect(api.calls.slice(sessionCalls).some((c) => c.kind === 'recordPlay')).toBe(false);
  });
});

describe('togglePlay（暂停恢复零 IPC，口径 2.1-1）', () => {
  it('播放中 → 暂停 → playing=false；再恢复 → playing=true；全程零 IPC', async () => {
    const { store, api, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    await microflush();
    const callsAtPlay = api.calls.length;

    store.getState().togglePlay();
    expect(store.getState().playing).toBe(false);
    expect(el.paused).toBe(true);

    store.getState().togglePlay();
    expect(store.getState().playing).toBe(true);
    expect(el.paused).toBe(false);

    expect(api.calls).toHaveLength(callsAtPlay); // 暂停/恢复零 IPC
  });

  it('无 currentTrack：togglePlay 空操作', () => {
    const { store, el } = setup();
    store.getState().togglePlay();
    expect(store.getState().playing).toBe(false);
    expect(el.playCalls).toBe(0);
  });
});

describe('seek / 音量 / 静音', () => {
  it('seek：position 状态 + audio.currentTime 同步，零 IPC', () => {
    const { store, api, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    const calls = api.calls.length;

    store.getState().seek(42);
    expect(store.getState().position).toBe(42);
    expect(el.currentTime).toBe(42);
    expect(api.calls).toHaveLength(calls);
  });

  it('setVolume：状态与 audio 立即生效；持久化 debounce 500ms（fake timers）', () => {
    vi.useFakeTimers();
    const { store, api } = setup([t1]);
    store.getState().loadContext([t1], 0);

    store.getState().setVolume(0.3);
    expect(store.getState().volume).toBe(0.3);
    expect(api.settingsSets).toEqual([]); // 窗口内不落盘
    vi.advanceTimersByTime(500);
    expect(api.settingsSets).toEqual([{ volume: 0.3 }]);
  });

  it('toggleMute：muted 翻转 + audio 同步 + 即时持久化', () => {
    const { store, api, el } = setup([t1]);
    store.getState().toggleMute();
    expect(store.getState().muted).toBe(true);
    expect(el.muted).toBe(true);
    expect(api.settingsSets).toEqual([{ muted: true }]);
  });

  it('ensureVolumeRestored：从 settings:get 恢复 volume/muted（幂等，只读一次）', async () => {
    const { store, api, el } = setup();
    // 桩的 settings.get 返回 volume 0.8 / muted false——先手动换桩返回定制值。
    // 注意用 spy 断言调用次数（spy 会替换原实现，桩内部计数器不再经过）。
    const getSpy = vi
      .spyOn(api.api.settings, 'get')
      .mockResolvedValue({
        language: 'zh-CN',
        autoScanOnStartup: true,
        volume: 0.4,
        muted: true,
      });

    await store.getState().ensureVolumeRestored();
    expect(store.getState().volume).toBe(0.4);
    expect(store.getState().muted).toBe(true);
    expect(el.volume).toBe(0.4);
    expect(el.muted).toBe(true);

    await store.getState().ensureVolumeRestored(); // 幂等
    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});

describe('playMode（F5-5/F5-6 接线）', () => {
  it('setShuffle/setRepeat 同步 queue 并反映到 playMode', () => {
    const { store, queue } = setup([t1, t2, t3]);
    store.getState().setShuffle(true);
    expect(store.getState().playMode).toEqual({ shuffle: true, repeat: 'off' });
    expect(queue.shuffle).toBe(true);

    store.getState().setRepeat('all');
    expect(store.getState().playMode).toEqual({ shuffle: true, repeat: 'all' });
    expect(queue.repeat).toBe('all');
  });

  it('repeat=one 下 ended：同曲重启、position 归零、playing 保持、不重复计费', async () => {
    const { store, api, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    store.getState().setRepeat('one');
    await microflush();

    el.currentTime = 100;
    el.duration = 100;
    el.emit('ended');
    expect(store.getState().playing).toBe(true);
    expect(store.getState().position).toBe(0);
    expect(el.currentTime).toBe(0);
    const recordPlays = api.calls.filter((c) => c.kind === 'recordPlay');
    expect(recordPlays).toHaveLength(1);
  });
});

describe('ended 链（store 订阅 → service.handleEnded → 状态同步）', () => {
  it('ended 换曲：currentTrack/playing/position/duration 跟随；结算 completed=true', async () => {
    const { store, api, el } = setup([t1, t2]);
    store.getState().loadContext([t1, t2], 0);
    await microflush();

    el.duration = 100;
    el.emit('ended');
    await microflush();

    const s = store.getState();
    expect(s.currentTrack?.id).toBe('t2');
    expect(s.playing).toBe(true);
    expect(s.position).toBe(0);
    expect(api.calls[1]).toMatchObject({ kind: 'updateOutcome', completed: true, playedDuration: 100 });
  });

  it('ended 至队尾（null → stop）：playing=false、position 归零、队列与 currentTrack 保留', async () => {
    const { store, el, queue } = setup([t1, t2]);
    store.getState().loadContext([t1, t2], 0);
    store.getState().next(); // 到 t2（队尾）
    await microflush();

    el.emit('ended');
    const s = store.getState();
    expect(s.playing).toBe(false);
    expect(s.position).toBe(0);
    expect(s.currentTrack?.id).toBe('t2'); // currentTrack 保留
    expect(queue.items).toEqual(['t1', 't2']); // 队列保留
  });
});

describe('position 250ms 节流（timeupdate 高频触发下 setState 次数受控）', () => {
  it(`窗口内 10 次 timeupdate 只产生 1 次前沿 + 1 次尾沿（窗口 ${POSITION_THROTTLE_MS}ms）`, () => {
    vi.useFakeTimers();
    const { store, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    const changes = countPositionChanges(store);
    // loadContext 已把 position 置 0（一次 set），计数从订阅后开始且比较 prev 值

    for (let i = 1; i <= 10; i++) {
      el.currentTime = i; // 模拟浏览器高频 timeupdate
      el.emit('timeupdate');
    }
    expect(changes()).toBe(1); // 高频触发仅前沿 1 次（变异点：删节流 → 此行红）
    expect(store.getState().position).toBe(1); // 前沿值为触发时刻的值

    vi.advanceTimersByTime(POSITION_THROTTLE_MS);
    expect(changes()).toBe(2); // 尾沿补发最后值
    expect(store.getState().position).toBe(10);
  });

  it('窗口过后再次触发：重新走前沿（持续推进时节流密度恒定）', () => {
    vi.useFakeTimers();
    const { store, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    const changes = countPositionChanges(store);

    el.currentTime = 1;
    el.emit('timeupdate'); // 前沿
    vi.advanceTimersByTime(POSITION_THROTTLE_MS); // 无后续触发：无尾沿
    expect(changes()).toBe(1);

    el.currentTime = 2;
    el.emit('timeupdate'); // 新窗口前沿
    expect(changes()).toBe(2);
    expect(store.getState().position).toBe(2);
  });
});

describe('duration（loadedmetadata）', () => {
  it('loadedmetadata → duration 状态同步', () => {
    const { store, el } = setup([t1]);
    store.getState().loadContext([t1], 0);
    el.duration = 180;
    el.emit('loadedmetadata');
    expect(store.getState().duration).toBe(180);
  });
});

describe('stop（计划：playing=false、position 归零，队列保留）', () => {
  it('stop 动作：结算 completed:0 + 暂停 + 状态复位', async () => {
    const { store, api, el } = setup([t1, t2]);
    store.getState().loadContext([t1, t2], 0);
    await microflush();

    el.currentTime = 15;
    store.getState().stop();
    const s = store.getState();
    expect(s.playing).toBe(false);
    expect(s.position).toBe(0);
    expect(el.paused).toBe(true);
    expect(api.calls[1]).toMatchObject({ kind: 'updateOutcome', completed: false, playedDuration: 15 });
  });
});

// ---------------------------------------------------------------------------
// T6.0② audio error 链（store 侧）——error 事件 → 结算 + playing=false + toast + 不跳下一首
// ---------------------------------------------------------------------------
describe('T6.0 audio error 链（store 订阅 → service.handleError → playing=false + toast）', () => {
  it('emit(error)：结算 completed:false/playedDuration:0；playing=false；不跳下一首；toast 用 player.playFailed；无 recordPlay 重发', async () => {
    const { store, api, el, queue } = setup([t1, t2]);
    // i18n 哨兵：断言 toast 文案确实取自 player.playFailed 键（资源未加载时 t 回退键名，此处显式装表）
    useI18nStore.setState({ messages: { 'player.playFailed': '«player.playFailed»' }, loaded: true });
    const showToast = vi.spyOn(useToastStore.getState(), 'showToast').mockImplementation(() => {});

    store.getState().loadContext([t1, t2], 0);
    await microflush(); // recordPlay(t1) → historyId=100
    expect(store.getState().playing).toBe(true);
    const before = api.calls.length;

    el.emit('error'); // 模拟 <audio> error 事件（解码失败/取流失效）
    await microflush();

    const s = store.getState();
    expect(s.playing).toBe(false); // 乐观置位回退
    expect(s.currentTrack?.id).toBe('t1'); // 不自动跳下一首（坏文件连跳风暴防护）
    expect(queue.current).toBe('t1');

    const outcomes = api.calls.slice(before).filter((c) => c.kind === 'updateOutcome');
    expect(outcomes).toEqual([
      { kind: 'updateOutcome', historyId: 100, playedDuration: 0, completed: false },
    ]);
    expect(api.calls.slice(before).some((c) => c.kind === 'recordPlay')).toBe(false); // 不回冲 playCount

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('«player.playFailed»');
  });

  it('无在播会话时 emit(error)：play=stopped 分支，零结算零 toast（不误报）', () => {
    const { store, api, el } = setup([]);
    const showToast = vi.spyOn(useToastStore.getState(), 'showToast').mockImplementation(() => {});

    el.emit('error'); // 无会话（currentTrackId=null）时的 error

    expect(store.getState().playing).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
    expect(api.calls).toHaveLength(0);
  });
});
