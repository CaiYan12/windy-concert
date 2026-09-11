// T5.2 PlayQueue 单测（F5 验收的自动化形态）。
// 策略：PlayQueue 为纯类无依赖，直接实例化；洗牌随机性不改生产代码（禁止注入 RNG），
//       全部断言使用集合性质（无重复 / Set 相等 / 长度不变）——对任意随机序列均成立。
//       涉及计划代码的边界语义（如越界 startIndex）按实际行为断言，注释标注「计划代码原样语义」。
import { describe, expect, it } from 'vitest';
import { PlayQueue } from '../../../src/renderer/src/player/queue';

/** 生成 t1..n 形式的曲目 id 数组。 */
function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

/** 断言序列无重复且与原集合相等（Set 语义，随机性无关）。 */
function assertPermutation(seq: string[], original: string[]): void {
  expect(new Set(seq).size).toBe(seq.length); // 无重复
  expect(new Set(seq)).toEqual(new Set(original)); // 与原集合相等
}

describe('PlayQueue', () => {
  // ---------- F5-2 上下文入队 ----------
  it('F5-2: loadContext(10 首, startIndex=2) → order 10 首、current 为第 3 首、position 2', () => {
    const q = new PlayQueue();
    const list = ids(10);
    q.loadContext(list, 2);
    expect(q.items).toHaveLength(10);
    expect(q.items).toEqual(list);
    expect(q.current).toBe('t3');
    expect(q.currentPosition).toBe(2);
    expect(q.upNext).toEqual(['t4', 't5', 't6', 't7', 't8', 't9', 't10']);
  });

  // ---------- F5-5 洗牌开关 ----------
  it('F5-5: shuffle 开启后 next() 走满一轮——序列无重复且为原集合', () => {
    const q = new PlayQueue();
    const list = ids(10);
    q.loadContext(list, 2);
    q.setShuffle(true);
    // setShuffle(true) 语义：current 保持不变，剩余曲目随机排在后面（index 归 0）。
    expect(q.current).toBe('t3');
    expect(q.currentPosition).toBe(0);
    const round: string[] = [q.current!];
    for (let i = 0; i < 9; i++) round.push(q.next()!);
    expect(q.next()).toBeNull(); // repeat=off，走完一轮即停
    expect(round).toHaveLength(10);
    assertPermutation(round, list);
  });

  it('F5-5: shuffle 关闭后 order 恢复 original 深等，current 回到原正确位', () => {
    const q = new PlayQueue();
    const list = ids(10);
    q.loadContext(list, 2);
    q.setShuffle(true);
    // 播几首推进指针（洗牌序中推进到哪首是随机的，先捕获关闭时刻的当前曲）。
    q.next();
    q.next();
    const curBeforeOff = q.current;
    q.setShuffle(false);
    expect(q.items).toEqual(list); // 深等 original
    // 关闭语义：current 保持不变，position 恢复为该曲在 original 中的位置。
    expect(q.current).toBe(curBeforeOff);
    expect(q.currentPosition).toBe(list.indexOf(curBeforeOff!));
  });

  it('F5-5: setShuffle 幂等——重复开启不重排（计划代码原样语义：on===shuffle 早退）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(10), 2);
    q.setShuffle(true);
    const before = q.items;
    q.setShuffle(true);
    expect(q.items).toEqual(before);
    expect(q.currentPosition).toBe(0);
  });

  // ---------- F5-6 Repeat × Shuffle 六组合 ----------
  it('F5-6 off/off: 顺序播到队尾 next() 返回 null（播完停止）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(3), 0);
    expect(q.next()).toBe('t2');
    expect(q.next()).toBe('t3');
    expect(q.next()).toBeNull(); // 队尾返回 null
    expect(q.current).toBe('t3'); // 指针停在最后一首
    expect(q.currentPosition).toBe(2);
  });

  it('F5-6 off/all: 队尾绕回队首（不重洗，恢复 original 序）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(3), 0);
    q.setRepeat('all');
    q.next();
    q.next();
    expect(q.next()).toBe('t1'); // 绕回队首
    expect(q.currentPosition).toBe(0);
    expect(q.items).toEqual(['t1', 't2', 't3']); // repeat=all 非 shuffle：原样重来
  });

  it('F5-6 off/one: next() 恒返回当前曲，指针不前进', () => {
    const q = new PlayQueue();
    q.loadContext(ids(3), 0);
    q.setRepeat('one');
    expect(q.next()).toBe('t1');
    expect(q.next()).toBe('t1');
    expect(q.current).toBe('t1');
    expect(q.currentPosition).toBe(0); // 指针不动
    expect(q.upNext).toEqual(['t2', 't3']); // upNext 未被消耗
  });

  it('F5-6 on/off: 洗牌后走完一轮返回 null，序列仍为原集合', () => {
    const q = new PlayQueue();
    const list = ids(6);
    q.loadContext(list, 1);
    q.setShuffle(true);
    const round: string[] = [q.current!];
    for (let i = 0; i < 5; i++) round.push(q.next()!);
    expect(q.next()).toBeNull(); // 走完停止
    assertPermutation(round, list);
  });

  it('F5-6 on/all: 一轮播完后重洗一轮——新序列与旧序列均为原集合（计划代码原样语义：随机+列表循环=重洗）', () => {
    const q = new PlayQueue();
    const list = ids(6);
    q.loadContext(list, 1);
    q.setShuffle(true);
    q.setRepeat('all');
    const round1: string[] = [q.current!];
    for (let i = 0; i < 5; i++) round1.push(q.next()!);
    assertPermutation(round1, list);
    // 队尾再 next()：触发重洗，index 归 0（确定性断言），current 为原集合中某曲。
    const wrapped = q.next();
    expect(wrapped).not.toBeNull();
    expect(q.currentPosition).toBe(0); // 重洗后从 0 重新推进
    const round2: string[] = [wrapped!];
    for (let i = 0; i < 5; i++) round2.push(q.next()!);
    assertPermutation(round2, list);
    // 「重洗」的稳健断言说明：Fisher–Yates 理论上可能两次洗牌结果相同，
    // 故不比较 round1/round2 是否不同，只用「集合性质 + 走满一轮长度 + index 归 0」锚定重洗语义。
  });

  it('F5-6 on/one: 洗牌开启下 next() 恒当前曲', () => {
    const q = new PlayQueue();
    q.loadContext(ids(3), 0);
    q.setShuffle(true);
    const first = q.current!;
    q.setRepeat('one');
    expect(q.next()).toBe(first);
    expect(q.next()).toBe(first);
    expect(q.currentPosition).toBe(0);
  });

  // ---------- F5-3 插队 / 尾插 ----------
  it('F5-3: playNext 插队后播完插队曲回到原顺序（断言后续完整序列）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(5), 0);
    q.playNext('插队曲');
    expect(q.items).toEqual(['t1', '插队曲', 't2', 't3', 't4', 't5']);
    expect(q.next()).toBe('插队曲');
    expect(q.next()).toBe('t2'); // 回到原顺序第 2 首
    // 后续完整序列：t3 → t4 → t5 → null（repeat=off 播完停止）。
    expect(q.next()).toBe('t3');
    expect(q.next()).toBe('t4');
    expect(q.next()).toBe('t5');
    expect(q.next()).toBeNull();
  });

  it('F5-3: enqueue 尾插——插到队尾，播到末尾时播出', () => {
    const q = new PlayQueue();
    q.loadContext(ids(5), 0);
    q.enqueue('尾插曲');
    expect(q.items).toEqual(['t1', 't2', 't3', 't4', 't5', '尾插曲']);
    for (const expected of ['t2', 't3', 't4', 't5', '尾插曲']) {
      expect(q.next()).toBe(expected);
    }
    expect(q.next()).toBeNull();
  });

  // ---------- 队首 previous ----------
  it('队首 previous(): 重启当前曲（返回当前曲，指针不动）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(5), 0);
    expect(q.previous()).toBe('t1'); // 返回当前曲
    expect(q.current).toBe('t1');
    expect(q.currentPosition).toBe(0); // 指针不动
    expect(q.upNext).toEqual(['t2', 't3', 't4', 't5']);
  });

  it('队中 previous(): 回退到上一首（指针前进）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(5), 2);
    expect(q.previous()).toBe('t2');
    expect(q.currentPosition).toBe(1);
  });

  // ---------- 边界 ----------
  it('空队列: next/previous 返回 null，current 为 null', () => {
    const q = new PlayQueue();
    expect(q.next()).toBeNull();
    expect(q.previous()).toBeNull();
    expect(q.current).toBeNull();
    expect(q.items).toEqual([]);
    expect(q.upNext).toEqual([]);
    expect(q.currentPosition).toBe(-1);
  });

  it('边界: 顺序模式 loadContext startIndex 越界——current 为 null，index 保持越界值（计划代码原样语义）', () => {
    const q = new PlayQueue();
    q.loadContext(ids(5), 7);
    expect(q.items).toHaveLength(5);
    expect(q.current).toBeNull(); // order[7] undefined → ?? null
    expect(q.currentPosition).toBe(7); // index 原样存储，不钳制
    // 原样语义推论：next() 视为已在队尾（repeat=off）返回 null。
    expect(q.next()).toBeNull();
  });

  it('边界: shuffle 模式 loadContext startIndex 越界——整体洗牌且 index=-1（计划代码原样语义）', () => {
    const list = ids(5);
    // 先开洗牌再入队，走 cur === undefined 分支
    const q = new PlayQueue();
    q.setShuffle(true);
    q.loadContext(list, 99);
    expect(q.items).toHaveLength(5);
    expect(q.current).toBeNull(); // index=-1
    expect(q.currentPosition).toBe(-1);
    assertPermutation(q.items, list);
    // next() 从 index=-1 前进到 0，产出洗牌序第一首。
    expect(q.next()).not.toBeNull();
    expect(q.currentPosition).toBe(0);
  });

  it('upNext: 切片语义——返回当前曲之后的所有曲目副本', () => {
    const q = new PlayQueue();
    q.loadContext(ids(4), 1);
    expect(q.upNext).toEqual(['t3', 't4']);
    q.next();
    expect(q.upNext).toEqual(['t4']);
    // 副本语义：修改返回值不影响内部状态。
    q.upNext.push('污染');
    expect(q.upNext).toEqual(['t4']);
  });

  // 评审 M1 缺口补锚（T5.1+T5.2 评审 agent-60efcf5c）：original = [...trackIds] 的深拷贝
  // 语义此前无锚——共享引用与拷贝在既有断言下不可区分（变异不红）。本用例使该变异变红：
  // loadContext 后外部原地变异入参数组，队列状态必须不受污染。
  it('loadContext 深拷贝入参：外部变异原数组不污染队列（防御调用方复用数组）', () => {
    const q = new PlayQueue();
    const external = ['t1', 't2', 't3'];
    q.loadContext(external, 0);
    external.push('污染');
    external[0] = '篡改';
    expect(q.items).toEqual(['t1', 't2', 't3']);
    expect(q.current).toBe('t1');
    // shuffle 关闭恢复路径同样基于 original 快照，不受外部变异影响。
    q.setShuffle(true);
    q.setShuffle(false);
    expect(q.items).toEqual(['t1', 't2', 't3']);
  });
});
