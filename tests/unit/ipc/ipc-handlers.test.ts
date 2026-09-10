// T3.1 ipc-handlers 单测。
// 策略：registerIpcHandlers 的 handleRegistrar 注入内存 collector 收集 handler map，
//   直接调用 handler 函数断言（ipcMain.handle 在 vitest 不可用——electron 缺失，留痕）。
//   repo 全部用真实实现（:memory: 库 + 真实 triggers，FTS 行为可证）；scanService / coverService
//   用 spy 桩（scan 真实路径会 spawn worker 卡死，handler 仅需转发，留痕）。
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDatabase } from '../../../src/main/database/connection';
import { createAlbumRepo } from '../../../src/main/database/repositories/albumRepo';
import { createArtistRepo } from '../../../src/main/database/repositories/artistRepo';
import { createFolderRepo } from '../../../src/main/database/repositories/folderRepo';
import { createHistoryRepo } from '../../../src/main/database/repositories/historyRepo';
import { createPlaylistRepo } from '../../../src/main/database/repositories/playlistRepo';
import { createTrackRepo } from '../../../src/main/database/repositories/trackRepo';
import { createSettingsStore } from '../../../src/main/settings/settingsStore';
import { IPC } from '../../../src/main/ipc/channels';
import { registerIpcHandlers, type HandleRegistrar } from '../../../src/main/ipc';
import type { CoverService } from '../../../src/main/library/coverService';
import type { ScanService } from '../../../src/main/library/scanService';

type AnyHandler = (event: unknown, payload: unknown) => unknown;

interface Ctx {
  db: Database;
  handlers: Map<string, AnyHandler>;
  call: <T = unknown>(channel: string, payload?: unknown) => T;
  settingsDir: string;
  scanService: { scan: ReturnType<typeof vi.fn>; startupScan: ReturnType<typeof vi.fn> };
  coverService: { resetAlbumStates: ReturnType<typeof vi.fn> };
  folders: string[];
}

function makeCtx(): Ctx {
  const db = openDatabase(':memory:');
  const trackRepo = createTrackRepo(db);
  const albumRepo = createAlbumRepo(db);
  const artistRepo = createArtistRepo(db);
  const playlistRepo = createPlaylistRepo(db);
  const historyRepo = createHistoryRepo(db);
  const folderRepo = createFolderRepo(db);
  const coverRepo = { insertCover: vi.fn(), setAlbumCover: vi.fn() } as unknown as import('../../../src/main/database/repositories/coverRepo').CoverRepo;

  const settingsDir = mkdtempSync(path.join(os.tmpdir(), 'wc-ipc-'));
  const settingsStore = createSettingsStore({ settingsDir });

  const scanService = {
    scan: vi.fn().mockResolvedValue({ total: 0, parsed: 0, skipped: 0, adopted: 0, missingMarked: 0, coversDropped: 0, elapsedMs: 0 }),
    startupScan: vi.fn(),
  } as unknown as ScanService & { scan: ReturnType<typeof vi.fn>; startupScan: ReturnType<typeof vi.fn> };
  const coverService = {
    resetAlbumStates: vi.fn(),
    droppedCount: 0,
  } as unknown as CoverService & { resetAlbumStates: ReturnType<typeof vi.fn> };

  const handlers = new Map<string, AnyHandler>();
  const registrar: HandleRegistrar = (channel, fn) => {
    handlers.set(channel, fn as AnyHandler);
  };

  const folders: string[] = [];
  const dialogStub = {
    showOpenDialogSync: vi.fn(() => ['D:\\Picked']),
  } as unknown as import('electron').Dialog;

  registerIpcHandlers({
    db,
    trackRepo,
    albumRepo,
    artistRepo,
    playlistRepo,
    historyRepo,
    folderRepo,
    coverRepo,
    scanService: scanService as unknown as ScanService,
    coverService: coverService as unknown as CoverService,
    settingsStore,
    getFolders: () => folders,
    dialog: dialogStub,
    handleRegistrar: registrar,
  });

  const call = <T = unknown>(channel: string, payload?: unknown): T => {
    const fn = handlers.get(channel);
    if (!fn) throw new Error(`未注册的 channel: ${channel}`);
    return fn({}, payload) as T;
  };

  return {
    db,
    handlers,
    call,
    settingsDir,
    scanService: scanService as unknown as Ctx['scanService'],
    coverService: coverService as unknown as Ctx['coverService'],
    folders,
  };
}

