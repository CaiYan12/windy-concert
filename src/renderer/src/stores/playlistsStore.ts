// T6.2 / T6.3 歌单共享切片（zustand）—— Playlists 网格页 / PlaylistDetail 详情页 /
// Sidebar「我的歌单」列表三处的**唯一事实源**；同时承载 T6.3 拖拽重排的本地乐观更新。
//
// 设计留痕（对照 favoritesStore / libraryStore 惯例）：
//   · 取数经惰性 getApi() 读 window.api（结构性类型 PlaylistsApi，不 import preload 具体导出，
//     jsdom 可逐用例换桩）；**八方法齐备**才认作可用（browseFixtures 的 Proxy 对未知字段回退
//     为 no-op 函数，只判 api.playlists 存在会把一个函数误当对象）。
//   · createPlaylistsStore(deps) 可测工厂 + 模块级单例：单测用工厂注入 getApi/warn 桩，无需 window。
//   · 状态分两段：**列表段**（playlists/listLoading/listError/listLoaded，Playlists 页 + Sidebar 用）
//     与**详情段**（detailId/detail/detailLoading/detailError，PlaylistDetail 用）。两段各自带
//     请求序号（listSeq / detailSeq）做并发保护——旧请求晚到不得覆盖新结果（同 favoritesStore）。
//   · 写操作一律「乐观更新 + 失败回滚 + warn」：rename / delete / removeTrack / reorder 先改本地
//     再 await；reject 时用切换前快照还原（UI 与库始终一致，不留「界面已改、库里没改」的假象）。
//   · create 用 creating 重入守卫（Enter 连击不发两次请求）；**不做本地乐观插入**——服务端以
//     name ASC 排序，本地插入会伪造顺序，改由成功后 refresh() 取权威顺序（服务端排序为准）。
//   · addTracks / removeTrack 后本地**不伪造 TrackRow**：新增曲目需服务端返回完整行（封面/规格/
//     状态），故 addTracks 成功后重取详情（同歌单 id 时）并刷新列表 trackCount。
//   · 纯函数提炼（jsdom 无布局测量 / 重复曲目语义）：applyTrackOrder（行内 index → 新顺序）与
//     orderTracksByIds（id 序列 → 新顺序）在模块顶层导出，单测直接锚定，无需渲染。
//
// 已知边界（留痕）：detail 段只保一份（当前打开的歌单）；detailId 变化即作废旧 detail，
// 避免切换歌单时闪现上一歌单的曲目。listLoaded=false 期间 Sidebar 不渲染假歌单。
import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { TrackRow } from '../../../shared/types'
// 纯类型依赖（import type 被 tsc/esbuild 擦除，运行时零 main 代码进入 renderer 产物）。
// PlaylistRow / PlaylistDetail 是 repo 层返回形态的收口点（见 shared/ipc.ts IpcReturns 同款引用）。
import type { PlaylistDetail, PlaylistRow } from '../../../main/database/repositories/playlistRepo'
import { toErrorMessage } from '../ipc/client'

// ---------------------------------------------------------------------------
// 取数通道（结构性类型，不依赖 preload 具体导出；测试注入桩）
// ---------------------------------------------------------------------------

/** playlists:* 八通道的结构性声明（见 shared/ipc.ts IpcPayloads / IpcReturns）。 */
export interface PlaylistsApi {
  playlists: {
    list(): Promise<PlaylistRow[]>
    get(id: number): Promise<PlaylistDetail>
    create(name: string): Promise<PlaylistRow>
    rename(id: number, name: string): Promise<void>
    delete(id: number): Promise<void>
    addTracks(id: number, trackIds: string[]): Promise<void>
    removeTrack(id: number, trackId: string): Promise<void>
    reorder(id: number, trackIds: string[]): Promise<void>
  }
}

/** 可用性判定所要求的八方法（缺一即视作 preload 未就绪 / 测试未注入）。 */
const REQUIRED_METHODS = [
  'list',
  'get',
  'create',
  'rename',
  'delete',
  'addTracks',
  'removeTrack',
  'reorder'
] as const

function defaultGetApi(): PlaylistsApi | undefined {
  const api = (globalThis as unknown as { window?: { api?: unknown } }).window?.api as
    | { playlists?: Record<string, unknown> }
    | undefined
  if (!api?.playlists) return undefined
  for (const method of REQUIRED_METHODS) {
    if (typeof api.playlists[method] !== 'function') return undefined
  }
  return api as unknown as PlaylistsApi
}

