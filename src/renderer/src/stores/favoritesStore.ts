// T6.1 收藏共享切片（zustand）—— TrackList 行 ♡/♥、PlayerBar 收藏钮、Liked 页三处的
// **唯一事实源**。此前 TrackList 纯展示（按 track.favorite 渲染，互不同步）与 PlayerBar 各自
// 对 currentTrack.favorite 做局部乐观更新（T5.4）——同一首歌在列表点亮 ♥ 后播放栏纹丝不动。
// 本切片把「哪些曲目已收藏」收口为一份状态，三处均读它、均经它写。
//
// 设计留痕（对照 libraryStore / statsStore 惯例）：
//   · 取数经惰性 getApi() 读 window.api（结构性类型 FavoritesApi，不 import preload 具体导出，
//     jsdom 可逐用例换桩）。
//   · createFavoritesStore(deps) 可测工厂 + 模块级单例：单测用工厂注入 getApi/warn 桩，无需
//     window；生产用 defaultGetApi 读 window.api。subscribe 由 zustand create 提供（供
//     useSyncExternalStore 适配，同 libraryStore）。
//   · 状态：favoriteIds（已收藏 id 集合，O(1) isFavorite）、favorites（Liked 页展示用的
//     TrackRow[]，含 loading/error/loaded 供取数态）、sortBy（服务端排序键，5 键白名单）。
//   · toggle 乐观更新 + 失败回滚（T5.4 评审记账「收藏失败静默」的修复点）：先改集合/列表 → 调
//     api.favorites.set → reject 则回滚并 console.warn（旧实现只告警、不回滚，UI 与库不一致）。
//   · ensureLoaded 幂等：应用启动 / 首次进入 Liked 页建立集合，已加载或取数在飞时为空操作。
//   · refresh(sortBy) 并发保护用请求序号：旧请求晚到不得覆盖新排序结果（同 libraryStore）。
//   · 已知边界（留痕）：favoriteIds 仅含「服务器已返回的收藏」；loaded=false 期间消费方回退
//     track.favorite（见 useFavorites 使用说明）。并发 toggle 的回滚以最近一次快照为准。
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import type { TrackRow } from '../../../shared/types';
import { toErrorMessage } from '../ipc/client';

// ---------------------------------------------------------------------------
// 取数通道（结构性类型，不依赖 preload 具体导出；测试注入桩）
// ---------------------------------------------------------------------------

/** Liked 页排序键白名单（§3.7 / design-plan §4.6：favorited_at/artist/album/title/playCount）。
 *  与服务端 trackRepo.listFavorites 白名单、main/ipc FAVORITE_SORT_KEYS 三处一致（契约在 shared/ipc.ts）。 */
export type FavoriteSortKey = 'favorited_at' | 'artist' | 'album' | 'title' | 'playCount';

export const FAVORITE_SORT_KEYS: readonly FavoriteSortKey[] = [
  'favorited_at',
  'artist',
  'album',
  'title',
  'playCount',
];

/** 默认排序：最近收藏（设计稿 Liked.html 下拉首项）。 */
export const DEFAULT_FAVORITE_SORT: FavoriteSortKey = 'favorited_at';

/** favorites:list / favorites:set 两通道的结构性声明（见 shared/ipc.ts IpcPayloads/IpcReturns）。 */
export interface FavoritesApi {
  favorites: {
    list(sortBy: string): Promise<TrackRow[]>;
    set(trackId: string, favorite: boolean): Promise<void>;
  };
}

/**
 * 默认取数通道：惰性读 window.api.favorites。**两方法齐备**才认作可用——browseFixtures 的 Proxy
 * 对未知字段回退为 no-op 函数，若只判存在会把 `api.favorites`（一个函数）误当对象。缺失即
 * 视作「preload 未就绪 / 测试未注入」，消费方回退 track.favorite，取数静默跳过。
 */
