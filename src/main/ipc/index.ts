// T3.1 registerIpcHandlers —— §3.6 全部 channel 的 handler 收口点（零逻辑转发）。
//   每条 handler：参数校验（id 存在性、枚举/白名单命中、q 非空）后转发对应 repo / service / store。
//   依赖显式注入（deps）；handleRegistrar 可注入（默认 ipcMain.handle）——便于 vitest 用内存 registrar
//     收集 handler map 直接断言（electron 在测试环境缺失，ipcMain.handle 不可用，留痕）。
//   两事件 scan:progress / covers:ready 的 webContents.send 在 index.ts 组装时经 onProgress /
//     onCoverReady 回调接线（本模块不持有 BrowserWindow），见 §3.6 表「event→r」方向。
//
// 派发留痕：
//   - electron 值（ipcMain / dialog / app）一律惰性 require，仅在「未注入默认实现」的生产路径触发；
//     测试注入 registrar / dialog 时不加载 electron（避免 vitest 缺 electron 崩溃，留痕）。
//   - getAlbum / getArtist 不存在时返回 {album:null,...}/{artist:null,...}；getTrack 不存在返回 null（自定留痕）。
//   - i18n:getMessages 资源（T3.5 交付）缺失时返回 {}（不抛错，留痕）。
//   - search 路由（≥3 FTS / <3 LIKE）收口在 trackRepo.search 内部（repo 是唯一 SQL 收口点，留痕）。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import type { BrowserWindow, Dialog, IpcMainInvokeEvent } from 'electron';
import type { AlbumRepo } from '../database/repositories/albumRepo';
import type { ArtistRepo } from '../database/repositories/artistRepo';
import type { FolderRepo } from '../database/repositories/folderRepo';
import type { HistoryRepo } from '../database/repositories/historyRepo';
import type { PlaylistRepo } from '../database/repositories/playlistRepo';
import type { TrackRepo } from '../database/repositories/trackRepo';
import type { CoverService } from '../library/coverService';
import type { ScanService } from '../library/scanService';
import type { SettingsStore } from '../settings/settingsStore';
import { IPC, type IpcPayloads } from './channels';

// ---------------------------------------------------------------------------
// 依赖注入形状（deps 显式注入；生产 index.ts 装配时传入，测试注入内存桩）
// ---------------------------------------------------------------------------

export interface RegisterIpcDeps {
  /** 主库句柄（本模块 handler 经 repo 访问，不直接用；保留以便将来扩展，留痕）。 */
  db: Database;
  trackRepo: TrackRepo;
  albumRepo: AlbumRepo;
  artistRepo: ArtistRepo;
  playlistRepo: PlaylistRepo;
  historyRepo: HistoryRepo;
  folderRepo: FolderRepo;
  /** 封面 repo（T3.2 wc-cover 协议接线预留，本任务 handler 不直接用，留痕）。 */
  coverRepo: import('../database/repositories/coverRepo').CoverRepo;
  scanService: ScanService;
  coverService: CoverService;
  settingsStore: SettingsStore;
  /** 启用目录来源（scanService 已注入；此处保留供将来扩展，留痕）。 */
  getFolders: () => string[];
  /** 目录变更失效回调（T3.2）：addFolder/removeFolder/setFolderEnabled 成功后调用，供协议侧 folderCache 失效。 */
  onFoldersChanged?: () => void;
  /** 惰性取主窗口（事件 send 在 index.ts 接线；本模块不直接用，留痕）。 */
  getMainWindow?: () => BrowserWindow | null;
  /** 目录选择框；默认 electron dialog（测试注入桩，留痕）。 */
  dialog?: Dialog;
  /** handler 注册器；默认 ipcMain.handle（测试注入内存 registrar 收集 handler map，留痕）。 */
  handleRegistrar?: HandleRegistrar;
}

/** handler 函数形态：(event, payload) => result | Promise<result>。 */
type HandlerFn = (event: IpcMainInvokeEvent, payload: unknown) => unknown | Promise<unknown>;
/** 注册器形态（对齐 ipcMain.handle）。 */
export type HandleRegistrar = (channel: string, fn: HandlerFn) => void;

// ---------------------------------------------------------------------------
// 惰性 electron 取值（仅在缺注入的生产路径触发；测试不加载 electron，留痕）
// ---------------------------------------------------------------------------

