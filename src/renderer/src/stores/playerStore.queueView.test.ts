/**
 * T5.5 playerStore 平行插队列表 + 队列视图三段数据 单测（jsdom project）。
 *
 * 形态与 playerStore.test.ts 一致：createPlayerStore({ audio, getApi, queue }) 注入替身，
 * queue 用真实 PlayQueue（冻结语义），FakeAudioElement 手动派发 ended。
 *
 * 裁定锚点（2026-09-11）：
 *   · 插队数据源 = store 层平行列表 userQueueIds（queue.ts §3.5b 冻结不动）；
 *   · 播放推进/手动跳过消费、loadContext 清空、shuffle 开关不影响列表内容；
 *   · 面板三段 = userQueueIds ∩ queue.upNext 求交过滤（shuffle 下不依赖差集推断）。
 * 变异自检锚点：删除 advanceWithView 内的消费 splice → 「消费」组红；
 *   删除 loadContext 的 userQueueIds = [] → 「清空」组红；删除求交过滤 → 「shuffle」组红。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioEngine } from '../player/audioEngine';
import { PlayQueue } from '../player/queue';
import {
  FakeAudioElement,
  makePlaybackApi,
  makeTrack,
  microflush,
  type PlaybackApiHarness,
} from '../player/playerStubs';
import { createPlayerStore } from './playerStore';

const t1 = makeTrack('t1', { filePath: 'D:\\Music\\one.flac' });
const t2 = makeTrack('t2', { filePath: 'D:\\Music\\two.flac' });
const t3 = makeTrack('t3', { filePath: 'D:\\Music\\three.flac' });
const t4 = makeTrack('t4', { filePath: 'D:\\Music\\four.flac' });

type PlayerStore = ReturnType<typeof createPlayerStore>;

function setup(): { store: PlayerStore; api: PlaybackApiHarness; el: FakeAudioElement; queue: PlayQueue } {
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

/** 载入上下文并冲刷 recordPlay 微任务（同 playerStore.test 用例习惯）。 */
async function load(store: PlayerStore, tracks = [t1, t2, t3, t4], startIndex = 0): Promise<void> {
  store.getState().loadContext(tracks, startIndex);
  await microflush();
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T5.5 平行插队列表一致性（userQueueIds）', () => {
  it('playNext 插队进「下一首播放」段且 upNextRest 不含该曲；enqueue 尾插只进「下次播放」段', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3, t4], 0); // current=t1, upNext=[t2,t3,t4]

    store.getState().playNext(t3); // 插队：t3 提到 t1 后
    let view = store.getState().queueView;
    expect(view.current?.id).toBe('t1');
    expect(view.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);
    // 真实顺序由 service/queue 保证：t3 之后是 t2、t4
    expect(view.upNextRest.map((t) => t.id)).toEqual(['t2', 't4']);

    store.getState().enqueue(t4); // 尾插：t4 已在队列中，视觉无差别（不进插队段）
    view = store.getState().queueView;
    expect(view.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);
    // queue.enqueue 冻结语义：再 push 一份 t4 → rest 出现两份 t4（真实队列如实呈现，留痕）
    expect(view.upNextRest.map((t) => t.id)).toEqual(['t2', 't4', 't4']);
  });

  it('ended 推进消费插队曲：被播过的曲离开插队段', async () => {
    const { store, el } = setup();
    await load(store, [t1, t2, t3, t4], 0);
    store.getState().playNext(t2);
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t2']);

    el.emit('ended'); // t1 播完 → 推进到插队的 t2
    expect(store.getState().currentTrack?.id).toBe('t2');
    expect(store.getState().queueView.upNextUserQueue).toEqual([]); // 播过即离开
    expect(store.getState().queueView.current?.id).toBe('t2');
  });

  it('手动 next/previous 同样消费；previous 回跳不回填插队段', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3, t4], 0);
    store.getState().playNext(t3);
    store.getState().playNext(t2); // 插队序：t2 在 t3 前（后插的先播）
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t2', 't3']);

    store.getState().next(); // → t2（手动跳过 = 消费）
    expect(store.getState().currentTrack?.id).toBe('t2');
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);

    store.getState().next(); // → t3（消费）
    expect(store.getState().queueView.upNextUserQueue).toEqual([]);

    store.getState().previous(); // → t2 回跳
    expect(store.getState().currentTrack?.id).toBe('t2');
    // 已消费的曲不因回跳复活（插队段 = 未播过的用户意图，留痕）
    expect(store.getState().queueView.upNextUserQueue).toEqual([]);
  });

  it('loadContext 新上下文清空平行列表', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3], 0);
    store.getState().playNext(t2);
    expect(store.getState().queueView.upNextUserQueue).toHaveLength(1);

    store.getState().loadContext([t4], 0); // 换上下文
    const view = store.getState().queueView;
    expect(view.upNextUserQueue).toEqual([]);
    expect(view.current?.id).toBe('t4');
  });

  it('shuffle 开关不影响平行列表内容（用户意图序保留，渲染求交过滤）', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3, t4], 0);
    store.getState().playNext(t3);
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);

    store.getState().setShuffle(true); // 重排 order，但 t3 仍在 upNext 集合内
    const view = store.getState().queueView;
    expect(view.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);
    // rest = upNext 减插队段（求交过滤，不依赖差集推断）
    const restIds = view.upNextRest.map((t) => t.id);
    expect(restIds).not.toContain('t3');
    expect(restIds).toHaveLength(2); // t2/t4
    expect(new Set(restIds)).toEqual(new Set(['t2', 't4']));

    store.getState().setShuffle(false);
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t3']);
  });
});

describe('T5.5 队列视图三段数据', () => {
  it('初始（无会话）三段全空', () => {
    const { store } = setup();
    expect(store.getState().queueView).toEqual({
      current: null,
      upNextUserQueue: [],
      upNextRest: [],
    });
  });

  it('三段数据解析为完整 TrackRow（id → contextTracks 内对象）', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3, t4], 0);
    store.getState().playNext(t3);
    const view = store.getState().queueView;
    expect(view.current).toEqual(t1);
    expect(view.upNextUserQueue).toEqual([t3]);
    expect(view.upNextRest).toEqual([t2, t4]);
  });

  it('resolve 不到的 id：从视图丢弃并 console.warn（上下文与队列失配的防御路径）', async () => {
    const warn = vi.spyOn(console, 'warn');
    const { store, queue } = setup();
    await load(store, [t1, t2], 0);
    // 绕过 store 直接在冻结 queue 上造失配：upNext 出现 contextTracks 里不存在的 id
    queue.playNext('ghost');
    store.getState().setShuffle(true); // 触发视图重算（order 重排不影响失配事实）
    const view = store.getState().queueView;
    expect(view.upNextUserQueue).toEqual([]);
    expect(view.upNextRest.map((t) => t.id)).not.toContain('ghost');
    const warned = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warned).toContain('ghost');
  });

  it('同曲重复插队：平行列表去重，视图不重复渲染（queue 冻结语义允许 order 重复，留痕）', async () => {
    const { store } = setup();
    await load(store, [t1, t2, t3], 0);
    store.getState().playNext(t2);
    store.getState().playNext(t2);
    expect(store.getState().queueView.upNextUserQueue.map((t) => t.id)).toEqual(['t2']);
  });
});