function defaultGetApi(): FavoritesApi | undefined {
  const api = (globalThis as unknown as { window?: { api?: unknown } }).window?.api as
    | { favorites?: { list?: unknown; set?: unknown } }
    | undefined;
  if (
    !api?.favorites ||
    typeof api.favorites.list !== 'function' ||
    typeof api.favorites.set !== 'function'
  ) {
    return undefined;
  }
  return api as unknown as FavoritesApi;
}

export interface FavoritesStoreDeps {
  /** 取数通道（惰性，每次动作时调用，便于测试换桩）。 */
  getApi: () => FavoritesApi | undefined;
  /** 告警出口（默认 console.warn；测试可注入 spy）。 */
  warn?: (message: string, err?: unknown) => void;
}

// ---------------------------------------------------------------------------
// 状态形态与可测工厂
// ---------------------------------------------------------------------------

export interface FavoritesState {
  /** 已收藏曲目 id 集合（服务端已返回的权威集合；写经 toggle / refresh）。 */
  favoriteIds: ReadonlySet<string>;
  /** Liked 页展示行（按 sortBy 服务端排序；toggle 取消收藏时乐观移除）。 */
  favorites: TrackRow[];
  /** 当前排序键（服务端排序）。 */
  sortBy: FavoriteSortKey;
  /** 列表取数中（Liked 页 loading 态）。 */
  loading: boolean;
  /** 最近一次取数失败信息（无错误为 null）。 */
  error: string | null;
  /** 集合是否已从服务端建立（false = 未知，消费方回退 track.favorite）。 */
  loaded: boolean;
  /** 是否已收藏（读集合）。 */
  isFavorite: (trackId: string) => boolean;
  /** 乐观切换收藏并上报；失败回滚 + warn。next 省略时按当前集合取反。 */
  toggle: (trackId: string, next?: boolean) => Promise<void>;
  /** 建立集合（幂等：已加载或取数在飞时为空操作）。 */
  ensureLoaded: () => void;
  /** 按 sortBy（省略用当前值）重取列表并重建集合；失败写 error，不 rethrow。 */
  refresh: (sortBy?: FavoriteSortKey) => Promise<void>;
}

