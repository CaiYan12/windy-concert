// src/renderer/src/player/queue.ts
export type RepeatMode = 'off' | 'all' | 'one';

function shuffle<T>(arr: T[]): T[] {  // Fisher–Yates
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class PlayQueue {
  private original: string[] = [];   // 原始顺序（F5-5 关闭后恢复此序）
  private order: string[] = [];      // 当前播放顺序
  private index = -1;
  shuffle = false;
  repeat: RepeatMode = 'off';

  get current(): string | null { return this.order[this.index] ?? null; }
  get upNext(): string[] { return this.order.slice(this.index + 1); }
  get items(): string[] { return [...this.order]; }
  get currentPosition(): number { return this.index; }

  /** F5-2 上下文入队：整表入队并从 startIndex 播 */
  loadContext(trackIds: string[], startIndex: number): void {
    this.original = [...trackIds];
    if (this.shuffle) {
      const cur = trackIds[startIndex];
      this.order = cur === undefined ? shuffle(trackIds) : [cur, ...shuffle(trackIds.filter(t => t !== cur))];
      this.index = cur === undefined ? -1 : 0;
    } else {
      this.order = [...trackIds];
      this.index = startIndex;
    }
  }

  /** F5-3 插队：当前曲后插入 */
  playNext(trackId: string): void {
    this.order.splice(this.index + 1, 0, trackId);
    this.original.push(trackId);
  }

  /** F5-3 尾插 */
  enqueue(trackId: string): void {
    this.order.push(trackId);
    this.original.push(trackId);
  }

  /** F5-6 Repeat 三态 × Shuffle（6 组合行为见单测） */
  next(): string | null {
    if (this.order.length === 0) return null;
    if (this.repeat === 'one') return this.current;
    if (this.index < this.order.length - 1) { this.index += 1; return this.current; }
    if (this.repeat === 'all') {
      this.order = this.shuffle ? shuffle(this.original) : [...this.original]; // 随机+列表循环=重洗一轮
      this.index = 0;
      return this.current;
    }
    return null; // 播完停止
  }

  previous(): string | null {
    if (this.order.length === 0) return null;
    if (this.index > 0) { this.index -= 1; return this.current; }
    if (this.repeat === 'all') { this.index = this.order.length - 1; return this.current; }
    return this.current; // 队首时重启当前曲
  }

  /** F5-5 洗牌开关：播完一轮前无重复；关闭恢复原顺序 */
  setShuffle(on: boolean): void {
    if (on === this.shuffle) return;
    const cur = this.current;
    this.shuffle = on;
    if (on) {
      this.order = cur ? [cur, ...shuffle(this.order.filter(t => t !== cur))] : shuffle(this.order);
      this.index = cur ? 0 : -1;
    } else {
      this.order = [...this.original];
      this.index = cur ? this.order.indexOf(cur) : -1;
    }
  }

  setRepeat(mode: RepeatMode): void { this.repeat = mode; }
}
