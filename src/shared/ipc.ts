// §3.6 IPC 契约常量与类型（零逻辑）——T4.10 自 main/ipc/channels.ts 下沉至 shared。
//   下沉动机（Phase 4 前置收口）：preload（隔离世界）此前反向依赖 main 目录
//   （import '../main/ipc/channels'），层间耦合；现收口为 shared 单一事实源，
//   main / preload / renderer 三侧均从本文件取用。
//   IPC.CHANNELS：每个 channel 的字符串常量（形态自定留痕：嵌套命名空间 + as const 锁型）。
//   IpcPayloads / IpcReturns：逐条对应 §3.6 表（payload → 返回）。handler 与 preload 共用，
//     作为 §3.6 契约的单一事实源（T3.3 preload 桥复用本类型锁死 window.api 形状）。
//   shared/types.ts 承载跨进程数据形态（TrackRow/AlbumCard/...），channel 键与 payload/return
//     形态自 T4.10 起收口于本文件。
//   类型依赖留痕：IpcReturns 引用的 AlbumDetail / ArtistDetail / PlaylistDetail / PlaylistRow
//     仍定义在 main/database/repositories/*（repo 层返回形态的收口点），此处经 import type
//     引入——纯类型层依赖，tsc/esbuild 两侧均擦除，运行时零 main 代码进入 shared / preload
//     产物（preload 对 main 的运行时耦合已由此消除）。如需彻底解耦可后续将这四个形态
//     下沉 shared/types.ts（待主会话裁定，本任务不动 repo 文件）。
import type {
  AlbumCard,
  ArtistCard,
  PlaylistSummary,
  SearchResult,
  Settings,
  SortKey,
  SortOrder,
  TrackRow,
} from './types';
import type { AlbumDetail } from '../main/database/repositories/albumRepo';
import type { ArtistDetail } from '../main/database/repositories/artistRepo';
import type { PlaylistDetail, PlaylistRow } from '../main/database/repositories/playlistRepo';

/** 全部 channel 常量（§3.6 一览表逐条）。字符串值即渲染端 invoke 的 channel 名。 */
export const IPC = {
  CHANNELS: {
    LIBRARY_ADD_FOLDER: 'library:addFolder',
    LIBRARY_REMOVE_FOLDER: 'library:removeFolder',
    LIBRARY_SET_FOLDER_ENABLED: 'library:setFolderEnabled',
    LIBRARY_SCAN: 'library:scan',
    LIBRARY_RESCAN_ALL: 'library:rescanAll',
    SCAN_PROGRESS: 'scan:progress',
    COVERS_READY: 'covers:ready',
    LIBRARY_LIST_SONGS: 'library:listSongs',
    LIBRARY_GET_STATS: 'library:getStats',
    LIBRARY_GET_TRACK: 'library:getTrack',
    LIBRARY_LIST_ALBUMS: 'library:listAlbums',
    LIBRARY_GET_ALBUM: 'library:getAlbum',
    LIBRARY_LIST_ARTISTS: 'library:listArtists',
    LIBRARY_GET_ARTIST: 'library:getArtist',
    LIBRARY_SEARCH: 'library:search',
    FAVORITES_SET: 'favorites:set',
    FAVORITES_LIST: 'favorites:list',
    PLAYLISTS_LIST: 'playlists:list',
    PLAYLISTS_GET: 'playlists:get',
    PLAYLISTS_CREATE: 'playlists:create',
    PLAYLISTS_RENAME: 'playlists:rename',
    PLAYLISTS_DELETE: 'playlists:delete',
    PLAYLISTS_ADD_TRACKS: 'playlists:addTracks',
    PLAYLISTS_REMOVE_TRACK: 'playlists:removeTrack',
    PLAYLISTS_REORDER: 'playlists:reorder',
    HISTORY_RECORD_PLAY: 'history:recordPlay',
    HISTORY_UPDATE_PLAY_OUTCOME: 'history:updatePlayOutcome',
    HISTORY_LIST_RECENT: 'history:listRecent',
    SETTINGS_GET: 'settings:get',
    SETTINGS_SET: 'settings:set',
    I18N_GET_MESSAGES: 'i18n:getMessages',
  },
} as const;