export function createFavoritesStore(deps: FavoritesStoreDeps) {
  const warn = deps.warn ?? ((message: string, err?: unknown) => console.warn(message, err));
  // 请求序号：refresh 并发保护（旧请求晚到不得覆盖新排序结果，同 libraryStore 留痕）。
  let requestSeq = 0;

  return create<FavoritesState>((set, get) => ({
    favoriteIds: new Set<string>(),
    favorites: [],
    sortBy: DEFAULT_FAVORITE_SORT,
    loading: false,
    error: null,
    loaded: false,

    isFavorite: (trackId) => get().favoriteIds.has(trackId),

    ensureLoaded: () => {
      const state = get();
      // 幂等：已加载或正在取数（refresh 已同步置 loading）时不重复发请求。
      if (state.loaded || state.loading) return;
      void state.refresh();
    },

    refresh: async (sortBy) => {
      const api = deps.getApi();
      if (!api) {
        // preload 未就绪 / 测试未注入：静默跳过，不置 loading（同 libraryStore 留痕），
        // loaded 保持 false → 消费方回退 track.favorite。
        warn('[favorites] window.api.favorites 不可用，跳过收藏列表拉取');
        return;
      }
      const nextSort = sortBy ?? get().sortBy;
      const seq = ++requestSeq;
      set({ loading: true, error: null, sortBy: nextSort });
      try {
        const rows = await api.favorites.list(nextSort);
        if (seq !== requestSeq) return; // 旧请求晚到：丢弃，不覆盖新结果
        set({
          favorites: rows,
          favoriteIds: new Set(rows.map((r) => r.id)),
          loading: false,
          loaded: true,
        });
      } catch (err) {
        if (seq !== requestSeq) return; // 旧请求的失败同样丢弃
        // 失败不进渲染层（不 rethrow）：转 error 状态，loaded 保持原值（未加载则可重试）。
        set({ loading: false, error: toErrorMessage(err) });
        warn('[favorites] 收藏列表拉取失败', err);
      }
    },

    toggle: async (trackId, next) => {
      const api = deps.getApi();
      if (!api) {
        warn('[favorites] window.api.favorites 不可用，忽略收藏切换');
        return;
      }
      const prevIds = get().favoriteIds;
      const prevFavorites = get().favorites;
      const wasFavorite = prevIds.has(trackId);
      const nextFav = next ?? !wasFavorite;

      // 乐观更新：先改集合与列表，UI 立即反映。
      set((s) => {
        const ids = new Set(s.favoriteIds);
        if (nextFav) ids.add(trackId);
        else ids.delete(trackId);
        // 取消收藏：同步从 Liked 列表移除（否则列表残留已取消的行）；
        // 收藏：本动作只拿到 trackId，无完整 TrackRow 可插入列表——不伪造行，靠后续 refresh 补齐（留痕）。
        const favorites = nextFav ? s.favorites : s.favorites.filter((r) => r.id !== trackId);
        return { favoriteIds: ids, favorites };
      });

      try {
        await api.favorites.set(trackId, nextFav);
      } catch (err) {
        // 失败回滚：集合按原值还原该 id；列表还原到切换前快照（恢复被移除的行）。
        set((s) => {
          const ids = new Set(s.favoriteIds);
          if (wasFavorite) ids.add(trackId);
          else ids.delete(trackId);
          return { favoriteIds: ids, favorites: prevFavorites };
        });
        warn('[favorites] 收藏写入失败，已回滚', err);
      }
    },
  }));
}

// ---------------------------------------------------------------------------
// 单例 + 组件入口
// ---------------------------------------------------------------------------

/** 应用单例：生产经 window.api 取数（惰性）。 */
export const useFavoritesStore = createFavoritesStore({ getApi: defaultGetApi });

/** 应用启动 / 首次进入 Liked 页调用：幂等建立收藏集合（同 statsStore.ensureStatsLoaded 形态）。 */
export function ensureFavoritesLoaded(): void {
  useFavoritesStore.getState().ensureLoaded();
}

export interface UseFavorites {
  favoriteIds: ReadonlySet<string>;
  favorites: TrackRow[];
  sortBy: FavoriteSortKey;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  isFavorite: (trackId: string) => boolean;
  toggle: (trackId: string, next?: boolean) => Promise<void>;
  refresh: (sortBy?: FavoriteSortKey) => Promise<void>;
}

/**
 * 组件用入口：经 useSyncExternalStore 订阅 zustand store，收藏变更即重渲染。
 * 用 getState() 整快照而非 selector：zustand v5 server 快照回退 getInitialState()，
 * 显式 getState() 保证 SSR/node 可测行为一致（同 libraryStore 留痕）。
 *
 * 消费方注意（loaded 语义）：loaded=false 时 favoriteIds 尚不代表完整收藏集——
 * 曲目行应回退 track.favorite（TrackList 的 favoriteIds 传 undefined），播放栏 ♥ 应回退
 * currentTrack.favorite；loaded=true 后一律以本切片为准。
 */
export function useFavorites(): UseFavorites {
  const snapshot = useSyncExternalStore(
    useFavoritesStore.subscribe,
    useFavoritesStore.getState,
    useFavoritesStore.getState
  );
  return {
    favoriteIds: snapshot.favoriteIds,
    favorites: snapshot.favorites,
    sortBy: snapshot.sortBy,
    loading: snapshot.loading,
    error: snapshot.error,
    loaded: snapshot.loaded,
    isFavorite: snapshot.isFavorite,
    toggle: snapshot.toggle,
    refresh: snapshot.refresh,
  };
}
