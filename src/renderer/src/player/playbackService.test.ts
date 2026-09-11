/**
 * T5.3 playbackService 单测（jsdom project）—— §3.5c 播放计数时序逐条锚定。
 *
 * 桩：FakeAudioElement + makePlaybackApi（calls 按时间序记录，断言「先结算后切歌」的次序）；
 * queue 用真实 PlayQueue（queue.ts 已冻结，直接驱动）。fake timers 驱动 volume debounce。
 * 变异自检锚点：删除 startTrack 内 recordPlay 调用 → 「loadTrack 即计」组全红；
 * 删除 scheduleVolumeSave 的 debounce → 「500ms 内不落盘」用例红。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAudioSrc, createAudioEngine } from './audioEngine';
import {
  createPlaybackService,
  VOLUME_SAVE_DEBOUNCE_MS,
  type PlaybackService,
} from './playbackService';
import { PlayQueue } from './queue';
import {
  FakeAudioElement,
  makePlaybackApi,
  makeTrack,
  microflush,
  type PlaybackApiHarness,
} from './playerStubs';
import type { TrackRow } from '../../../shared/types';

function makeService(tracks: TrackRow[] = []): {
  service: PlaybackService;
  api: PlaybackApiHarness;
  el: FakeAudioElement;
  queue: PlayQueue;
} {
  const api = makePlaybackApi();
  const el = new FakeAudioElement();
  const queue = new PlayQueue();
  const service = createPlaybackService({
    audio: createAudioEngine({ audio: el }),
    getApi: () => api.api,
    queue,
    resolve: (id) => tracks.find((t) => t.id === id) ?? null,
  });
  return { service, api, el, queue };
}

const t1 = makeTrack('t1', { filePath: 'D:\\Music\\one.flac', duration: 100 });
const t2 = makeTrack('t2', { filePath: 'D:\\Music\\two.flac', duration: 200 });
const t3 = makeTrack('t3', { filePath: 'D:\\Music\\three.flac', duration: 300 });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('§3.5c loadTrack：换源 + recordPlay + 会话（「播放过一次 = loadTrack 即计」）', () => {
  it('loadTrack 异曲：1) audio.src=wc-file 整体编码 2) recordPlay(trackId) 同步发起 3) currentTrackId 更新', async () => {
    const { service, api, el } = makeService([t1]);
    service.playTrack(t1, true);
    expect(el.src).toBe(buildAudioSrc(t1.filePath)); // 第 1 步
    expect(api.calls[0]).toEqual({ kind: 'recordPlay', trackId: 't1' }); // 第 2 步（同步发起）
    expect(service.currentTrackId).toBe('t1'); // 第 3 步
    expect(el.paused).toBe(false); // 起播
    await microflush();
    // 第 2 步续：historyId 已入会话——ended 时可结算（由后续用例证明）
  });

  it('loadTrack 同曲：整体 no-op（不重复计费、不换源、不结算）——§3.5c 前置条件', async () => {
    const { service, api, el } = makeService([t1]);
    service.playTrack(t1, true);
    await microflush();
    const srcBefore = el.src;
    const callsAfterFirst = api.calls.length;

    service.playTrack(t1, true); // 再点同一首
    expect(api.calls.length).toBe(callsAfterFirst); // recordPlay 不重发
    expect(el.src).toBe(srcBefore); // 不换源
    expect(api.calls.every((c) => c.kind !== 'updateOutcome')).toBe(true); // 无结算
  });

  it('同曲且暂停中：续播（play）但依旧零计费', async () => {
    const { service, api, el } = makeService([t1]);
    service.playTrack(t1, true);
    el.pause();
    const playCalls = el.playCalls;
    service.playTrack(t1, true);
    expect(el.playCalls).toBe(playCalls + 1);
    expect(api.calls.filter((c) => c.kind === 'recordPlay')).toHaveLength(1);
  });

  it('recordPlay 晚到竞态：快速切歌后旧 historyId 不入会话（会话序号守卫）', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0);

    let resolveSlow!: (v: { historyId: number }) => void;
    api.setRecordPlayImpl(() => new Promise((res) => { resolveSlow = res; }));
    service.playTrack(t1, true); // recordPlay(t1) 挂起（slow）

    api.setRecordPlayImpl(() => Promise.resolve({ historyId: 101 }));
    service.playTrack(t2, true); // 快速切到 t2（recordPlay 立即回 101）

    resolveSlow({ historyId: 100 }); // t1 的旧回包晚到
    await microflush();

    el.duration = 200;
    service.handleEnded(); // t2 播完 → 结算必须用 101（当前会话），不得用 100
    await microflush();
    const outcome = api.calls.find((c) => c.kind === 'updateOutcome');
    expect(outcome).toEqual({
      kind: 'updateOutcome',
      historyId: 101,
      playedDuration: 200,
      completed: true,
    });
  });
});

describe('repeat-one × 手动 next（用户裁定 2026-09-11：未切歌，续会话重播）', () => {
  it('repeat-one + 手动 next：零结算、seek(0)、会话延续——后续 ended 仍以同一 historyId 落 completed:true', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0); // service 层测试不入 store——队列上下文直接注入
    queue.setRepeat('one');
    el.duration = 100; // ended 结算用 audio.duration（FakeAudioElement 需显式设定）
    service.playTrack(t1, true);
    await microflush(); // recordPlay 回包落地（historyId=100）
    el.currentTime = 33;
    const callsAtMark = api.calls.length;

    service.next(); // 手动 next：repeat-one 特判

    expect(api.calls.length).toBe(callsAtMark); // 零结算零计费
    expect(el.currentTime).toBe(0); // seek(0) 重播
    expect(el.paused).toBe(false);

    // 会话延续：模拟重播结束，仍以原 historyId 落 completed:true（duration=100）。
    el.currentTime = 100;
    service.handleEnded();
    await microflush();
    const outcomes = api.calls.filter((c) => c.kind === 'updateOutcome');
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ historyId: 100, playedDuration: 100, completed: true });
  });

  it('repeat=off 下手动 next 不受特判影响：先结算 completed:0 再换曲（回归）', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0);
    service.playTrack(t1, true);
    await microflush();
    el.currentTime = 33;

    service.next();

    expect(api.calls.filter((c) => c.kind === 'updateOutcome')).toHaveLength(1);
    expect(api.calls.filter((c) => c.kind === 'updateOutcome')[0]).toMatchObject({
      historyId: 100,
      playedDuration: 33,
      completed: false,
    });
    expect(queue.current).toBe('t2');
  });
});

describe('§3.5c onended：completed 结算 → queue.next() → 推进/停止', () => {
  it('ended 换曲：updatePlayOutcome(historyId, duration, completed=true) → 下一曲 recordPlay', async () => {
    const { service, api, el, queue } = makeService([t1, t2, t3]);
    queue.loadContext(['t1', 't2', 't3'], 0);
    service.playTrack(t1, true);
    await microflush(); // historyId=100 落会话

    el.duration = 100;
    const result = service.handleEnded();
    await microflush();

    expect(result).toEqual({ type: 'started', track: t2 });
    // 次序：结算 t1（completed）在前，recordPlay t2 在后
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 100, completed: true });
    expect(api.calls[2]).toEqual({ kind: 'recordPlay', trackId: 't2' });
    expect(el.src).toBe(buildAudioSrc(t2.filePath));
    expect(service.currentTrackId).toBe('t2');
  });

  it('ended 且 queue.next() 为 null（repeat=off 队尾）：只结算不推进，无新计费', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 1); // 起始即队尾
    service.playTrack(t2, true);
    await microflush();

    el.duration = 200;
    const result = service.handleEnded();
    expect(result).toEqual({ type: 'stopped' });
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 200, completed: true });
    expect(api.calls).toHaveLength(2); // 无第三次调用（不 recordPlay）
  });

  it('repeat=one 的 ended：completed 结算 + 同曲重启（seek 0 + play），不重复计费', async () => {
    const { service, api, el, queue } = makeService([t1]);
    queue.loadContext(['t1'], 0);
    queue.setRepeat('one');
    service.playTrack(t1, true);
    await microflush();

    el.currentTime = 100;
    el.duration = 100;
    const result = service.handleEnded();
    expect(result).toEqual({ type: 'restarted' });
    expect(el.currentTime).toBe(0);
    expect(el.paused).toBe(false);
    expect(api.calls).toHaveLength(2); // recordPlay(t1) + updateOutcome(completed) 仅此两笔
    const settled = api.calls[1];
    expect(settled?.kind === 'updateOutcome' && settled.completed).toBe(true);
  });
});

describe('§3.5c 手动切歌/停止：先 completed:0 结算再推进', () => {
  it('手动 next 换曲：updatePlayOutcome(currentTime, completed=false) 先于下一曲 recordPlay', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0);
    service.playTrack(t1, true);
    await microflush();

    el.currentTime = 33;
    const result = service.next();
    await microflush();

    expect(result).toEqual({ type: 'started', track: t2 });
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 33, completed: false });
    expect(api.calls[2]).toEqual({ kind: 'recordPlay', trackId: 't2' });
  });

  it('手动 next 至队尾（null）：结算后停止，无二次结算', async () => {
    const { service, api, el, queue } = makeService([t1]);
    queue.loadContext(['t1'], 0);
    service.playTrack(t1, true);
    await microflush(); // historyId 落会话

    el.currentTime = 10;
    const result = service.next();
    expect(result).toEqual({ type: 'stopped' });
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 10, completed: false });
    expect(api.calls).toHaveLength(2);
    expect(el.paused).toBe(true);
  });

  it('手动 previous 换曲：completed:0 前置结算；队首同曲重启不结算（会话延续）', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 1);
    service.playTrack(t2, true);
    await microflush();

    el.currentTime = 8;
    expect(service.previous()).toEqual({ type: 'started', track: t1 });
    await microflush();
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 8, completed: false });
    expect(service.currentTrackId).toBe('t1');

    // 队首再按 previous：queue.previous() 返回当前曲（重启语义）→ 不结算、不重计、seek 0
    const countBefore = api.calls.length;
    expect(service.previous()).toEqual({ type: 'restarted' });
    expect(el.currentTime).toBe(0);
    expect(api.calls).toHaveLength(countBefore);
  });

  it('stop：completed:0 结算 + 暂停 + 位置归零（队列保留由 queue 实例自证）', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0);
    service.playTrack(t1, true);
    await microflush();

    el.currentTime = 21;
    service.stop();
    expect(api.calls[1]).toEqual({ kind: 'updateOutcome', historyId: 100, playedDuration: 21, completed: false });
    expect(el.paused).toBe(true);
    expect(el.currentTime).toBe(0);
    expect(queue.items).toEqual(['t1', 't2']); // 队列保留
  });
});

describe('口径 2.1-1：暂停恢复 / seek 零 IPC', () => {
  it('seek 只动 currentTime，不产生任何 history/settings 调用', () => {
    const { service, api, el } = makeService([t1]);
    service.playTrack(t1, true);
    const count = api.calls.length;
    service.seek(55);
    expect(el.currentTime).toBe(55);
    expect(api.calls).toHaveLength(count);
  });
  // 暂停恢复（togglePlay）的零 IPC 在 playerStore.test.ts 锚定（暂停是 store 层动作）。
});

describe('音量持久化：debounce 500ms → settings:set（settings:set payload=Partial<Settings>）', () => {
  it('500ms 窗口内多次 setVolume 只落盘一次（最后值）；窗口未满零调用', () => {
    vi.useFakeTimers();
    const { service, api } = makeService([]);
    expect(VOLUME_SAVE_DEBOUNCE_MS).toBe(500);

    service.setVolume(0.5);
    expect(api.settingsSets).toEqual([]); // 窗口内不落盘（变异点：删 debounce → 此行红）
    service.setVolume(0.6);
    service.setVolume(0.7);
    expect(api.settingsSets).toEqual([]); // 仍不落盘

    vi.advanceTimersByTime(1); // 远小于 500ms 窗口：不得提前落盘（变异点：debounce 归零 → 此行红）
    expect(api.settingsSets).toEqual([]);

    vi.advanceTimersByTime(499);
    expect(api.settingsSets).toEqual([{ volume: 0.7 }]); // 只发最后一次
  });

  it('debounce 尾沿重置：窗口中断续调以最后一次起算', () => {
    vi.useFakeTimers();
    const { service, api } = makeService([]);
    service.setVolume(0.2);
    vi.advanceTimersByTime(499);
    service.setVolume(0.3); // 重置计时
    vi.advanceTimersByTime(499);
    expect(api.settingsSets).toEqual([]); // 距上次 setVolume 仅 499ms，未满
    vi.advanceTimersByTime(1);
    expect(api.settingsSets).toEqual([{ volume: 0.3 }]);
  });

  it('flushVolumeSave：立即落盘挂起值，且后续计时器不再重复写', () => {
    vi.useFakeTimers();
    const { service, api } = makeService([]);
    service.setVolume(0.9);
    service.flushVolumeSave();
    expect(api.settingsSets).toEqual([{ volume: 0.9 }]);
    vi.advanceTimersByTime(1000);
    expect(api.settingsSets).toHaveLength(1);
  });
});

describe('muted 持久化（实现取舍：即时落盘，留痕 playbackService.ts 文件头）', () => {
  it('toggleMute 翻转并立即 settings:set({muted})', () => {
    const { service, api, el } = makeService([]);
    service.toggleMute();
    expect(el.muted).toBe(true);
    expect(api.settingsSets).toEqual([{ muted: true }]);
    service.toggleMute();
    expect(el.muted).toBe(false);
    expect(api.settingsSets).toEqual([{ muted: true }, { muted: false }]);
  });
});

describe('api 缺失（preload 未就绪）', () => {
  it('getApi 返回 undefined：播放照常、计费静默跳过、setVolume 不落盘不抛', () => {
    vi.useFakeTimers();
    const el = new FakeAudioElement();
    const queue = new PlayQueue();
    const service = createPlaybackService({
      audio: createAudioEngine({ audio: el }),
      getApi: () => undefined,
      queue,
      resolve: () => null,
    });
    expect(() => {
      service.playTrack(t1, true);
      service.setVolume(0.5);
      service.handleEnded();
      vi.advanceTimersByTime(500);
    }).not.toThrow();
    expect(el.src).toBe(buildAudioSrc(t1.filePath)); // 换源照常
    expect(el.paused).toBe(true); // ended 后队列空 → stopped 分支已暂停（计费静默跳过不抛）
  });
});

// ---------------------------------------------------------------------------
// T6.0② audio error 链（service 侧）——结算口径与「不回冲 playCount / 不跳下一首」硬锚
// ---------------------------------------------------------------------------
describe('T6.0 audio error：handleError 结算会话（completed:0 / playedDuration:0）', () => {
  it('恰好一笔 updateOutcome(historyId, 0, false)；暂停；返回 failed；无 recordPlay 重发（不回冲 playCount）', async () => {
    const { service, api, el, queue } = makeService([t1, t2]);
    queue.loadContext(['t1', 't2'], 0);
    service.playTrack(t1, true);
    await microflush(); // recordPlay(t1) → historyId=100 落会话

    // 播放中途出错：currentTime 已有值，但结算口径固定 playedDuration:0（未播成，不计时长）
    el.currentTime = 12;
    const before = api.calls.length;

    const result = service.handleError();

    expect(result).toEqual({ type: 'failed', track: t1 });
    expect(el.paused).toBe(true); // 已暂停

    // 变异锚点：删除 handleError 内 settleOutcome 调用 → 本断言红（slice 为空）
    expect(api.calls.slice(before)).toEqual([
      { kind: 'updateOutcome', historyId: 100, playedDuration: 0, completed: false },
    ]);
    // 不回冲 playCount：不得出现新的 recordPlay（无递减 IPC 口径）
    expect(api.calls.slice(before).some((c) => c.kind === 'recordPlay')).toBe(false);

    // 不自动跳下一首：队列与当前会话保持在出错曲目
    expect(queue.current).toBe('t1');
    expect(service.currentTrackId).toBe('t1');
  });

  it('无会话时 handleError：零结算、暂停、返回 stopped（不发 toast 的上游信号）', async () => {
    const { service, api, el } = makeService([]);
    const result = service.handleError();
    expect(result).toEqual({ type: 'stopped' });
    expect(el.paused).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it('结算幂等：同一会话二次 error 不产生第二笔 updateOutcome', async () => {
    const { service, api, el, queue } = makeService([t1]);
    queue.loadContext(['t1'], 0);
    service.playTrack(t1, true);
    await microflush();

    service.handleError();
    await microflush();
    const afterFirst = api.calls.length;

    // 二次 error（同一会话已结算，historyId 已清空）
    expect(service.handleError()).toEqual({ type: 'failed', track: t1 });
    expect(api.calls).toHaveLength(afterFirst);
    expect(el.paused).toBe(true);
  });
});