export interface PlaylistsStoreDeps {
  /** 取数通道（惰性，每次动作时调用，便于测试换桩）。 */
  getApi: () => PlaylistsApi | undefined
  /** 告警出口（默认 console.warn；测试可注入 spy）。 */
  warn?: (message: string, err?: unknown) => void
}

// ---------------------------------------------------------------------------
// 纯函数（单测锚点，无副作用）
// ---------------------------------------------------------------------------

/**
 * 纯函数：T6.3 拖拽重排的行内 index → 新顺序。
 *
 * 语义（对照 PlaylistDetail.html 的拖拽说明「目标行上缘 2px 插入线」）：把 fromIndex 行插入到
 * toIndex 行的**上缘**（即最终位于原 toIndex 行之前）。
 *   · fromIndex === toIndex 或任一越界 → 返回**原数组引用**（调用方据此判定 no-op，不发请求）。
 *   · 向下拖（from < to）：源行移除后目标行左移一位，故插入位为 to - 1。
 *   · 向上拖（from > to）：插入位即 to。
 * 允许重复元素（歌单允许同一曲目多次入单）——按位置移动，与 id 无关。
 */
export function applyTrackOrder<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items as T[]
  if (fromIndex < 0 || fromIndex >= items.length) return items as T[]
  if (toIndex < 0 || toIndex >= items.length) return items as T[]
  const next = items.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, moved)
  return next
}

/**
 * 纯函数：按 trackId 序列重排曲目数组（reorder 的本地乐观更新用）。
 *
 * 歌单**允许重复曲目**，故不能按 id 建索引（重复 id 会互相顶替）；改为按 id 分桶，
 * 逐个 id 从桶里取出一条，保持 trackIds 的出现次序。trackIds 中不存在的 id 被忽略。
 */
export function orderTracksByIds(
  tracks: readonly TrackRow[],
  trackIds: readonly string[]
): TrackRow[] {
  const buckets = new Map<string, TrackRow[]>()
  for (const track of tracks) {
    const bucket = buckets.get(track.id)
    if (bucket) bucket.push(track)
    else buckets.set(track.id, [track])
  }
  const ordered: TrackRow[] = []
  for (const id of trackIds) {
    const bucket = buckets.get(id)
    if (bucket && bucket.length > 0) ordered.push(bucket.shift() as TrackRow)
  }
  return ordered
}

// ---------------------------------------------------------------------------
// 状态形态与可测工厂
// ---------------------------------------------------------------------------

export interface PlaylistsState {
  // ---- 列表段（Playlists 页 + Sidebar） ----
  /** 歌单列表（服务端 name ASC 排序）。 */
  playlists: PlaylistRow[]
  /** 列表取数中（Playlists 页 loading 态）。 */
  listLoading: boolean
  /** 最近一次列表取数失败信息（无错误为 null）。 */
  listError: string | null
  /** 列表是否已从服务端加载（false = 未知，Sidebar 不渲染假歌单）。 */
  listLoaded: boolean
  /** 创建请求在飞（重入守卫；UI 可据此禁用输入）。 */
  creating: boolean

  // ---- 详情段（PlaylistDetail） ----
  /** 当前详情对应的歌单 id（null = 未打开任何歌单）。 */
  detailId: number | null
  /** 当前歌单详情（playlist 可能为 null = 歌单不存在）。 */
  detail: PlaylistDetail | null
  /** 详情取数中。 */
  detailLoading: boolean
  /** 最近一次详情取数失败信息。 */
  detailError: string | null

  /** 建立列表（幂等：已加载或取数在飞时为空操作）。 */
  ensureLoaded: () => void
  /** 重取列表；失败写 listError，不 rethrow。 */
  refresh: () => Promise<void>
  /** 打开/重取某歌单详情（同 id 重取保留旧行不闪空）。 */
  loadDetail: (id: number) => Promise<void>
  /** 新建歌单；空名拒绝，重入守卫；成功返回新行（并已刷新列表），失败返回 null。 */
  create: (name: string) => Promise<PlaylistRow | null>
  /** 重命名（乐观更新列表 + 详情）；失败回滚，返回是否成功。 */
  rename: (id: number, name: string) => Promise<boolean>
  /** 删除歌单（乐观从列表移除）；失败回滚，返回是否成功。 */
  remove: (id: number) => Promise<boolean>
  /** 添加曲目（成功后重取详情 + 刷新列表计数）；失败返回 false。 */
  addTracks: (id: number, trackIds: string[]) => Promise<boolean>
  /** 移除曲目（乐观移除最小 index 的一次出现 + 计数 -1）；失败回滚。 */
  removeTrack: (id: number, trackId: string) => Promise<boolean>
  /** 全量重排（乐观按 id 序列重排详情）；空数组拒绝（与 repo 守卫同口径）。 */
  reorder: (id: number, trackIds: string[]) => Promise<boolean>
}

