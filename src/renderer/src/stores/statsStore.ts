// T4.11 曲库统计 store（zustand）—— library:getStats 的渲染层单一取数点。
//
// 设计留痕（对照 libraryStore / i18n 同风格）：
//   · 取数经 getApi() 惰性读 globalThis.window?.api（结构性类型只声明本 store 用到的两个
//     通道：library.getStats / onScanProgress，不 import preload 的 Api 具体导出——同
//     libraryStore 留痕：避免渲染层耦合 preload 形状，jsdom 单测可逐用例替换桩）。
//   · stats 为 null = 未就绪/取数失败：消费方（Sidebar 徽标 / Songs 页头总数）一律回退
//     「不渲染」形态，绝不渲染 0 或 NaN 冒充真实计数（T4.1「禁假数据」硬约束延续）。
//   · 刷新时机：① 消费方首挂载 ensureStatsLoaded()（幂等，一次）；② scan:progress done
//     自动 refresh（扫描完成 → 总数变化，模式同 libraryStore 的幂等模块级订阅）。
//     页内操作（收藏/播放）不改三类实体总数，无需额外失效点（留痕）。
//   · 未拆 Songs/Sidebar 各自取数：两消费方共享同一份数据，独立取数即同屏两份冗余请求。
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { ScanProgress } from '../../../shared/types';

/** library:getStats 返回形态（与 shared/ipc.ts IpcReturns 同形状的结构性声明）。 */
export interface LibraryStats {
  tracks: number;
  albums: number;
  artists: number;
}

interface StatsApi {
  library: { getStats(): Promise<LibraryStats> };
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
}

function getApi(): StatsApi | undefined {
  return (globalThis as unknown as { window?: { api?: StatsApi } }).window?.api;
}

export interface StatsState {
  stats: LibraryStats | null;
  /** 拉取最新总数；失败静默保留旧值（stats 可能仍为 null——消费方回退不渲染）。 */
  refresh: () => Promise<void>;
}

export const useStatsStore = create<StatsState>((set) => ({
  stats: null,

  refresh: async () => {
    const api = getApi();
    if (!api) return; // preload 未就绪 / 测试未注入：静默跳过（同 libraryStore 留痕）
    try {
      const stats = await api.library.getStats();
      set({ stats });
    } catch (err) {
      // 失败不进渲染层（不 rethrow）：保留既有 stats（可能是 null → 消费方回退纯标题/无徽标）。
      console.warn('[stats] 曲库统计拉取失败', err);
    }
  },
}));

// ---------------------------------------------------------------------------
// scan:progress 订阅（模块级幂等初始化，同 libraryStore ensureScanProgressSubscription 模式）
// ---------------------------------------------------------------------------

let unsubscribeScanProgress: (() => void) | null = null;

/** 幂等订阅 scan:progress：done 相位触发 refresh()（扫描完成后总数自动刷新）。 */
function ensureScanProgressSubscription(): void {
  if (unsubscribeScanProgress) return;
  const api = getApi();
  if (!api) return;
  unsubscribeScanProgress = api.onScanProgress((p) => {
    if (p.phase === 'done') void useStatsStore.getState().refresh();
  });
}

/** 解除订阅并复位（仅供测试隔离 / HMR 清理；生产长驻不调用）。 */
export function stopStatsSubscription(): void {
  unsubscribeScanProgress?.();
  unsubscribeScanProgress = null;
}

// 首次拉取 + 订阅（模块级，同 libraryStore 初始化留痕）。
ensureScanProgressSubscription();

/** 消费方首挂载调用：幂等触发一次 stats 拉取（已拉过/无 api 均为空操作）。 */
export function ensureStatsLoaded(): void {
  ensureScanProgressSubscription();
  if (useStatsStore.getState().stats !== null) return;
  void useStatsStore.getState().refresh();
}

// ---------------------------------------------------------------------------
// 组件入口（useSyncExternalStore 适配，同 useLibrary 形态：显式 getState() 快照保证
// SSR/node 可测行为一致）
// ---------------------------------------------------------------------------

export function useStats(): { stats: LibraryStats | null } {
  const snapshot = useSyncExternalStore(
    useStatsStore.subscribe,
    useStatsStore.getState,
    useStatsStore.getState
  );
  return { stats: snapshot.stats };
}

/**
 * 计数格式化（单一口径点）：千位分隔，与设计稿「30,000」一致（mockups/Songs.html 页头与
 * nav-badge 均带逗号）。zh-CN 分组符即 ','，显式传 locale 锁死（不随宿主环境漂移）。
 */
export function formatCount(n: number): string {
  return n.toLocaleString('zh-CN');
}