function getElectron(): typeof import('electron') {
  // 仅在默认 registrar / 默认 dialog / i18n 资源解析等生产路径调用；
  // 测试均注入等价实现，require('electron') 不执行（vitest 缺 electron）。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('electron') as typeof import('electron');
}

// ---------------------------------------------------------------------------
// 参数校验辅助
// ---------------------------------------------------------------------------

const LIST_SONGS_SORT_KEYS = [
  'title',
  'artist',
  'album',
  'dateAdded',
  'year',
  'duration',
  'playCount',
] as const;

const FAVORITE_SORT_KEYS = [
  'favorited_at',
  'artist',
  'album',
  'title',
  'playCount',
] as const;

function assertSortKey(key: unknown, allowed: readonly string[], what: string): void {
  if (typeof key !== 'string' || !allowed.includes(key)) {
    throw new Error(`${what}: 非法 sortBy 键 "${String(key)}"，未命中白名单`);
  }
}

function normalizeOrder(order: unknown): 'asc' | 'desc' {
  return order === 'desc' ? 'desc' : 'asc';
}

// ---------------------------------------------------------------------------
// 注册主体
// ---------------------------------------------------------------------------

export function registerIpcHandlers(deps: RegisterIpcDeps): void {
  const { trackRepo, albumRepo, artistRepo, playlistRepo, historyRepo, folderRepo, scanService, coverService, settingsStore } =
    deps;

  const register: HandleRegistrar =
    deps.handleRegistrar ??
    ((channel, fn) => {
      getElectron().ipcMain.handle(channel, fn as (e: IpcMainInvokeEvent, ...args: unknown[]) => unknown);
    });

  const resolveDialog = (): Dialog => deps.dialog ?? getElectron().dialog;

  // ---- 目录管理 ----
  register(IPC.CHANNELS.LIBRARY_ADD_FOLDER, (_e, payload) => {
    const p = (payload ?? {}) as IpcPayloads['library:addFolder'];
    if (p.path !== undefined && typeof p.path !== 'string') {
      throw new Error('library:addFolder 需要字符串 path');
    }
    let folderPath = p.path;
    if (!folderPath) {
      // 省 path：弹系统目录选择框（dialog 注入便于测试；取消选择抛错，留痕）。
      const result = resolveDialog().showOpenDialogSync({ properties: ['openDirectory'] });
      if (!result || result.length === 0) {
        throw new Error('library:addFolder 未选择目录');
      }
      folderPath = result[0];
    }
    const row = folderRepo.add(folderPath);
    deps.onFoldersChanged?.(); // T3.2 失效接线：目录集合变更 → 协议侧 folderCache 失效
    return { id: row.id };
  });

  register(IPC.CHANNELS.LIBRARY_REMOVE_FOLDER, (_e, payload) => {
    const p = payload as IpcPayloads['library:removeFolder'];
    if (typeof p?.id !== 'number') throw new Error('library:removeFolder 需要数字 id');
    folderRepo.remove(p.id);
    deps.onFoldersChanged?.(); // T3.2 失效接线
  });

  register(IPC.CHANNELS.LIBRARY_SET_FOLDER_ENABLED, (_e, payload) => {
    const p = payload as IpcPayloads['library:setFolderEnabled'];
    if (typeof p?.id !== 'number') throw new Error('library:setFolderEnabled 需要数字 id');
    if (typeof p.enabled !== 'boolean') throw new Error('library:setFolderEnabled 需要布尔 enabled');
    folderRepo.setEnabled(p.id, p.enabled);
    deps.onFoldersChanged?.(); // T3.2 失效接线：enabled 变更即启用集合变更
  });

  // ---- 扫描 ----
  register(IPC.CHANNELS.LIBRARY_SCAN, () => {
    // 增量扫描：fire-and-forget，进度经 scan:progress 事件回报（不阻塞 invoke）。
    // catch 防止后台扫描失败变成 unhandled rejection（评审修复留痕）。
    void scanService
      .scan({ mode: 'incremental' })
      .catch((err: unknown) => console.error('[ipc] scan 失败:', err));
  });

  register(IPC.CHANNELS.LIBRARY_RESCAN_ALL, () => {
    // 全量重扫：先清空封面去重状态机（允许刷新封面），再无视三元组全量重解析。
    coverService.resetAlbumStates();
    void scanService
      .scan({ mode: 'full' })
      .catch((err: unknown) => console.error('[ipc] scan 失败:', err));
  });

  // ---- 曲目 / 专辑 / 艺术家 ----
  register(IPC.CHANNELS.LIBRARY_LIST_SONGS, (_e, payload) => {
    const p = payload as IpcPayloads['library:listSongs'];
    assertSortKey(p?.sortBy, LIST_SONGS_SORT_KEYS, 'library:listSongs');
    return trackRepo.listSongs({
      sortBy: p.sortBy,
      order: normalizeOrder(p.order),
      offset: p.offset,
      limit: p.limit,
    });
  });

  register(IPC.CHANNELS.LIBRARY_GET_TRACK, (_e, payload) => {
    const p = payload as IpcPayloads['library:getTrack'];
    if (typeof p?.id !== 'string') throw new Error('library:getTrack 需要字符串 id');
    return trackRepo.findById(p.id); // 不存在返回 null（留痕）
  });

  register(IPC.CHANNELS.LIBRARY_LIST_ALBUMS, () => albumRepo.listAlbums());

  register(IPC.CHANNELS.LIBRARY_GET_ALBUM, (_e, payload) => {
    const p = payload as IpcPayloads['library:getAlbum'];
    if (typeof p?.id !== 'number') throw new Error('library:getAlbum 需要数字 id');
    return albumRepo.getAlbumWithTracks(p.id); // 不存在 {album:null, tracks:[]}
  });

  register(IPC.CHANNELS.LIBRARY_LIST_ARTISTS, () => artistRepo.listArtists());

  register(IPC.CHANNELS.LIBRARY_GET_ARTIST, (_e, payload) => {
    const p = payload as IpcPayloads['library:getArtist'];
    if (typeof p?.id !== 'number') throw new Error('library:getArtist 需要数字 id');
    return artistRepo.getArtistOverview(p.id); // 不存在 {artist:null, albums:[], tracks:[]}
  });

  // ---- 搜索（§3.5d：分组返回；路由收口在 trackRepo.search 内部）----
  register(IPC.CHANNELS.LIBRARY_SEARCH, (_e, payload) => {
    const p = payload as IpcPayloads['library:search'];
    if (typeof p?.q !== 'string') throw new Error('library:search 需要字符串 q');
    const q = p.q;
    if (q.trim().length === 0) {
      // 空串返回空分组（搜索框空态安全，不抛错，留痕）
      return { tracks: [], albums: [], artists: [], playlists: [] };
    }
    return {
      tracks: trackRepo.search(q), // ≥3 FTS / <3 LIKE 内部自路由
      albums: albumRepo.search(q),
      artists: artistRepo.search(q),
      playlists: playlistRepo.search(q),
    };
  });

  // ---- 收藏 ----
  register(IPC.CHANNELS.FAVORITES_SET, (_e, payload) => {
    const p = payload as IpcPayloads['favorites:set'];
    if (typeof p?.trackId !== 'string') throw new Error('favorites:set 需要字符串 trackId');
    if (typeof p.favorite !== 'boolean') throw new Error('favorites:set 需要布尔 favorite');
    trackRepo.setFavorite(p.trackId, p.favorite);
  });

  register(IPC.CHANNELS.FAVORITES_LIST, (_e, payload) => {
    const p = payload as IpcPayloads['favorites:list'];
    assertSortKey(p?.sortBy, FAVORITE_SORT_KEYS, 'favorites:list');
    return trackRepo.listFavorites(p.sortBy);
  });

  // ---- 歌单 CRUD ----
  register(IPC.CHANNELS.PLAYLISTS_LIST, () => playlistRepo.list());

  register(IPC.CHANNELS.PLAYLISTS_GET, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:get'];
    if (typeof p?.id !== 'number') throw new Error('playlists:get 需要数字 id');
    return playlistRepo.get(p.id);
  });

  register(IPC.CHANNELS.PLAYLISTS_CREATE, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:create'];
    if (typeof p?.name !== 'string' || p.name.trim().length === 0) {
      throw new Error('playlists:create 需要非空 name');
    }
    return playlistRepo.create(p.name);
  });

  register(IPC.CHANNELS.PLAYLISTS_RENAME, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:rename'];
    if (typeof p?.id !== 'number') throw new Error('playlists:rename 需要数字 id');
    if (typeof p.name !== 'string') throw new Error('playlists:rename 需要字符串 name');
    playlistRepo.rename(p.id, p.name);
  });

  register(IPC.CHANNELS.PLAYLISTS_DELETE, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:delete'];
    if (typeof p?.id !== 'number') throw new Error('playlists:delete 需要数字 id');
    playlistRepo.delete(p.id);
  });

  register(IPC.CHANNELS.PLAYLISTS_ADD_TRACKS, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:addTracks'];
    if (typeof p?.id !== 'number') throw new Error('playlists:addTracks 需要数字 id');
    if (!Array.isArray(p.trackIds)) throw new Error('playlists:addTracks 需要字符串数组 trackIds');
    playlistRepo.addTracks(p.id, p.trackIds);
  });

  register(IPC.CHANNELS.PLAYLISTS_REMOVE_TRACK, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:removeTrack'];
    if (typeof p?.id !== 'number') throw new Error('playlists:removeTrack 需要数字 id');
    if (typeof p.trackId !== 'string') throw new Error('playlists:removeTrack 需要字符串 trackId');
    playlistRepo.removeTrack(p.id, p.trackId);
  });

  register(IPC.CHANNELS.PLAYLISTS_REORDER, (_e, payload) => {
    const p = payload as IpcPayloads['playlists:reorder'];
    if (typeof p?.id !== 'number') throw new Error('playlists:reorder 需要数字 id');
    if (!Array.isArray(p.trackIds)) throw new Error('playlists:reorder 需要字符串数组 trackIds');
    playlistRepo.reorder(p.id, p.trackIds);
  });

  // ---- 播放历史 ----
  register(IPC.CHANNELS.HISTORY_RECORD_PLAY, (_e, payload) => {
    const p = payload as IpcPayloads['history:recordPlay'];
    if (typeof p?.trackId !== 'string') throw new Error('history:recordPlay 需要字符串 trackId');
    return historyRepo.recordPlay(p.trackId);
  });

  register(IPC.CHANNELS.HISTORY_UPDATE_PLAY_OUTCOME, (_e, payload) => {
    const p = payload as IpcPayloads['history:updatePlayOutcome'];
    if (typeof p?.historyId !== 'number') throw new Error('history:updatePlayOutcome 需要数字 historyId');
    // completed 严格布尔化：仅 === true 记 1，其余（含 undefined / truthy 非布尔）一律 0（评审修复留痕）。
    historyRepo.updateOutcome(p.historyId, {
      playedDuration: p.playedDuration,
      completed: p.completed === true,
    });
  });

  register(IPC.CHANNELS.HISTORY_LIST_RECENT, (_e, payload) => {
    const p = payload as IpcPayloads['history:listRecent'];
    if (typeof p?.limit !== 'number' || p.limit <= 0) {
      throw new Error('history:listRecent 需要正整数 limit');
    }
    return historyRepo.listRecent(p.limit);
  });

  // ---- 设置 ----
  register(IPC.CHANNELS.SETTINGS_GET, () => settingsStore.get());

  register(IPC.CHANNELS.SETTINGS_SET, (_e, payload) => {
    const p = payload as IpcPayloads['settings:set'];
    if (typeof p !== 'object' || p === null) throw new Error('settings:set 需要对象 partial');
    return settingsStore.set(p);
  });

  // ---- i18n（T3.5 资源文件尚未交付：缺失返回 {}，留痕）----
  // lang 白名单：仅允许 BCP-47 风格语言标签（zh / zh-CN / en-US 等），
  // 阻断 "../" 路径穿越拼接 `${lang}.json` 读任意 JSON（评审修复，不命中直接抛错留痕）。
  const LANG_RE = /^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

  register(IPC.CHANNELS.I18N_GET_MESSAGES, (_e, payload) => {
    const p = payload as IpcPayloads['i18n:getMessages'];
    if (typeof p?.lang !== 'string' || p.lang.length === 0) return {};
    if (!LANG_RE.test(p.lang)) {
      throw new Error(`i18n:getMessages 非法 lang "${p.lang}"，未命中白名单`);
    }
    const app = getElectron().app;
    // 资源目录解析：打包态走 process.resourcesPath，开发态走 cwd/resources（§3.8）。
    // app 在测试 / 非标准环境可能不可用 —— 兜底到开发态路径（文件缺失仍返回 {}，留痕）。
    const localesDir = app?.isPackaged
      ? path.join(process.resourcesPath, 'locales')
      : path.join(process.cwd(), 'resources', 'locales');
    const file = path.join(localesDir, `${p.lang}.json`);
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, string>;
    } catch {
      return {};
    }
  });
}