/** 所有 channel 字符串字面量联合类型。 */
export type ChannelName = (typeof IPC.CHANNELS)[keyof typeof IPC.CHANNELS];

// ---------------------------------------------------------------------------
// payload / return 逐条映射（§3.6 表）。void = 无 payload 或 无返回。
// ---------------------------------------------------------------------------

/** 每个 channel 的入参形态（渲染端 invoke 第二参）。 */
export interface IpcPayloads {
  'library:addFolder': { path?: string };
  'library:removeFolder': { id: number };
  'library:setFolderEnabled': { id: number; enabled: boolean };
  'library:scan': void;
  'library:rescanAll': void;
  'library:listSongs': { sortBy: SortKey; order?: SortOrder; offset?: number; limit?: number };
  'library:getStats': void;
  'library:getTrack': { id: string };
  'library:listAlbums': void;
  'library:getAlbum': { id: number };
  'library:listArtists': void;
  'library:getArtist': { id: number };
  'library:search': { q: string };
  'favorites:set': { trackId: string; favorite: boolean };
  'favorites:list': { sortBy: string };
  'playlists:list': void;
  'playlists:get': { id: number };
  'playlists:create': { name: string };
  'playlists:rename': { id: number; name: string };
  'playlists:delete': { id: number };
  'playlists:addTracks': { id: number; trackIds: string[] };
  'playlists:removeTrack': { id: number; trackId: string };
  'playlists:reorder': { id: number; trackIds: string[] };
  'history:recordPlay': { trackId: string };
  'history:updatePlayOutcome': { historyId: number; playedDuration?: number | null; completed?: boolean };
  'history:listRecent': { limit: number };
  'settings:get': void;
  'settings:set': Partial<Settings>;
  'i18n:getMessages': { lang: string };
}

/** 每个 channel 的返回形态（invoke 解析值）。 */
export interface IpcReturns {
  'library:addFolder': { id: number };
  'library:removeFolder': void;
  'library:setFolderEnabled': void;
  'library:scan': void;
  'library:rescanAll': void;
  'library:listSongs': TrackRow[];
  /** T4.11：曲库三类实体总数（页头真实总数 / 侧栏 nav-badge 数据源）。
   *  形状自定留痕：轻量 COUNT(*) 聚合（repo.count），不含任何行数据；additive 通道，
   *  listSongs 形状冻结不受影响。含全部状态曲目（与 listSongs 无 status 过滤同口径）。 */
  'library:getStats': { tracks: number; albums: number; artists: number };
  'library:getTrack': TrackRow | null;
  'library:listAlbums': AlbumCard[];
  'library:getAlbum': { album: AlbumDetail | null; tracks: TrackRow[] };
  'library:listArtists': ArtistCard[];
  'library:getArtist': { artist: ArtistDetail | null; albums: AlbumCard[]; tracks: TrackRow[] };
  'library:search': SearchResult;
  'favorites:set': void;
  'favorites:list': TrackRow[];
  'playlists:list': PlaylistRow[];
  'playlists:get': PlaylistDetail;
  'playlists:create': PlaylistRow;
  'playlists:rename': void;
  'playlists:delete': void;
  'playlists:addTracks': void;
  'playlists:removeTrack': void;
  'playlists:reorder': void;
  'history:recordPlay': { historyId: number };
  'history:updatePlayOutcome': void;
  'history:listRecent': TrackRow[];
  'settings:get': Settings;
  'settings:set': Settings;
  'i18n:getMessages': Record<string, string>;
}

// 仅用于类型层占位说明：PlaylistSummary 在搜索返回中复用（§3.6 library:search）。
export type { PlaylistSummary };