export function createPlaylistsStore(deps: PlaylistsStoreDeps) {
  const warn = deps.warn ?? ((message: string, err?: unknown) => console.warn(message, err))
  // 并发保护：旧请求晚到不得覆盖新结果（同 favoritesStore 的 requestSeq 留痕）。
  let listSeq = 0
  let detailSeq = 0

  return create<PlaylistsState>((set, get) => ({
    playlists: [],
    listLoading: false,
    listError: null,
    listLoaded: false,
    creating: false,

    detailId: null,
    detail: null,
    detailLoading: false,
    detailError: null,

    ensureLoaded: () => {
      const state = get()
      // 幂等：已加载或正在取数时不重复发请求。
      if (state.listLoaded || state.listLoading) return
      void state.refresh()
    },

    refresh: async () => {
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，跳过歌单列表拉取')
        return
      }
      const seq = ++listSeq
      set({ listLoading: true, listError: null })
      try {
        const rows = await api.playlists.list()
        if (seq !== listSeq) return // 旧请求晚到：丢弃
        set({ playlists: rows, listLoading: false, listLoaded: true })
      } catch (err) {
        if (seq !== listSeq) return
        set({ listLoading: false, listError: toErrorMessage(err) })
        warn('[playlists] 歌单列表拉取失败', err)
      }
    },

    loadDetail: async (id) => {
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，跳过歌单详情拉取')
        return
      }
      const seq = ++detailSeq
      // 换歌单（id 变化）时清空旧 detail，避免闪现上一歌单曲目；同 id 重取保留旧行不闪空。
      set((s) => ({
        detailId: id,
        detail: s.detailId === id ? s.detail : null,
        detailLoading: true,
        detailError: null
      }))
      try {
        const detail = await api.playlists.get(id)
        if (seq !== detailSeq) return
        set({ detail, detailLoading: false })
      } catch (err) {
        if (seq !== detailSeq) return
        set({ detailLoading: false, detailError: toErrorMessage(err) })
        warn('[playlists] 歌单详情拉取失败', err)
      }
    },

    create: async (name) => {
      const trimmed = name.trim()
      if (trimmed.length === 0) return null // 空名拒绝（与 IPC handler 校验同口径）
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略新建歌单')
        return null
      }
      if (get().creating) return null // 重入守卫：Enter 连击不发两次请求
      set({ creating: true })
      try {
        const row = await api.playlists.create(trimmed)
        // 不本地插入（会伪造 name ASC 顺序）；refresh 取服务端权威顺序。
        await get().refresh()
        return row
      } catch (err) {
        warn('[playlists] 新建歌单失败', err)
        return null
      } finally {
        set({ creating: false })
      }
    },

    rename: async (id, name) => {
      const trimmed = name.trim()
      if (trimmed.length === 0) return false
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略重命名')
        return false
      }
      const prevList = get().playlists
      const prevDetail = get().detail
      // 乐观更新：列表行 + 详情标题同步改名。
      set((s) => ({
        playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
        detail:
          s.detail && s.detail.playlist?.id === id
            ? { ...s.detail, playlist: { ...s.detail.playlist, name: trimmed } }
            : s.detail
      }))
      try {
        await api.playlists.rename(id, trimmed)
        return true
      } catch (err) {
        set({ playlists: prevList, detail: prevDetail })
        warn('[playlists] 重命名失败，已回滚', err)
        return false
      }
    },

    remove: async (id) => {
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略删除歌单')
        return false
      }
      const prevList = get().playlists
      // 乐观移除该行；详情段不动（由调用方负责导航离开，避免删除中途闪现空态）。
      set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }))
      try {
        await api.playlists.delete(id)
        return true
      } catch (err) {
        set({ playlists: prevList })
        warn('[playlists] 删除歌单失败，已回滚', err)
        return false
      }
    },

    addTracks: async (id, trackIds) => {
      if (trackIds.length === 0) return false
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略添加曲目')
        return false
      }
      try {
        await api.playlists.addTracks(id, trackIds)
      } catch (err) {
        warn('[playlists] 添加到歌单失败', err)
        return false
      }
      // 新增曲目需服务端返回完整 TrackRow（本地无封面/规格/状态数据）→ 同歌单时重取详情。
      if (get().detailId === id) await get().loadDetail(id)
      // 列表 trackCount 联动（Playlists 页卡片副标题）。
      await get().refresh()
      return true
    },

    removeTrack: async (id, trackId) => {
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略移除曲目')
        return false
      }
      const prevList = get().playlists
      const prevDetail = get().detail
      // 乐观：仅移除该曲目最小 index 的一次出现（与 repo 语义一致——重复曲目只删一条），
      // 详情计数与列表 trackCount 同步 -1。
      set((s) => {
        if (!s.detail || s.detail.playlist?.id !== id) return {}
        const index = s.detail.tracks.findIndex((t) => t.id === trackId)
        if (index < 0) return {}
        const tracks = s.detail.tracks.slice()
        tracks.splice(index, 1)
        const dec = (n: number): number => Math.max(0, n - 1)
        return {
          detail: {
            ...s.detail,
            playlist: { ...s.detail.playlist, trackCount: dec(s.detail.playlist.trackCount) },
            tracks
          },
          playlists: s.playlists.map((p) =>
            p.id === id ? { ...p, trackCount: dec(p.trackCount) } : p
          )
        }
      })
      try {
        await api.playlists.removeTrack(id, trackId)
        return true
      } catch (err) {
        set({ playlists: prevList, detail: prevDetail })
        warn('[playlists] 移除曲目失败，已回滚', err)
        return false
      }
    },

    reorder: async (id, trackIds) => {
      // 空数组拒绝：与 repo 的 reorder 守卫同口径（绝不整表清空）。
      if (trackIds.length === 0) return false
      const api = deps.getApi()
      if (!api) {
        warn('[playlists] window.api.playlists 不可用，忽略重排')
        return false
      }
      const prevDetail = get().detail
      set((s) => {
        if (!s.detail || s.detail.playlist?.id !== id) return {}
        return { detail: { ...s.detail, tracks: orderTracksByIds(s.detail.tracks, trackIds) } }
      })
      try {
        await api.playlists.reorder(id, trackIds)
        return true
      } catch (err) {
        set({ detail: prevDetail })
        warn('[playlists] 重排失败，已回滚', err)
        return false
      }
    }
  }))
}

