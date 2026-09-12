/**
 * 歌单页单测夹具（T6.2，jsdom project）——在 browseFixtures 的 window.api 桩上补 playlists 八通道。
 *
 * 为什么需要本模块：browseFixtures 的桩是 Proxy，对未知通道（playlists 等）回退为 no-op 函数；
 * 而 playlistsStore 的 defaultGetApi() 要求**八方法齐备**才认作可用，故在只 import browseFixtures
 * 的用例里歌单切片全程静默（列不拉、写不落）。本模块把真实八通道挂上同一个桩对象。
 *
 * import 顺序约定（同 browseFixtures，务必遵守）：
 *   1) import './browseFixtures'  —— 建 window.api（页面模块 import 前必须先就位）
 *   2) import './playlistFixtures' —— 往同一对象补 playlists 字段
 *   3) import 页面模块
 * client.ts 的 `api` 是 window.api 的**对象引用**，故第 2 步给该对象加的 playlists 字段对
 * `api.playlists.*` 立即可见（Proxy 的 get 先查 target 自有属性）。
 *
 * 桩数据语义尽量贴近 repo：
 *   · list() 按 name ASC 返回（与 playlistRepo 的 ORDER BY name ASC 同口径）；
 *   · get(id) 未知 id 返回 { playlist: null, tracks: [] }（repo 的真实形态，页面据此走 notFound）；
 *   · create 追加到列表并建空详情；rename/delete/removeTrack/reorder 同步改内存态，
 *     使「乐观更新 + 服务端确认」两条路径都能在单测里闭环。
 */
import type { TrackRow } from '../../../shared/types'
import type { PlaylistDetail, PlaylistRow } from '../../../main/database/repositories/playlistRepo'
// 副作用 import：确保 window.api 先由 browseFixtures 建好（本模块顶层即往其上挂 playlists）。
import './browseFixtures'

/** 用例可读写的歌单桩数据（beforeEach 复位）。 */
export const playlistApiData = {
  playlists: [] as PlaylistRow[],
  details: new Map<number, PlaylistDetail>(),
  /** 调用记录（断言「发了哪些请求」）。 */
  listCalls: 0,
  getCalls: [] as number[],
  createCalls: [] as string[],
  renameCalls: [] as Array<[number, string]>,
  deleteCalls: [] as number[],
  addTracksCalls: [] as Array<[number, string[]]>,
  removeTrackCalls: [] as Array<[number, string]>,
  reorderCalls: [] as Array<[number, string[]]>,
  failList: false,
  failRename: false,
  failDelete: false
}

let nextId = 1

function makeRow(id: number, name: string, trackCount: number, coverIds: string[] = []): PlaylistRow {
  return {
    id,
    name,
    description: null,
    trackCount,
    coverIds,
    createdAt: '2020-01-01 00:00:00',
    updatedAt: '2020-01-01 00:00:00'
  }
}

/** 直接往桩里塞一条歌单 + 其曲目（用例准备数据用）。 */
export function seedPlaylist(name: string, tracks: TrackRow[], coverIds: string[] = []): PlaylistRow {
  const row = makeRow(nextId++, name, tracks.length, coverIds)
  playlistApiData.playlists.push(row)
  playlistApiData.details.set(row.id, { playlist: row, tracks })
  return row
}

/** 复位桩数据 + 自增 id（避免用例间串扰）。 */
export function resetPlaylistApiData(): void {
  playlistApiData.playlists = []
  playlistApiData.details = new Map()
  playlistApiData.listCalls = 0
  playlistApiData.getCalls = []
  playlistApiData.createCalls = []
  playlistApiData.renameCalls = []
  playlistApiData.deleteCalls = []
  playlistApiData.addTracksCalls = []
  playlistApiData.removeTrackCalls = []
  playlistApiData.reorderCalls = []
  playlistApiData.failList = false
  playlistApiData.failRename = false
  playlistApiData.failDelete = false
  nextId = 1
}

const playlistsHandlers = {
  list: async (): Promise<PlaylistRow[]> => {
    playlistApiData.listCalls += 1
    if (playlistApiData.failList) throw new Error('playlists list failed')
    // 服务端 name ASC（playlistRepo 的 ORDER BY name ASC）——store 依赖它，桩须同序。
    return playlistApiData.playlists
      .slice()
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((row) => ({ ...row, coverIds: row.coverIds.slice() }))
  },
  get: async (id: number): Promise<PlaylistDetail> => {
    playlistApiData.getCalls.push(id)
    return playlistApiData.details.get(id) ?? { playlist: null, tracks: [] }
  },
  create: async (name: string): Promise<PlaylistRow> => {
    playlistApiData.createCalls.push(name)
    const row = makeRow(nextId++, name, 0)
    playlistApiData.playlists.push(row)
    playlistApiData.details.set(row.id, { playlist: row, tracks: [] })
    return row
  },
  rename: async (id: number, name: string): Promise<void> => {
    playlistApiData.renameCalls.push([id, name])
    if (playlistApiData.failRename) throw new Error('rename failed')
    const row = playlistApiData.playlists.find((p) => p.id === id)
    if (row) row.name = name
    const detail = playlistApiData.details.get(id)
    if (detail?.playlist) detail.playlist = { ...detail.playlist, name }
  },
  delete: async (id: number): Promise<void> => {
    playlistApiData.deleteCalls.push(id)
    if (playlistApiData.failDelete) throw new Error('delete failed')
    playlistApiData.playlists = playlistApiData.playlists.filter((p) => p.id !== id)
    playlistApiData.details.delete(id)
  },
  addTracks: async (id: number, trackIds: string[]): Promise<void> => {
    playlistApiData.addTracksCalls.push([id, trackIds])
  },
  removeTrack: async (id: number, trackId: string): Promise<void> => {
    playlistApiData.removeTrackCalls.push([id, trackId])
    const detail = playlistApiData.details.get(id)
    if (!detail) return
    const index = detail.tracks.findIndex((row) => row.id === trackId)
    if (index < 0) return
    const tracks = detail.tracks.slice()
    tracks.splice(index, 1)
    detail.tracks = tracks
    if (detail.playlist) {
      detail.playlist = { ...detail.playlist, trackCount: Math.max(0, detail.playlist.trackCount - 1) }
    }
  },
  reorder: async (id: number, trackIds: string[]): Promise<void> => {
    playlistApiData.reorderCalls.push([id, trackIds])
  }
}

// 把八通道挂到 browseFixtures 已建的 window.api 桩对象上（Proxy get 会先命中 target 自有属性）。
const stub = (globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api
stub.playlists = playlistsHandlers