let ctx: Ctx;
const tempDirs: string[] = [];

beforeEach(() => {
  ctx = makeCtx();
  tempDirs.push(ctx.settingsDir);
});

afterEach(() => {
  ctx.db.close();
});

afterAll(() => {
  for (const d of tempDirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
});

// 造数：真实插入曲目/专辑/艺术家/歌单（触发 tracks_fts 触发器）
function seedLibrary(): void {
  const { db } = ctx;
  const trackRepo = createTrackRepo(db);
  const artistRepo = createArtistRepo(db);
  const albumRepo = createAlbumRepo(db);
  const playlistRepo = createPlaylistRepo(db);

  const artistId = artistRepo.upsertArtist('周杰伦');
  const albumId = albumRepo.upsertAlbum('十一月的萧邦', artistId);
  const mk = (id: string, title: string, file: string) => ({
    id,
    title,
    artistId,
    albumId,
    artistString: '周杰伦',
    albumArtist: '周杰伦',
    albumTitle: '十一月的萧邦',
    filePath: `d:/m/${file}`,
    fileName: file,
    fileSize: 1,
    fileMtime: 1,
    format: 'mp3',
    playable: true,
  });
  trackRepo.createMany([
    mk('t1', '夜曲', '01.mp3'),
    mk('t2', '晴天', '03.m4a'),
    mk('t3', '七里香', '07.mp3'), // 3 字符，走 FTS 路径
  ]);
  playlistRepo.create('我喜欢的'); // 歌单搜索命中 '喜欢'
}

describe('registerIpcHandlers', () => {
  it('library:addFolder 直传 path → 返回 {id} 且已落库', () => {
    const res = ctx.call<{ id: number }>(IPC.CHANNELS.LIBRARY_ADD_FOLDER, { path: 'D:\\Music' });
    expect(typeof res.id).toBe('number');
    // 落库验证：再次 list 包含该路径
    const folderRepo = createFolderRepo(ctx.db);
    expect(folderRepo.list().some((f) => f.path === 'd:\\Music')).toBe(true);
  });

  it('library:addFolder 省 path → 走注入 dialog 桩返回选择目录', () => {
    const res = ctx.call<{ id: number }>(IPC.CHANNELS.LIBRARY_ADD_FOLDER, {});
    expect(typeof res.id).toBe('number');
  });

  it('library:removeFolder / setFolderEnabled 不抛错', () => {
    const { id } = ctx.call<{ id: number }>(IPC.CHANNELS.LIBRARY_ADD_FOLDER, { path: 'D:\\Music2' });
    expect(() => ctx.call(IPC.CHANNELS.LIBRARY_REMOVE_FOLDER, { id })).not.toThrow();
    // 重新加一个并切 enabled
    const { id: id2 } = ctx.call<{ id: number }>(IPC.CHANNELS.LIBRARY_ADD_FOLDER, { path: 'D:\\Music3' });
    expect(() => ctx.call(IPC.CHANNELS.LIBRARY_SET_FOLDER_ENABLED, { id: id2, enabled: false })).not.toThrow();
  });

  it('library:getTrack 不存在 → null（不抛错）', () => {
    expect(ctx.call(IPC.CHANNELS.LIBRARY_GET_TRACK, { id: 'nope' })).toBeNull();
  });

  it('library:getTrack 存在 → TrackRow', () => {
    seedLibrary();
    const row = ctx.call<{ id: string } | null>(IPC.CHANNELS.LIBRARY_GET_TRACK, { id: 't1' });
    expect(row).not.toBeNull();
    expect(row!.title).toBe('夜曲');
  });

  it('library:listSongs 非法 sortBy → 抛错', () => {
    expect(() => ctx.call(IPC.CHANNELS.LIBRARY_LIST_SONGS, { sortBy: 'bogus' })).toThrow();
  });

  it('library:listSongs 合法 sortBy → TrackRow[]', () => {
    seedLibrary();
    const rows = ctx.call<Array<{ id: string }>>(IPC.CHANNELS.LIBRARY_LIST_SONGS, { sortBy: 'title', order: 'asc' });
    expect(rows.length).toBe(3);
  });

  it('library:listAlbums / listArtists → 真实数据', () => {
    seedLibrary();
    expect(ctx.call<Array<unknown>>(IPC.CHANNELS.LIBRARY_LIST_ALBUMS).length).toBeGreaterThan(0);
    expect(ctx.call<Array<unknown>>(IPC.CHANNELS.LIBRARY_LIST_ARTISTS).length).toBeGreaterThan(0);
  });

  it('library:getAlbum / getArtist 不存在 → album/artist 为 null', () => {
    const album = ctx.call<{ album: unknown }>(IPC.CHANNELS.LIBRARY_GET_ALBUM, { id: 99999 });
    expect(album.album).toBeNull();
    const artist = ctx.call<{ artist: unknown }>(IPC.CHANNELS.LIBRARY_GET_ARTIST, { id: 99999 });
    expect(artist.artist).toBeNull();
  });

  it('library:search 三态：FTS(≥3) / FTS 转义防注入 / LIKE(<3)', () => {
    seedLibrary();

    // ① FTS ≥3 字符：七里香 命中 1 条
    const fts = ctx.call<{ tracks: Array<{ title: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, { q: '七里香' });
    expect(fts.tracks.map((t) => t.title)).toEqual(['七里香']);

    // ② FTS 转义：注入 "七里香 OR 晴天" 被双引号包裹成单一短语字面量 → 不匹配任何行（0 条），
    //    证明 OR 语法未被当作 UNION 执行（防 FTS 注入留痕）。
    const injected = ctx.call<{ tracks: Array<{ title: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, {
      q: '七里香 OR 晴天',
    });
    expect(injected.tracks).toHaveLength(0);

    // ③ LIKE <3 字符：单字 '夜' 命中 夜曲（trigram 下限下回退 LIKE）
    const like = ctx.call<{ tracks: Array<{ title: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, { q: '夜' });
    expect(like.tracks.map((t) => t.title)).toEqual(['夜曲']);

    // ④ 分组：专辑/艺术家/歌单各自走 LIKE（数量级有限统一 LIKE），分查询验证
    const byArtist = ctx.call<{ artists: Array<{ name: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, { q: '周' });
    expect(byArtist.artists.some((a) => a.name === '周杰伦')).toBe(true);
    const byAlbum = ctx.call<{ albums: Array<{ title: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, { q: '萧邦' });
    expect(byAlbum.albums.some((a) => a.title === '十一月的萧邦')).toBe(true);
    const byPlaylist = ctx.call<{ playlists: Array<{ name: string }> }>(IPC.CHANNELS.LIBRARY_SEARCH, { q: '喜欢' });
    expect(byPlaylist.playlists.some((p) => p.name === '我喜欢的')).toBe(true);
  });

  it('library:search 空串 → 返回空分组（不抛错）', () => {
    const res = ctx.call(IPC.CHANNELS.LIBRARY_SEARCH, { q: '' });
    expect(res).toEqual({ tracks: [], albums: [], artists: [], playlists: [] });
  });

  it('favorites:set + favorites:list（白名单排序）往返', () => {
    seedLibrary();
    ctx.call(IPC.CHANNELS.FAVORITES_SET, { trackId: 't1', favorite: true });
    const list = ctx.call<Array<{ id: string }>>(IPC.CHANNELS.FAVORITES_LIST, { sortBy: 'favorited_at' });
    expect(list.map((t) => t.id)).toContain('t1');
    // 非法 sortBy 抛错
    expect(() => ctx.call(IPC.CHANNELS.FAVORITES_LIST, { sortBy: 'bogus' })).toThrow();
  });

  it('playlists CRUD 往返', () => {
    seedLibrary(); // addTracks 依赖存在的曲目（FK）
    const created = ctx.call<{ id: number; name: string }>(IPC.CHANNELS.PLAYLISTS_CREATE, { name: '新歌单' });
    expect(created.name).toBe('新歌单');
    expect(ctx.call<Array<{ id: number }>>(IPC.CHANNELS.PLAYLISTS_LIST).some((p) => p.id === created.id)).toBe(true);
    ctx.call(IPC.CHANNELS.PLAYLISTS_RENAME, { id: created.id, name: '改名' });
    const got = ctx.call<{ playlist: { name: string } | null }>(IPC.CHANNELS.PLAYLISTS_GET, { id: created.id });
    expect(got.playlist?.name).toBe('改名');
    ctx.call(IPC.CHANNELS.PLAYLISTS_ADD_TRACKS, { id: created.id, trackIds: ['t1'] });
    ctx.call(IPC.CHANNELS.PLAYLISTS_REORDER, { id: created.id, trackIds: ['t1'] });
    ctx.call(IPC.CHANNELS.PLAYLISTS_REMOVE_TRACK, { id: created.id, trackId: 't1' });
    ctx.call(IPC.CHANNELS.PLAYLISTS_DELETE, { id: created.id });
    expect(ctx.call<Array<{ id: number }>>(IPC.CHANNELS.PLAYLISTS_LIST).some((p) => p.id === created.id)).toBe(false);
  });

  it('history:recordPlay → {historyId}；listRecent 返回曲目', () => {
    seedLibrary();
    const { historyId } = ctx.call<{ historyId: number }>(IPC.CHANNELS.HISTORY_RECORD_PLAY, { trackId: 't1' });
    expect(typeof historyId).toBe('number');
    ctx.call(IPC.CHANNELS.HISTORY_UPDATE_PLAY_OUTCOME, { historyId, playedDuration: 10, completed: true });
    const recent = ctx.call<Array<{ id: string }>>(IPC.CHANNELS.HISTORY_LIST_RECENT, { limit: 10 });
    expect(recent.some((t) => t.id === 't1')).toBe(true);
  });

  it('settings:get 默认值；settings:set 合并往返；volume 钳制 [0,1]', () => {
    const def = ctx.call<{ volume: number; autoScanOnStartup: boolean }>(IPC.CHANNELS.SETTINGS_GET);
    expect(def.volume).toBe(0.8);
    expect(def.autoScanOnStartup).toBe(true);
    const updated = ctx.call<{ volume: number }>(IPC.CHANNELS.SETTINGS_SET, { volume: 0.5 });
    expect(updated.volume).toBe(0.5);
    // 再次 get 持久化
    expect(ctx.call<{ volume: number }>(IPC.CHANNELS.SETTINGS_GET).volume).toBe(0.5);
    // 越界钳制
    const clamped = ctx.call<{ volume: number }>(IPC.CHANNELS.SETTINGS_SET, { volume: 5 });
    expect(clamped.volume).toBe(1);
  });

  it('library:scan 增量 → scanService.scan({mode:"incremental"})', () => {
    ctx.call(IPC.CHANNELS.LIBRARY_SCAN, {});
    expect(ctx.scanService.scan).toHaveBeenCalledWith({ mode: 'incremental' });
  });

  it('library:rescanAll → resetAlbumStates + scanService.scan({mode:"full"})', () => {
    ctx.call(IPC.CHANNELS.LIBRARY_RESCAN_ALL, {});
    expect(ctx.coverService.resetAlbumStates).toHaveBeenCalledTimes(1);
    expect(ctx.scanService.scan).toHaveBeenCalledWith({ mode: 'full' });
  });

  it('i18n:getMessages 资源缺失 → 返回 {}（T3.5 未交付，留痕）', () => {
    expect(ctx.call<Record<string, string>>(IPC.CHANNELS.I18N_GET_MESSAGES, { lang: 'zh-CN' })).toEqual({});
  });
});