// ---------------------------------------------------------------------------
// 单例 + 组件入口
// ---------------------------------------------------------------------------

/** 应用单例：生产经 window.api 取数（惰性）。 */
export const usePlaylistsStore = createPlaylistsStore({ getApi: defaultGetApi })

/** 应用启动 / 首次进入歌单页调用：幂等建立歌单列表（同 ensureFavoritesLoaded 形态）。 */
export function ensurePlaylistsLoaded(): void {
  usePlaylistsStore.getState().ensureLoaded()
}

export interface UsePlaylists {
  playlists: PlaylistRow[]
  listLoading: boolean
  listError: string | null
  listLoaded: boolean
  creating: boolean
  detailId: number | null
  detail: PlaylistDetail | null
  detailLoading: boolean
  detailError: string | null
  refresh: () => Promise<void>
  loadDetail: (id: number) => Promise<void>
  create: (name: string) => Promise<PlaylistRow | null>
  rename: (id: number, name: string) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  addTracks: (id: number, trackIds: string[]) => Promise<boolean>
  removeTrack: (id: number, trackId: string) => Promise<boolean>
  reorder: (id: number, trackIds: string[]) => Promise<boolean>
}

/**
 * 组件用入口：经 useSyncExternalStore 订阅 zustand store，歌单变更即重渲染。
 * 用 getState() 整快照而非 selector（同 favoritesStore / libraryStore 留痕）。
 */
export function usePlaylists(): UsePlaylists {
  const snapshot = useSyncExternalStore(
    usePlaylistsStore.subscribe,
    usePlaylistsStore.getState,
    usePlaylistsStore.getState
  )
  return {
    playlists: snapshot.playlists,
    listLoading: snapshot.listLoading,
    listError: snapshot.listError,
    listLoaded: snapshot.listLoaded,
    creating: snapshot.creating,
    detailId: snapshot.detailId,
    detail: snapshot.detail,
    detailLoading: snapshot.detailLoading,
    detailError: snapshot.detailError,
    refresh: snapshot.refresh,
    loadDetail: snapshot.loadDetail,
    create: snapshot.create,
    rename: snapshot.rename,
    remove: snapshot.remove,
    addTracks: snapshot.addTracks,
    removeTrack: snapshot.removeTrack,
    reorder: snapshot.reorder
  }
}
