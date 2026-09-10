// T4.2 libraryStore —— 渲染层曲库列表 store（zustand）。目录 `stores/` 由计划 §目录结构指定。
//
// 设计留痕（对照 T3.5 i18n 运行时，保持同风格）：
//   · 取数经 getApi() 惰性读 globalThis.window?.api（同 i18n getApi）——不在模块加载时固化
//     api 引用，jsdom 单测可逐用例替换 window.api 桩、无需 vi.resetModules；结构性类型
//     LibraryApi 只声明本 store 用到的两个通道（listSongs / onScanProgress），不 import
//     preload 的 Api 具体导出（避免渲染层耦合 preload 形状，node 侧亦可用）。
//   · 列表数据边界（最小化，留痕）：只做 Songs 所需的 TrackRow[]；albums/artists **不缓存**——
//     本任务无专辑/艺术家页消费者，缓存即无消费者的状态（各页 T4.4 起自取）。
//   · 分页/排序参数收口于 params：{ sortBy, order, offset, limit }（SortKey 白名单 7 键）。
//   · refresh() 并发保护用「请求序号」（见下）；失败不抛到渲染层，转 error 状态（toErrorMessage）。
//   · setSort/setPage 在 set 参数后**自动 refresh**（同 i18n `setLanguage` 内部 void loadMessages 的先例）：
//     排序/翻页是离散用户动作，调用方无需（也不应）再手动 refresh——消除「忘 refresh → UI 静默不动」
//     的静默失效。取数仍可脱离 setter 单独经 refresh() 触发（参数设置与取数各自可用）。
//   · scan:progress done → 自动 refresh：模块级幂等订阅（同 i18n ensureLoaded 模式），
//     renderer bundle 长驻，订阅一次不解除（生命周期见 ensureScanProgressSubscription 注释）。
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { ScanProgress, SortKey, SortOrder, TrackRow } from '../../../shared/types';
import { toErrorMessage } from '../ipc/client';

// ---------------------------------------------------------------------------
// 取数通道（结构性类型，不依赖 preload 具体导出；测试注入桩）
// ---------------------------------------------------------------------------

/** library:listSongs 入参（§3.6；order/offset/limit 可省，主进程有默认与钳制）。 */
interface ListSongsParams {
  sortBy: SortKey;
  order?: SortOrder;
  offset?: number;
  limit?: number;
}

interface LibraryApi {
  library: { listSongs(params: ListSongsParams): Promise<TrackRow[]> };
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
}

function getApi(): LibraryApi | undefined {
  return (globalThis as unknown as { window?: { api?: LibraryApi } }).window?.api;
}

// ---------------------------------------------------------------------------
// 状态形态
// ---------------------------------------------------------------------------

/** 分页 / 排序参数。setSort 变更时 offset 归零（回到新排序的首页）。 */
export interface LibraryParams {
  sortBy: SortKey;
  order: SortOrder;
  offset: number;
  limit: number;
}

/**
 * 默认参数：与主进程 repo 的 listSongs 默认一致（title / asc / offset 0 / limit 50）。
 * 注意主进程 clampLimit 上界 200——渲染层默认 50（首屏一页），分页由 UI 驱动。
 */
export const DEFAULT_LIBRARY_PARAMS: LibraryParams = {
  sortBy: 'title',
  order: 'asc',
  offset: 0,
  limit: 50,
};

export interface LibraryState {
  songs: TrackRow[];
  loading: boolean;
  /** 最近一次 refresh 的失败信息（无错误为 null）；不阻塞渲染，供列表页展示。 */
  error: string | null;
  params: LibraryParams;
  /** 按当前 params 重新拉取 listSongs 并 set；失败写入 error，不 reject。 */
  refresh: () => Promise<void>;
  /** 设置排序（sortBy/order 白名单）；offset 归零；随后自动 refresh()（同 i18n setLanguage 先例）。 */
  setSort: (sortBy: SortKey, order: SortOrder) => void;
  /** 设置分页；随后自动 refresh()（同 setSort）。 */
  setPage: (offset: number, limit: number) => void;
}

// 请求序号：refresh 并发保护。ipcRenderer.invoke 无 AbortSignal（无法取消主进程侧查询），
// 且返回体小，唯一真实风险是「旧请求晚到覆盖新结果」——序号令牌即可消除：
// 每次 refresh 递增并记下，await 回来后若已非最新序号则丢弃该次 set（含成功与失败分支）。
let requestSeq = 0;

