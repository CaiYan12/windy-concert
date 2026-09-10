export const up = `
CREATE TABLE library_folders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  path         TEXT NOT NULL UNIQUE,          -- 规范化：小写盘符+去尾分隔符
  enabled      INTEGER NOT NULL DEFAULT 1,
  recursive    INTEGER NOT NULL DEFAULT 1,
  last_scan_at TEXT
);

CREATE TABLE artists (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  sort_name       TEXT,
  music_brainz_id TEXT,                        -- 预留（策略 4）
  avatar          TEXT,                         -- 预留，0.5 联网补
  background      TEXT,                         -- 预留
  description     TEXT,                         -- 预留
  track_count     INTEGER NOT NULL DEFAULT 0,
  album_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE albums (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  artist_id       INTEGER NOT NULL REFERENCES artists(id),
  year            INTEGER,
  genre           TEXT,
  cover_id        TEXT,
  music_brainz_id TEXT,                        -- 预留
  disc_count      INTEGER,
  track_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (title, artist_id)                    -- 归组键 = 专辑名 + albumArtist（策略 5）
);

CREATE TABLE tracks (
  id              TEXT PRIMARY KEY,            -- UUID v4，对外唯一 ID（策略 1）
  title           TEXT NOT NULL,
  artist_id       INTEGER NOT NULL REFERENCES artists(id),
  album_id        INTEGER NOT NULL REFERENCES albums(id),
  artist_string   TEXT,                        -- 原始艺术家串（含 feat.）完整保留（策略 2）
  album_artist    TEXT NOT NULL,
  album_title     TEXT NOT NULL,                -- 冗余列：FTS 与归组用
  track_number    INTEGER,
  disc_number     INTEGER,
  year            INTEGER,
  genre           TEXT,
  composer        TEXT,
  comment         TEXT,
  duration        REAL,                        -- 秒
  file_path       TEXT NOT NULL UNIQUE,        -- 唯一即去重键（F1-7）
  file_name       TEXT NOT NULL,
  file_size       INTEGER NOT NULL,
  file_mtime      INTEGER NOT NULL,             -- ms
  format          TEXT NOT NULL,               -- 小写扩展名
  codec           TEXT,
  bitrate         INTEGER,                     -- kbps
  sample_rate     INTEGER,                     -- Hz
  bit_depth       INTEGER,                     -- Hi-Res 展示（5.4）
  channels        INTEGER,
  playable        INTEGER NOT NULL DEFAULT 1,  -- F1-3 不可播标记
  status          TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available','missing','ignored')),   -- F1-6 三态
  music_brainz_id TEXT,                        -- 预留
  acoust_id       TEXT,                        -- 预留
  isrc            TEXT,                        -- 预留
  cover_id        TEXT,
  meta_provenance TEXT,                        -- JSON {"title":"embedded|folder|filename",...}（F2-6）
  play_count      INTEGER NOT NULL DEFAULT 0,
  favorite        INTEGER NOT NULL DEFAULT 0,   -- F6-2 布尔建模
  favorited_at    TEXT,                         -- F6-1 按添加时间排序所需
  rating          INTEGER,                     -- 预留（F12-1）
  last_played_at  TEXT,
  date_added      TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,                            -- 建表预留、无编辑 UI（F6-3）
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 设计决策 D-1：Playlist 不建 cover 列。封面=前 4 首拼贴，属运行时派生值（renderer canvas 合成），持久化违反 YAGNI。

CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  added_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (playlist_id, position)               -- 允许同一曲目多次入歌单；重排=事务内整批重写
);

CREATE TABLE play_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id        TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  played_at       TEXT NOT NULL DEFAULT (datetime('now')),
  played_duration REAL,                        -- 秒
  completed      INTEGER                      -- 1=自然播完；0=中途切走（skip 分析依据，F12-1）
);

CREATE TABLE cover_art (
  id         TEXT PRIMARY KEY,                -- UUID
  source     TEXT NOT NULL CHECK (source IN ('embedded','folder')),
  original_path TEXT,                         -- folder 来源时的 jpg/png 路径
  mime       TEXT,
  width      INTEGER,
  height     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 尺寸文件在 userData/covers/{coverId}/{64,256,512}.jpg，不入库（缓存可重建）。

CREATE INDEX idx_tracks_album_id        ON tracks(album_id);
CREATE INDEX idx_tracks_artist_id       ON tracks(artist_id);
CREATE INDEX idx_tracks_status          ON tracks(status);
CREATE INDEX idx_tracks_file_identity   ON tracks(file_name, file_size, file_mtime);
CREATE INDEX idx_history_track_time     ON play_history(track_id, played_at DESC);
CREATE INDEX idx_history_played_at      ON play_history(played_at DESC);
CREATE INDEX idx_plt_track              ON playlist_tracks(track_id);

-- FTS（F3-7）。trigram 分词器支持中文/英文子串匹配（SQLite >= 3.34，better-sqlite3 ^11 内置版本满足）。
CREATE VIRTUAL TABLE tracks_fts USING fts5(title, artist, album, tokenize = 'trigram');

CREATE TRIGGER tracks_fts_ai AFTER INSERT ON tracks BEGIN
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.rowid, new.title, COALESCE(new.artist_string,''), new.album_title);
END;
CREATE TRIGGER tracks_fts_ad AFTER DELETE ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.rowid, old.title, COALESCE(old.artist_string,''), old.album_title);
END;
CREATE TRIGGER tracks_fts_au AFTER UPDATE OF title, artist_string, album_title ON tracks BEGIN
  INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album)
  VALUES ('delete', old.rowid, old.title, COALESCE(old.artist_string,''), old.album_title);
  INSERT INTO tracks_fts(rowid, title, artist, album)
  VALUES (new.rowid, new.title, COALESCE(new.artist_string,''), new.album_title);
END;
`;
