// 跨进程类型契约。§4.3-2 约束：仅类型与常量，零逻辑、零 import 两侧实现。

export interface TrackRow {
  id: string; title: string;
  artistId: number; artistName: string;
  albumId: number; albumTitle: string; albumArtist: string;
  trackNumber: number | null; discNumber: number | null;
  year: number | null; genre: string | null; duration: number;
  filePath: string; format: string;
  bitrate: number | null; sampleRate: number | null; bitDepth: number | null;
  playable: boolean; status: 'available' | 'missing' | 'ignored';
  coverId: string | null; favorite: boolean; playCount: number;
  dateAdded: string; lastPlayedAt: string | null; favoritedAt: string | null;
}

export interface AlbumCard { id: number; title: string; artistName: string; year: number | null; coverId: string | null; trackCount: number; }
export interface ArtistCard { id: number; name: string; trackCount: number; albumCount: number; }
export interface Settings { language: 'zh-CN'; autoScanOnStartup: boolean; volume: number; muted: boolean; }

// scan:progress 事件 payload（§3.6 IPC 表）
export interface ScanProgress {
  phase: 'stat' | 'parse' | 'cover' | 'done';
  done: number;
  total: number;
  elapsedMs: number;
}

// covers:ready 事件 payload（§3.6 IPC 表）
export interface CoversReady {
  coverId: string;
}

// 搜索下拉需要 id/name/count；计划未定义 playlists 元素形状，此为最小合理定义（执行备注留痕）。
export interface PlaylistSummary { id: number; name: string; trackCount: number; }

// library:search 返回（§3.6 IPC 表）
export interface SearchResult {
  tracks: TrackRow[];
  albums: AlbumCard[];
  artists: ArtistCard[];
  playlists: PlaylistSummary[];
}

// library:listSongs 排序键白名单（§3.7）；T1.2 listSongs 将消费
export type SortKey = 'title' | 'artist' | 'album' | 'dateAdded' | 'year' | 'duration' | 'playCount';
export type SortOrder = 'asc' | 'desc';
