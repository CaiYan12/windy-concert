// T3.3 preload —— contextBridge 暴露 §3.6 形态的 window.api。
// 设计留痕：
//  - channel 常量与 payload/return 类型复用 ../main/ipc/channels（零逻辑纯常量，
//    跨目录 import 属设计决定；类型经 import type 引入，不产生运行时代码）。
//  - invoke 帮助函数用 IpcPayloads/IpcReturns 泛型映射锁死每个方法的参数与返回类型，
//    渲染层经 `export type Api = typeof api` 推导获得准确的 Promise 类型。
//  - on* 事件订阅返回 unsubscribe（off 同一 listener 实例）。
//  - T3.3 已移除模板自带的 `window.electron`（electronAPI）暴露，仅保留 §3.6 契约的
//    window.api；模板组件对 window.electron 的用法已同步清理。
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { IpcPayloads, IpcReturns } from '../shared/ipc'
import type { CoversReady, ScanProgress, Settings } from '../shared/types'

/** 类型安全 invoke：payload 为 void 的 channel 不传第二参，返回类型取自 IpcReturns。 */
function invoke<C extends keyof IpcPayloads & keyof IpcReturns>(
  channel: C,
  ...payload: IpcPayloads[C] extends void ? [] : [IpcPayloads[C]]
): Promise<IpcReturns[C]> {
  return ipcRenderer.invoke(channel, ...payload)
}

const api = {
  library: {
    addFolder: (path?: string) => invoke(IPC.CHANNELS.LIBRARY_ADD_FOLDER, { path }),
    removeFolder: (id: number) => invoke(IPC.CHANNELS.LIBRARY_REMOVE_FOLDER, { id }),
    setFolderEnabled: (id: number, enabled: boolean) =>
      invoke(IPC.CHANNELS.LIBRARY_SET_FOLDER_ENABLED, { id, enabled }),
    scan: () => invoke(IPC.CHANNELS.LIBRARY_SCAN),
    rescanAll: () => invoke(IPC.CHANNELS.LIBRARY_RESCAN_ALL),
    listSongs: (params: IpcPayloads['library:listSongs']) =>
      invoke(IPC.CHANNELS.LIBRARY_LIST_SONGS, params),
    getTrack: (id: string) => invoke(IPC.CHANNELS.LIBRARY_GET_TRACK, { id }),
    listAlbums: () => invoke(IPC.CHANNELS.LIBRARY_LIST_ALBUMS),
    getAlbum: (id: number) => invoke(IPC.CHANNELS.LIBRARY_GET_ALBUM, { id }),
    listArtists: () => invoke(IPC.CHANNELS.LIBRARY_LIST_ARTISTS),
    getArtist: (id: number) => invoke(IPC.CHANNELS.LIBRARY_GET_ARTIST, { id }),
    search: (q: string) => invoke(IPC.CHANNELS.LIBRARY_SEARCH, { q }),
  },
  favorites: {
    set: (trackId: string, favorite: boolean) =>
      invoke(IPC.CHANNELS.FAVORITES_SET, { trackId, favorite }),
    list: (sortBy: string) => invoke(IPC.CHANNELS.FAVORITES_LIST, { sortBy }),
  },
  playlists: {
    list: () => invoke(IPC.CHANNELS.PLAYLISTS_LIST),
    get: (id: number) => invoke(IPC.CHANNELS.PLAYLISTS_GET, { id }),
    create: (name: string) => invoke(IPC.CHANNELS.PLAYLISTS_CREATE, { name }),
    rename: (id: number, name: string) => invoke(IPC.CHANNELS.PLAYLISTS_RENAME, { id, name }),
    delete: (id: number) => invoke(IPC.CHANNELS.PLAYLISTS_DELETE, { id }),
    addTracks: (id: number, trackIds: string[]) =>
      invoke(IPC.CHANNELS.PLAYLISTS_ADD_TRACKS, { id, trackIds }),
    removeTrack: (id: number, trackId: string) =>
      invoke(IPC.CHANNELS.PLAYLISTS_REMOVE_TRACK, { id, trackId }),
    reorder: (id: number, trackIds: string[]) =>
      invoke(IPC.CHANNELS.PLAYLISTS_REORDER, { id, trackIds }),
  },
  history: {
    recordPlay: (trackId: string) => invoke(IPC.CHANNELS.HISTORY_RECORD_PLAY, { trackId }),
    updatePlayOutcome: (historyId: number, playedDuration?: number | null, completed?: boolean) =>
      invoke(IPC.CHANNELS.HISTORY_UPDATE_PLAY_OUTCOME, { historyId, playedDuration, completed }),
    listRecent: (limit: number) => invoke(IPC.CHANNELS.HISTORY_LIST_RECENT, { limit }),
  },
  settings: {
    get: () => invoke(IPC.CHANNELS.SETTINGS_GET),
    set: (partial: Partial<Settings>) => invoke(IPC.CHANNELS.SETTINGS_SET, partial),
  },
  i18n: {
    getMessages: (lang: string) => invoke(IPC.CHANNELS.I18N_GET_MESSAGES, { lang }),
  },
  onScanProgress(cb: (p: ScanProgress) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, p: ScanProgress): void => cb(p)
    ipcRenderer.on(IPC.CHANNELS.SCAN_PROGRESS, listener)
    return () => {
      ipcRenderer.off(IPC.CHANNELS.SCAN_PROGRESS, listener)
    }
  },
  onCoversReady(cb: (p: CoversReady) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, p: CoversReady): void => cb(p)
    ipcRenderer.on(IPC.CHANNELS.COVERS_READY, listener)
    return () => {
      ipcRenderer.off(IPC.CHANNELS.COVERS_READY, listener)
    }
  },
}

export type Api = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