export const useLibraryStore = create<LibraryState>((set) => ({
  songs: [],
  loading: false,
  error: null,
  params: { ...DEFAULT_LIBRARY_PARAMS },

  refresh: async () => {
    const api = getApi();
    if (!api) {
      // preload 未就绪 / 测试未注入：静默跳过，不置 loading（避免卡住的首屏 loading，留痕）。
      console.warn('[library] window.api 不可用，跳过曲库拉取');
      return;
    }
    const seq = ++requestSeq;
    // 快照当前 params：保证 invoke payload 与本次请求序号取自同一状态。
    const { sortBy, order, offset, limit } = useLibraryStore.getState().params;
    set({ loading: true, error: null });
    try {
      const songs = await api.library.listSongs({ sortBy, order, offset, limit });
      if (seq !== requestSeq) return; // 旧请求晚到：丢弃，不覆盖新结果
      set({ songs, loading: false });
    } catch (err) {
      if (seq !== requestSeq) return; // 旧请求的失败同样丢弃
      // 失败不进渲染层（不 rethrow）：转 error 状态；保留既有 songs（瞬时失败不清空列表）。
      set({ loading: false, error: toErrorMessage(err) });
      console.warn('[library] 曲库拉取失败', err);
    }
  },

  setSort: (sortBy, order) => {
    set((s) => ({ params: { ...s.params, sortBy, order, offset: 0 } }));
    // 自动重取（留痕：不 debounce——排序是离散动作；连续 setSort+setPage 会发两次请求，
    // 但序号守卫保证只有最后一次生效，多出的一次 IPC 罕见且无害，故不合并/不抽批量设参 API）。
    void useLibraryStore.getState().refresh();
  },

  setPage: (offset, limit) => {
    set((s) => ({ params: { ...s.params, offset, limit } }));
    void useLibraryStore.getState().refresh();
  },
}));

// ---------------------------------------------------------------------------
// scan:progress 订阅（模块级幂等初始化，同 i18n ensureLoaded 模式）
// ---------------------------------------------------------------------------

// 已订阅句柄（null = 未订阅）。长驻单例：renderer bundle 生命周期内只订阅一次，
// 不随组件挂载/卸载反复订阅（故模块级持有，不经组件 useEffect）。
let unsubscribeScanProgress: (() => void) | null = null;

/**
 * 幂等订阅 scan:progress：done 相位触发 refresh()（扫描完成后自动刷新列表）。
 * 重复调用为空操作；api 未就绪时静默跳过，Phase 4 App 挂载可再调重试（同 i18n ensureLoaded 留痕）。
 * 返回的 unsubscribe 交由模块级单例持有，正常生命周期不解除（renderer 长驻）；
 * 仅测试/热重载经 stopScanProgressSubscription() 复位（见下）。
 */
export function ensureScanProgressSubscription(): void {
  if (unsubscribeScanProgress) return;
  const api = getApi();
  if (!api) return;
  unsubscribeScanProgress = api.onScanProgress((p) => {
    if (p.phase === 'done') void useLibraryStore.getState().refresh();
  });
}

/** 解除订阅并复位（仅供测试隔离 / HMR 清理；生产长驻不调用）。 */
export function stopScanProgressSubscription(): void {
  unsubscribeScanProgress?.();
  unsubscribeScanProgress = null;
}

// 模块级初始化：renderer bundle 加载即订阅一次。
ensureScanProgressSubscription();

// ---------------------------------------------------------------------------
// 组件入口（useSyncExternalStore 适配，同 i18n useI18n）
// ---------------------------------------------------------------------------

export interface UseLibrary {
  songs: TrackRow[];
  loading: boolean;
  error: string | null;
  params: LibraryParams;
  refresh: () => Promise<void>;
  setSort: (sortBy: SortKey, order: SortOrder) => void;
  setPage: (offset: number, limit: number) => void;
}

/**
 * 组件用入口：经 useSyncExternalStore 订阅 zustand store，state 变更即重渲染。
 * 用 getState() 整快照而非 useLibraryStore(selector)：zustand v5 在 server 快照下回退
 * getInitialState()（初始空态），显式 getState() 保证 SSR/node 可测行为一致（同 i18n 留痕）。
 */
export function useLibrary(): UseLibrary {
  const snapshot = useSyncExternalStore(
    useLibraryStore.subscribe,
    useLibraryStore.getState,
    useLibraryStore.getState
  );
  return {
    songs: snapshot.songs,
    loading: snapshot.loading,
    error: snapshot.error,
    params: snapshot.params,
    refresh: snapshot.refresh,
    setSort: snapshot.setSort,
    setPage: snapshot.setPage,
  };
}
