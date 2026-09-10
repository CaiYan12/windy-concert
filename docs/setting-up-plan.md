# Windy Concert · M0.1 项目建立实施计划（setting-up-plan）

> **执行者须知（For agentic workers）**：本计划使用 checkbox（`- [ ]`）跟踪进度，逐任务推进。完成一步立即勾选并按「提交纪律」提交一次。执行期间只允许两类改动：勾选状态变更、在对应步骤下追加执行备注（格式：`> 执行备注(YYYY-MM-DD): …`）。禁止执行期间改写计划正文、范围与验收标准——发现计划错误时先停下，在会话中提出修订再继续。推荐执行方式：subagent-driven-development（每任务派发独立子代理、任务间两阶段审查）或 executing-plans（本会话内分批执行 + 检查点）。

| 项 | 内容 |
|---|---|
| 计划版本 | V1.4 |
| 日期 | 2026-09-10 |
| 修订记录 | V1.0 初版；V1.1 发布形态改 build\ 绿色目录 + zip（build.bat / start.bat，NSIS 后置）；V1.2 设计案已交付验收（docs/design-handoff.md），renderer 实施基线锁定为 docs/design/tokens.css + mockups/，Phase 4~7 任务挂接设计稿，图标策略改为本地 vendored lucide-static@1.43.0；V1.3（2026-09-10，grill 会话三项裁定 + 工作流约定）：① §4.2 AGENTS.md 只读边界按该文件自身声明校正（# Project Info 以上固定只读，其下 windy-concert 区按阶段收尾约定更新）；② T1.6 trigram 措辞按实测行为修正（trigram 下限 3 字符，<3 由 §3.5d LIKE 回退兜底）；③ Phase 2 开工清单升格正文：T1.2 findByFileIdentity 改返回 TrackRow[]（唯一命中才 adopt，0 或 ≥2 按 create）、listSongs 追加 tracks.id 次级排序键、T1.4 listRecent 改 MAX(id)（原 MAX(played_at) 秒级同曲同秒会并列出重复行）；④ §5 提交纪律补阶段提交门控（状态更新后暂不提交，待用户提议代码审查完毕后统一提交）；V1.4（2026-09-10）：T2.1 fixture #6 由 06-Track06.ape 改为 06-Track06.wma——实测 ffmpeg 9.0 无 ape 编码器/封装器无法产出合法 .ape，wma 同属 SCANNABLE 不可播集（CONTEXT.md 不可播定义点名 WMA），F1-3 语义等价 |
| 上游唯一输入 | docs/finale-analysis.md（需求终稿 V2.0，23 项决策已确认） |
| 本计划目标 | 从零建立工程，交付 0.1.0（M0.1「可日常使用的本地播放器」） |
| 配套文档 | CONTEXT.md（领域术语表）、docs/adr/0001~0003、docs/design-plan.md + docs/design/（已验收设计基线）、docs/design-handoff.md |
| 验收自动化 | Vitest 单测 + Playwright（Electron）E2E + 最终人工验收脚本（已拍板） |
| 渲染层 | React 18 + TypeScript（已拍板） |

---

## 1. 最终目标与范围

### 1.1 目标

交付可安装、可日常使用的 Windows x64 本地音乐播放器 **Windy Concert 0.1.0**：用户添加音乐目录 → 自动扫描入库（标签 + 封面 + Hi-Res 指标）→ 歌曲 / 专辑 / 艺术家 / 歌单 / 收藏 / 最近播放 / 设置七个页面全部可用 → 全局搜索 ≤300ms → 完整播放 / 队列 / 洗牌 / 循环 / 收藏 / 歌单体验 → build.bat 打包出 build\ 绿色运行目录（双击 exe 即测、整目录可直接 zip 发布）。

### 1.2 范围内（M0.1 需求清单，验收标准见 §6）

| 需求组 | 条目 |
|---|---|
| 音乐库与扫描 | F1-1 目录管理、F1-2 递归扫描、F1-3 格式过滤与不可播标记、F1-4 增量扫描、F1-5 启动增量 + 手动全量、F1-6 missing 三态、F1-7 容错与路径去重 |
| Metadata 与封面 | F2-1 本地标签读取、F2-2 优先级链（0.1 形态：内嵌 > 文件夹 > 文件名）、F2-3 无标签回退、F2-4 本地封面发现、F2-5 多尺寸封面缓存、F2-6 来源追溯（数据层） |
| 浏览与搜索 | F3-1 应用 Shell、F3-2 Songs 列表、F3-3 专辑网格、F3-4 艺术家列表、F3-5 专辑详情、F3-6 艺术家详情（基础）、F3-7 全局搜索（FTS） |
| 播放器核心 | F4-1 播放 API、F4-2 播放状态、F4-3 播放栏、F4-4 音量/静音/跟随系统输出 |
| 队列与模式 | F5-1 队列≠歌单、F5-2 上下文入队、F5-3 插队/尾插/队列面板、F5-5 真随机洗牌、F5-6 Repeat 三态×Shuffle |
| 收藏与歌单 | F6-1 喜欢的歌曲、F6-2 favorite 布尔建模、F6-3 自建歌单（增删改查 + 拖拽排序 + 拼贴封面） |
| 播放历史 | F7-1 loadTrack 即计、F7-2 最近播放去重、F7-3 PlayHistory 完整记录 |
| 设置 | F8-1 设置页框架（General / Library / Playback / About）、F8-2 Library 设置 |
| 横切 | 完整数据模型（§3.4 DDL）、七项性能指标（§6.2）、i18n 架构 + 中文资源（5.5）、Hi-Res 指标展示（5.4）、已知限制如实告知（§8） |

### 1.3 范围外（本计划显式禁止实现，防蔓延）

File Watcher（F1-8）、在线补全三件套（F2-7~9 / F9）、拼音搜索（F3-8）、Home 首页（F3-9）、Gapless / Crossfade / ReplayGain / EQ（F4-5~8）、队列面板拖拽重排与删除单曲（F5-4）、歌单多选批量/描述编辑/智能歌单（F6-4~5）、M3U（F6-6）、统计报告（F7-4）、Metadata/Cache 设置分区（F8-3~4）、歌词（F10）、FFmpeg 兜底（F11-1）、TrackArtist 多对多（1.0 回填）、英文资源文件（0.5）、ignored 状态的 UI 入口（F1-6 明确 0.5 提供，0.1 仅建字段）。

---

## 2. 需求结论再分析（口径 → 技术约束）

### 2.1 不可违背的领域口径（执行期间随时对照）

1. **播放过一次 = loadTrack 即计**（F7-1，CONTEXT.md）：音频引擎加载新曲目时 playCount+1 且写入一条 PlayHistory；同曲内暂停恢复、seek 不计。实现约束：计数只在「曲目切换」时发生，与播放/暂停状态机解耦。
2. **Track 稳定 ID = UUID**，重扫以「文件名 + 大小 + mtime」三元组匹配新路径，命中视为移动、保留原 ID。禁止用路径做 ID、禁止用自增整数做对外 ID。
3. **专辑归组键 = album + albumArtist**，不同艺术家同名专辑不得混编。
4. **队列 ≠ 歌单**：Playlist 是持久数据（SQLite），Queue 是会话内存态（不落库、不随重启恢复）。
5. **无标签曲目显示文件名原样**（不含扩展名），M0.1 不做任何文件名模式解析。
6. **网络数据永不覆盖内嵌标签**（0.1 无网络，此口径转化为：provenance 中 user > embedded > folder > filename 的优先序从数据层建立）。
7. **六条架构边界**（违反即架构事故）：UI ≠ Player、Player ≠ Queue、Queue ≠ Playlist、Track ≠ File、Metadata ≠ Track、Remote Metadata ≠ Local Library。

### 2.2 需求结论 → 技术约束映射

| 需求结论 | 落到的技术约束 | 条目 |
|---|---|---|
| Local First，网络只增强 | 0.1 代码库中不得出现任何网络请求代码（无 fetch/axios/在线 API）；全部功能断网可用 | ADR-0003 |
| 数据库与文件系统分离 | UI 全部查询走 SQLite；扫描结束后不存在任何「实时遍历硬盘」的查询路径 | 原则 3 |
| 播放器核心与 UI 分离 | UI → playerStore → playbackService → AudioEngine 四层；全渲染进程只有 AudioEngine 组件可以触碰 `<audio>` 元素 | 原则 4 |
| Metadata 插件化（0.5 起） | 0.1 不建 Provider 抽象（单实现不抽象，YAGNI），但 tagReader 必须是独立模块、无 DB 依赖，保证 0.5 可替换为 Provider 架构 | 原则 5 |
| Windows 优先不锁死 | 禁止调用 Win32 专属 API；路径一律经 `path` 模块拼接；行分隔符禁止硬编码 `\\` | ADR-0001 |
| 3 万首性能 | 扫描与标签解析在 worker 线程；封面多尺寸缓存；列表虚拟滚动；搜索走 FTS5 | §5.1 |
| 无遥测 | 不引入任何 analytics SDK；日志仅写本地 userData/logs/ | ADR-0003 |
| i18n 架构先行 | 文案不进组件硬编码，全部走 `t(key)`；语言资源为磁盘上独立 JSON 文件、运行时读取 | 5.5 |
| 单主艺人 + 保留原串 | Track.artist_string 存原始串（含 feat.），artist_id 指向主艺人实体 | 策略 2 |
| Provenance 数据层 | tracks.meta_provenance JSON 列，扫描时写入每关键字段来源 | F2-6 |

---

## 3. 技术上下文与设计决策

### 3.1 技术栈选型（全部依赖在 T0.3 经 `npm view <pkg> version` 核实最新版后锁定进 package.json）

| 用途 | 选择 | 版本策略 | 理由与备选 |
|---|---|---|---|
| 桌面框架 | Electron | ≥33，T0.3 锁定 | ADR-0001；备选 Tauri 已否决 |
| 构建 | electron-vite（脚手架 `@quick-start/electron`） | ^2 | 主/预加载/渲染三进程统一构建，React+TS 官方模板 |
| 语言 | TypeScript | ^5 | strict 模式全开 |
| UI | React + react-router-dom + zustand + react-virtuoso | 18 / ^6 / ^5 / ^4 | 用户拍板；virtuoso 负责 3 万行虚拟滚动 |
| SQLite | better-sqlite3 | ^11 | 同步 API 匹配主进程、事务批写快、内置 FTS5；备选 node:sqlite（尚 experimental，否决） |
| 标签读取 | music-metadata | ^10 | 纯 JS，覆盖 ID3v1/v2、Vorbis、FLAC、MP4、APEv2，与 F2-1 格式清单逐字对应 |
| 封面缩放 | sharp | ^0.33 | 64/256/512 三档 resize 唯一职责；备选 jimp（纯 JS 但慢 10 倍，否决） |
| 单测 | Vitest | ^3 | 与 vite 生态共享配置 |
| E2E | @playwright/test（`_electron`） | ^1 | 用户拍板，模拟真人操作 |
| 打包 | electron-builder | ^24 | 目录版（dir target），asar；发布形态 = build\ 绿色目录 + zip（用户拍板），NSIS 后置 |
| UUID | crypto.randomUUID() | Node 内置 | 零依赖 |

不引入：UI 组件库（自写 tokens，见 §3.7）、状态管理之外的任何全局库、网络库（0.1 无网络）、任何图标运行时库（lucide-react 等——图标为 vendored 本地 SVG 资产，见 §3.7 图标策略）。

### 3.2 进程与模块架构

```
┌─ Renderer（React，唯一 UI 进程）─────────────────────────────┐
│ pages/*  components/*  stores(zustand)  i18n               │
│      │ 数据一律经 window.api（preload 桥），禁止 require('electron') │
│      ▼                                                      │
│ playbackService ──► playerStore ──► AudioEngine(<audio>)    │
│      │              ▲ 仅此一处触碰 audio 元素（原则 4）        │
│      ▼                                                      │
│ queue（PlayQueue 纯类，会话态，不落库）                       │
└─────────────────────────────────────────────────────────────┘
      ▲ IPC invoke/event                 ▲ wc-file:// wc-cover:// 自定义协议
┌─ Main（唯一持有 SQLite / 文件系统写权限）──────────────────────┐
│ ipc/*  handlers（参数校验后转发 service）                     │
│ ScanService ──► scanner.worker（worker_threads：遍历+标签解析）│
│ CoverService ──► cover.worker（worker_threads：封面提取+缩放） │
│ LibraryService（查询）/ PlaybackStats（计数/收藏/歌单/历史）    │
│ Database(better-sqlite3，WAL)  SettingsStore(JSON)  i18n     │
└──────────────────────────────────────────────────────────────┘
```

关键数据流：

- **扫描流**：UI 触发/启动触发 → main ScanService → scanner.worker 逐批回传解析结果 → main 事务写库 + move 检测 → `scan:progress` 事件 → 渲染层刷新列表。
- **播放流**：双击曲目 → playerStore.loadContext（上下文整队）→ playbackService.loadTrack → AudioEngine 换 src → `library:recordPlay` IPC（计数+历史）→ `ended` → queue.next() 决定下一首或停止。
- **封面流**：扫描时 worker 提取封面原图 → cover.worker 生成 64/256/512 → 渲染层 `<img src="wc-cover://{coverId}?s=256">`。

### 3.3 目录结构（最终形态，执行中只增不乱）

```
windy-concert/
├─ docs/                        # 现有，本计划禁区
├─ resources/
│  ├─ icon.ico                  # 应用图标（T8.1）
│  └─ locales/zh-CN.json        # 运行时语言资源（5.5）
├─ scripts/
│  ├─ dev.mjs                   # 环境净化启动器（见 3.9）
│  └─ gen-sample-library.mjs    # 3 万样本库生成（附录 B）
├─ src/
│  ├─ shared/types.ts           # 跨进程类型契约（TrackRow 等，唯一共享物，仅类型无逻辑）
│  ├─ main/
│  │  ├─ index.ts               # 入口：窗口、协议注册、启动扫描
│  │  ├─ ipc/
│  │  │  ├─ channels.ts         # channel 常量 + payload/返回类型表
│  │  │  └─ index.ts            # handler 注册（校验后转 service）
│  │  ├─ database/
│  │  │  ├─ connection.ts       # 打开连接、PRAGMA、迁移执行
│  │  │  ├─ migrations/         # 0001_init.ts（SQL 模板字符串）
│  │  │  └─ repositories/       # trackRepo / albumRepo / artistRepo / playlistRepo /
│  │  │                         # historyRepo / folderRepo / coverRepo（全部 SQL 收口于此）
│  │  ├─ library/
│  │  │  ├─ scanService.ts      # 扫描编排、增量分类、move 检测、进度事件
│  │  │  ├─ scanner.worker.ts   # 遍历 + music-metadata 解析（worker_threads）
│  │  │  ├─ coverService.ts     # 封面队列调度 + wc-cover 协议数据源
│  │  │  ├─ cover.worker.ts     # sharp 提取与三档缩放
│  │  │  └─ formats.ts          # PLAYABLE / SCANNABLE 集合
│  │  ├─ settings/settingsStore.ts  # userData/settings.json 读写
│  │  └─ utils/logger.ts        # 本地文件日志（userData/logs/）
│  ├─ preload/index.ts          # contextBridge 暴露 window.api
│  └─ renderer/
│     ├─ index.html             # 含 CSP meta
│     └─ src/
│        ├─ styles/             # index.css（入口）+ tokens.css（自 docs/design/tokens.css 复制，唯一 tokens 源）
│        ├─ assets/icons/lucide/ # vendored 图标资产：47 个 SVG 自 docs/design/mockups/assets/lucide/
│        │                      # 原样复制（lucide-static@1.43.0，含 --accent/--on-accent/封面色变体），零运行时图标依赖
│        ├─ App.tsx             # 路由 + 布局
│        ├─ pages/              # Songs / Albums / AlbumDetail / Artists / ArtistDetail /
│        │                      # Playlists / PlaylistDetail / Liked / Recent / Settings / SearchResults
│        ├─ components/         # Shell(Sidebar+Topbar) / PlayerBar / QueuePanel / TrackList / Cover /
│        │                      # SearchBox / ContextMenu / Toast / EmptyState / CollageCover / Icon
│        │                      # （命名对齐 docs/design-handoff.md；视觉基线 = docs/design/mockups/）
│        ├─ player/
│        │  ├─ queue.ts         # PlayQueue 纯类（F5 核心，单测主战场）
│        │  ├─ playbackService.ts# loadTrack/seek/volume + 计数时序
│        │  └─ AudioEngine.tsx  # 唯一 <audio> 挂载点
│        ├─ stores/             # libraryStore / playerStore / settingsStore（zustand）
│        └─ i18n/index.ts       # t(key) + 语言切换
├─ tests/
│  ├─ unit/                     # *.test.ts（Vitest）
│  ├─ e2e/                      # *.spec.ts（Playwright Electron）
│  └─ fixtures/music/           # 手工样本（完整标签 MP3/FLAC/M4A、无标签、损坏、cover.jpg）
├─ electron.vite.config.ts / electron-builder.yml / package.json / tsconfig*.json
└─ README.md
```

### 3.4 数据库 DDL（migrations/0001_init.ts，一次建全，后续版本只增迁移文件）

```sql
PRAGMA user_version 递增由迁移器管理（见 connection.ts）。

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
```

设计决策 D-2：**Playlist/Album/Artist 名称搜索不用 FTS**（数量级 ≤ 数千，`LIKE '%q%'` + 索引足够 ≤300ms）；FTS 仅覆盖 tracks。查询长度 <3 时（trigram 下限）tracks 也回退 LIKE，四类结果共用一套分组聚合。

迁移器（connection.ts 节选，T1.1）：

```ts
import Database from 'better-sqlite3';
import { migrations } from './migrations';

export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i].up);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  return db;
}
```

### 3.5 关键算法决策

**（a）扫描状态机（scanService，F1-4/F1-6 核心）**

```
阶段 A（stat）：worker 只遍历目录拿 {path, size, mtime, ext}，不做任何解析。
阶段 B（分类）：主进程拿 DB 全量 (file_path, file_size, file_mtime, file_name, id, status)
             与 A 结果对账，产出四类：
  unchanged：路径在且 size+mtime 均等      → 跳过（F1-4 增量）
  changed  ：路径在但三元组有变            → 重新解析，保留原 id
  adopt    ：路径不在 DB，但 (file_name, file_size, file_mtime) 唯一命中一条
             status='missing' 的曲目      → 视为移动/重连，仅更新 file_path 与
             status='available'，不重新解析（策略 1）
  create   ：其余                        → 解析为新曲目，分配新 UUID
  对账反向：DB 中路径未出现在 A 结果      → status='missing'（不删记录，F1-6）
阶段 C（parse）：worker 仅解析 changed+create 清单，每 200 条回传一批。
阶段 D（写库）：主进程逐批事务写入；归组（album+albumArtist）与主艺人 upsert；
             扫描完成后一条 UPDATE 重算 albums.track_count/disc_count 与
             artists.track_count/album_count。
阶段 E（封面，异步于主流程）：cover.worker 按 album 维度去重提取，完成即发
             covers:ready 事件，UI 渐进显示。
```

Windows 路径大小写不敏感：file_path 存原样，对账比较键统一 `path.toLowerCase()`。

**（b）PlayQueue（F5 完整实现，纯类，禁止任何 import）**

```ts
// src/renderer/src/player/queue.ts
export type RepeatMode = 'off' | 'all' | 'one';

function shuffle<T>(arr: T[]): T[] {  // Fisher–Yates
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class PlayQueue {
  private original: string[] = [];   // 原始顺序（F5-5 关闭后恢复此序）
  private order: string[] = [];      // 当前播放顺序
  private index = -1;
  shuffle = false;
  repeat: RepeatMode = 'off';

  get current(): string | null { return this.order[this.index] ?? null; }
  get upNext(): string[] { return this.order.slice(this.index + 1); }
  get items(): string[] { return [...this.order]; }
  get currentPosition(): number { return this.index; }

  /** F5-2 上下文入队：整表入队并从 startIndex 播 */
  loadContext(trackIds: string[], startIndex: number): void {
    this.original = [...trackIds];
    if (this.shuffle) {
      const cur = trackIds[startIndex];
      this.order = cur === undefined ? shuffle(trackIds) : [cur, ...shuffle(trackIds.filter(t => t !== cur))];
      this.index = cur === undefined ? -1 : 0;
    } else {
      this.order = [...trackIds];
      this.index = startIndex;
    }
  }

  /** F5-3 插队：当前曲后插入 */
  playNext(trackId: string): void {
    this.order.splice(this.index + 1, 0, trackId);
    this.original.push(trackId);
  }

  /** F5-3 尾插 */
  enqueue(trackId: string): void {
    this.order.push(trackId);
    this.original.push(trackId);
  }

  /** F5-6 Repeat 三态 × Shuffle（6 组合行为见单测） */
  next(): string | null {
    if (this.order.length === 0) return null;
    if (this.repeat === 'one') return this.current;
    if (this.index < this.order.length - 1) { this.index += 1; return this.current; }
    if (this.repeat === 'all') {
      this.order = this.shuffle ? shuffle(this.original) : [...this.original]; // 随机+列表循环=重洗一轮
      this.index = 0;
      return this.current;
    }
    return null; // 播完停止
  }

  previous(): string | null {
    if (this.order.length === 0) return null;
    if (this.index > 0) { this.index -= 1; return this.current; }
    if (this.repeat === 'all') { this.index = this.order.length - 1; return this.current; }
    return this.current; // 队首时重启当前曲
  }

  /** F5-5 洗牌开关：播完一轮前无重复；关闭恢复原顺序 */
  setShuffle(on: boolean): void {
    if (on === this.shuffle) return;
    const cur = this.current;
    this.shuffle = on;
    if (on) {
      this.order = cur ? [cur, ...shuffle(this.order.filter(t => t !== cur))] : shuffle(this.order);
      this.index = cur ? 0 : -1;
    } else {
      this.order = [...this.original];
      this.index = cur ? this.order.indexOf(cur) : -1;
    }
  }

  setRepeat(mode: RepeatMode): void { this.repeat = mode; }
}
```

**（c）播放计数时序（F7-1，playbackService）**

```
loadTrack(trackId)：仅当 trackId !== currentTrackId 时执行——
  1. audio.src = wc-file://<encodeURIComponent(filePath)>
  2. ipc history:recordPlay(trackId) → 返回 historyId 存入会话
  3. currentTrackId = trackId
audio.onended：ipc history:updatePlayOutcome(historyId, {playedDuration: duration, completed: 1})
  → queue.next()，null 则 stop()
手动切歌/停止：先 updatePlayOutcome(historyId, {playedDuration: currentTime, completed: 0}) 再走 next/loadTrack
暂停恢复、拖动进度条：不触发任何 IPC（口径 2.1-1）
```

**（d）搜索（F3-7）**：≥3 字符走 `tracks_fts MATCH`（trigram，中英文子串均可），<3 字符与专辑/艺术家/歌单统一 `LIKE '%'||q||'%'`；结果按 Track(50)/Album(10)/Artist(10)/Playlist(10) 分组返回，handler 内 `console.time` 打点进日志。

**（e）封面管线（F2-2/F2-4/F2-5）**：封面来源判定顺序 = 内嵌 picture（type=front 优先，无则第一张）→ 同目录候选 `cover.jpg → cover.png → folder.jpg → folder.png → front.jpg → album.jpg`。同专辑首个带封面的曲目胜出（内存 Map 按 albumId 去重）。sharp 生成 64/256/512 三档 JPEG（quality 85，`fit:'inside'`）写入 `userData/covers/{coverId}/`。渲染层 URL：`wc-cover://{coverId}?s=256`，handler 校验 coverId 为 UUID 格式后 `net.fetch(pathToFileURL(...))` 返回流。

**（f）音频文件访问协议**：`wc-file://<encodeURIComponent(绝对路径)>`，handler 校验路径前缀命中「启用中的音乐目录集合」（folderRepo 缓存，目录变更时刷新）才放行，防任意文件读取。`registerSchemesAsPrivileged` 时为两个协议声明 `{ stream: true, supportFetchAPI: true }`。

### 3.6 IPC 契约（channels.ts，全部 channel 一览）

| channel | 方向 | payload → 返回 |
|---|---|---|
| library:addFolder | invoke | `{ path?: string }`（省 path 时弹系统目录选择框；e2e 直传）→ `{ id }` |
| library:removeFolder | invoke | `{ id }` → `void` |
| library:setFolderEnabled | invoke | `{ id, enabled }` → `void` |
| library:scan | invoke | `void`（增量）→ `void` |
| library:rescanAll | invoke | `void`（全量重扫：无视三元组全部重解析）→ `void` |
| scan:progress | event→r | `{ phase:'stat'\|'parse'\|'cover'\|'done', done, total, elapsedMs }` |
| covers:ready | event→r | `{ coverId }` |
| library:listSongs | invoke | `{ sortBy, order, offset, limit }` → `TrackRow[]` |
| library:getTrack | invoke | `{ id }` → `TrackRow` |
| library:listAlbums | invoke | `void` → `AlbumCard[]` |
| library:getAlbum | invoke | `{ id }` → `{ album, tracks: TrackRow[] }` |
| library:listArtists | invoke | `void` → `ArtistCard[]` |
| library:getArtist | invoke | `{ id }` → `{ artist, albums: AlbumCard[], tracks: TrackRow[] }` |
| library:search | invoke | `{ q }` → `{ tracks, albums, artists, playlists }` |
| favorites:set | invoke | `{ trackId, favorite }` → `void` |
| favorites:list | invoke | `{ sortBy }` → `TrackRow[]` |
| playlists:list / get / create / rename / delete | invoke | 常规 CRUD → 对应实体 |
| playlists:addTracks | invoke | `{ id, trackIds }` → `void` |
| playlists:removeTrack | invoke | `{ id, trackId }` → `void` |
| playlists:reorder | invoke | `{ id, trackIds }`（新顺序全量）→ `void` |
| history:recordPlay | invoke | `{ trackId }` → `{ historyId }` |
| history:updatePlayOutcome | invoke | `{ historyId, playedDuration, completed }` → `void` |
| history:listRecent | invoke | `{ limit }` → `TrackRow[]`（附 lastPlayedAt） |
| settings:get / set | invoke | `void` / `Partial<Settings>` → `Settings` |
| i18n:getMessages | invoke | `{ lang }` → `Record<string, string>` |

shared/types.ts 核心类型（节选，完整版随 T1.5 交付）：

```ts
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
```

preload 暴露形态：`window.api.{library,favorites,playlists,history,settings,i18n,onScanProgress}`，contextIsolation 开启、nodeIntegration 关闭，渲染层禁止出现 `require('electron')`。

### 3.7 UI 设计规范（深色单主题，0.1 不做主题切换）

> **V1.2 状态：设计基线已交付验收。** 视觉与交互完整依据 = **docs/design-plan.md**（设计语言、逐页状态矩阵、参考、禁忌）；**renderer 施工的视觉基线 = `docs/design/mockups/`（11 产品页 + components.html 组件状态板）**；**tokens 唯一实现源 = `docs/design/tokens.css`**（含 notes.md 记录的实现别名 `--font-mono` / `--radius-round` / `--z-*` / 补充缓动变量——这些是合法增量，不是漂移）。本节下方 tokens 代码块仅为历史基线摘要，实现一律以 tokens.css 为准；冲突按 design-plan 头部仲裁规则处理。图标映射与本地资产规则 = `docs/design/icons.md`；设计决定与偏离记录 = `docs/design/notes.md`；交接结论 = `docs/design-handoff.md`。

**Design tokens（历史基线摘要，实现以 docs/design/tokens.css 为准）**

```css
:root {
  --bg-base: #121212; --bg-elevated: #181818; --bg-sidebar: #0d0d0d;
  --text-primary: rgba(255,255,255,.92); --text-secondary: rgba(255,255,255,.6);
  --accent: #1ed760; --accent-hover: #1fdf64;
  --danger: #e22134;
  --row-hover: rgba(255,255,255,.06); --row-active: rgba(255,255,255,.1);
  --font: "Segoe UI", "Microsoft YaHei", sans-serif; --font-size: 13px;
  --row-height: 48px; --sidebar-w: 232px; --playerbar-h: 72px; --queue-w: 320px;
  --radius: 6px;
}
```

**布局**：左侧 Sidebar（`--sidebar-w`，导航 + 歌单列表）｜右侧主区（顶栏 56px：页面标题 + SearchBox 320px）｜底部 PlayerBar（`--playerbar-h`，常驻）｜QueuePanel 右侧滑入覆盖层。

**页面规格**

| 页面 | 数据 | 关键交互 |
|---|---|---|
| Songs（落地页） | trackRepo.listSongs | 虚拟滚动；列宽：封面 44 / 序号 40 / 标题 minmax(200,2fr) / 艺术家 1fr / 专辑 1fr / 时长 64 / 格式 56 / 比特率 72 / 采样率·位深 110（px）；排序白名单 7 键：title/artist/album/dateAdded/year/duration/playCount |
| Albums | albumRepo.list | 网格 180px 卡片，封面 256 档；卡片 hover 显示播放按钮 |
| AlbumDetail | albumRepo.getAlbum | 头部：封面 200 / 标题 / 艺术家 / 年份·曲目数 / 播放、随机播放按钮；曲目表按 disc→trackNumber 排序；播放按钮 = loadContext(全部曲目, 0) |
| Artists / ArtistDetail | artistRepo | 列表行 = 占位头像 + 名称 + 曲目数；详情页含专辑网格 + 全部曲目（基础版，bio 等属 0.5） |
| Playlists / PlaylistDetail | playlistRepo | 新建（行内输入框）/ 删除（右键确认）/ 重命名（双击名）；详情页曲目拖拽重排（HTML5 DnD，drop 后全量回传 playlists:reorder）；封面 = CollageCover（canvas 2×2 取前 4 首 256 档） |
| Liked | favorites:list | 排序：favorited_at/artist/album/title/playCount（F6-1） |
| Recent | history:listRecent | 去重最新一条；展示封面/标题/艺术家/时间 |
| Settings | settings + folderRepo | 见 Phase 7 |
| SearchResults | library:search | 顶栏输入 debounce 200ms → 下拉分组预览（各组前 5）+ 回车进全结果页 |

**曲目行状态**（全局统一）：missing = 整行 40% 透明 + 右侧「文件缺失」灰标，双击无效；不可播 = 播放图标禁用态 + tooltip「此格式 M0.1 暂不支持播放，0.5 版恢复」；favorite 列 ♡/♥ 切换。**右键菜单**（TrackList 通用）：下一首播放 / 添加到队列 / 收藏或取消收藏 / 添加到歌单（子菜单列出现有歌单 + 新建）。

**空态**：无目录时 Songs 页居中引导「添加音乐目录」按钮直达设置页。

**页面 ↔ 设计稿映射（施工对照表）**

| 实现（Phase） | 设计稿（docs/design/mockups/） |
|---|---|
| Shell / 侧栏 / 顶栏（T4.1） | Songs.html 壳层 + mockup.css 壳层样式 |
| Songs 虚拟列表与行六态（T4.3） | Songs.html（normal/hover/playing/missing/不可播/selected 样本） |
| Albums / AlbumDetail / Artists / ArtistDetail（T4.4） | Albums.html / AlbumDetail.html / Artists.html / ArtistDetail.html |
| 搜索下拉 + 全结果页（T4.5） | SearchResults.html + components.html 搜索下拉区 |
| PlayerBar / QueuePanel（T5.4/T5.5） | components.html 组件板 + 各页播放栏 |
| 收藏 / 歌单 / 最近播放（T6.1~T6.4） | Liked.html / Playlists.html / PlaylistDetail.html（拖拽仅视觉样本：60% 透明 + 2px 插入线）/ Recent.html |
| 设置页四类控制态（T7.1~T7.5） | Settings.html（开关 / 扫描进度 / 行内删除确认 / 已知限制） |
| Toast / 空态 / 右键菜单 / 行内确认 | components.html 组件板 |

**图标策略（硬约束，验收时逐条检查）**：图标一律使用 `src/renderer/src/assets/icons/lucide/` 的 47 个本地 SVG（自 `docs/design/mockups/assets/lucide/` 原样复制，锁定 lucide-static@1.43.0，含 `--accent` / `--on-accent` / 封面色命名变体，如 `heart--accent.svg`、`play--on-accent.svg`）；统一经 `Icon` 组件以 `<img class="library-icon">` 本地加载，尺寸与颜色 token 按 icons.md 映射表。**禁止**：外部 Lucide CDN、运行时 SVG hydration（`lucide.createIcons()` 类调用）、CSS mask、HTML 内联自绘 SVG、引入第二套图标库。理由：Local-first 无网络启动 + `file://` 直开可见性已被设计侧验证收口。

**UI 演进约定（当前稿非最终视觉版，留好调整准备）**：① 组件样式**只准引用 `var(--token)`**，禁止在任何组件 CSS 硬编码色值、字号、尺寸——后续 UI 调整通过修订 tokens.css 完成，不动组件结构；② 组件级样式按组件拆分文件（或 CSS Modules），mockup.css 仅作移植参照，禁止整体拷贝成全局样式造成选择器泄漏；③ 任何实施期视觉偏离（含虚拟滚动约束导致的列宽/密度调整）先记入 `docs/design/notes.md`（决定/理由/影响范围）再实现；④ `components.html` 与各页状态切换器是设计验收工具，**不得作为产品路由或产品功能进入 renderer 代码**。

### 3.8 构建与发布

package.json scripts：

```json
{
  "scripts": {
    "dev": "node scripts/dev.mjs electron-vite dev",
    "build": "node scripts/dev.mjs electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "npm run build && playwright test",
    "postinstall": "electron-builder install-app-deps",
    "dist": "npm run build && electron-builder --win dir"
  }
}
```

根目录 build.bat 源码（T0.4 权威实现；打包 → 同步 build\ 绿色目录；`build.bat zip` 追加生成发布包；内容全 ASCII）：

```bat
@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
if "%~1"=="zip" goto :zip
call npm run build || goto :err
call npx electron-builder --win dir || goto :err
if exist build rmdir /s /q build
robocopy "release\win-unpacked" "build" /E /NFL /NDL /NJH /NJS >nul
if errorlevel 8 goto :err
echo BUILD OK: build\Windy Concert.exe
goto :eof
:zip
powershell -NoProfile -Command "Compress-Archive -Path 'build\*' -DestinationPath ('Windy-Concert-' + (Get-Content package.json ^| ConvertFrom-Json).version + '-win64.zip') -Force"
goto :eof
:err
echo BUILD FAILED
exit /b 1
```

根目录 start.bat 源码（T0.4 权威实现；dev 启动，双击可用；内容全 ASCII）：

```bat
@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
call npm run dev
```

electron-builder.yml（要点）：`appId: cn.windyconcert.app`、`productName: Windy Concert`、输出 `release/`、`files: [out/**]`、`extraResources: [{from: resources/locales, to: locales}, {from: resources/icon.ico, to: icon.ico}]`、`asarUnpack: [**/*.node]`、`win.target: nsis x64`、`nsis: {oneClick: false, allowToChangeInstallationDirectory: true, artifactName: Windy-Concert-Setup-${version}.${ext}}`。产物体积预算 ≤200MB（验收项）。i18n 资源路径解析：`app.isPackaged ? path.join(process.resourcesPath, 'locales') : path.join(process.cwd(), 'resources', 'locales')`。

### 3.9 本机环境注意事项（实测陷阱，写进 T0.2 的 dev.mjs 一并解决）

1. `ELECTRON_RUN_AS_NODE=1` 存在于用户环境变量：任何不经处理的启动都会以纯 Node 模式运行导致 `app undefined`。**所有经 npm script 启动 Electron 的路径必须先经 scripts/dev.mjs 净化**（`delete env.ELECTRON_RUN_AS_NODE` 后 spawn）；根目录 start.bat / build.bat 内亦显式 `set "ELECTRON_RUN_AS_NODE="`（双保险）；Playwright electron.launch 的 env 同样剔除该变量。
2. `NODE_TLS_REJECT_UNAUTHORIZED=0` 同在环境：仅产生安装期警告，不处理，但 README 需提示。
3. Electron 二进制偶发未随 install 下载：修复命令 `node node_modules/electron/install.js`。
4. better-sqlite3 / sharp 为原生模块：`postinstall: electron-builder install-app-deps` 负责 ABI 对齐；若失败回退 `npx @electron/rebuild`。

---

## 4. 修改边界（允许与禁止）

### 4.1 全局允许修改

- 新建：`src/**`、`tests/**`、`scripts/**`、`resources/**`、`electron.vite.config.ts`、`electron-builder.yml`、`package.json`、`tsconfig*.json`、`.gitignore`、`README.md`、`playwright.config.ts`、`vitest.config.ts`、根目录 `build.bat`、`start.bat`；`src/renderer/src/styles/tokens.css` 与 `src/renderer/src/assets/icons/lucide/**` 为 `docs/design/` 产物的**复制落位**（T4.0），非独立创作。
- 例外修改 `docs/setting-up-plan.md`：仅限 checkbox 勾选与 `> 执行备注` 追加。
- 依赖新增：仅限 §3.1 清单内已列包及其类型包；清单外依赖必须先在会话中提请决策并回写本计划（走执行备注），不得静默引入。

### 4.2 全局禁止触碰

| 区域 | 禁令 |
|---|---|
| docs/finale-analysis.md、primalreport.md、CONTEXT.md、docs/adr/** | 只读。需求与决策变更另行走文档修订流程，不在本计划内 |
| AGENTS.md | **# Project Info 以上固定区只读**；其下 windy-concert 区按阶段收尾约定更新（该文件自身已声明，V1.3 校正——原「只读」措辞过于笼统） |
| **docs/design/**（tokens.css、mockups/、icons.md、notes.md、design-handoff.md） | 已验收的设计基线，实施期**只读**；tokens 演进与视觉偏离经 `notes.md` 追加记录 + 在会话中提请修订，不得直接改源文件 |
| .workbuddy/**、.git/** | 禁改；禁止 rebase/force 改写历史；不建分支（除非用户点名） |
| node_modules/**、out/**、release/**、build/**、userData 运行时产物 | 禁止手工修改（构建产物） |
| §1.3 范围外功能 | 任何「顺手实现」均视为范围蔓延，直接拒绝 |
| 网络代码 | 0.1 全库不得出现任何网络请求 import / fetch 调用 |
| 图标来源 | 禁止外部图标 CDN、`lucide.createIcons()` 类运行时 hydration、CSS mask、HTML 内联自绘 SVG、第二套图标库（含 lucide-react 等 npm 图标组件包）；唯一来源 = vendored `assets/icons/lucide/` 经 `Icon` 组件 `<img class="library-icon">` 加载 |

### 4.3 模块解耦规则（每次提交前自检）

1. renderer 不得 import `src/main/**`、`src/preload/**`（仅 `@shared` 类型与 `window.api`）。
2. `src/shared/**` 仅允许类型与常量，零逻辑、零 import 两侧实现。
3. `player/**`（queue、playbackService、AudioEngine）不得 import library/playlists 数据模块——曲目数据经参数注入（上下文入队由页面把 `TrackRow[]` 传给 playerStore）。
4. database/repositories 是唯一 SQL 收口点，service 层禁止拼 SQL。
5. scanner.worker / cover.worker 不得 import 数据库——与主进程只经 postMessage 通信。
6. i18n：组件内禁止硬编码文案（全部 `t(key)`）；日志与 throw message 除外。
7. 渲染层唯一触碰 `<audio>` 的文件是 `AudioEngine.tsx`；唯一触碰 `window.api` 之外的 Electron 能力的文件是无（preload 之外）。
8. 视觉样式：组件 CSS 一律引用 `var(--token)`，禁止硬编码色值/字号/尺寸；图标一律经 `Icon` 组件（vendored 资产），组件源码中不得出现 `<svg>` 标签、`data-lucide` 或图标 CDN URL；`mockups/*.html`、`mockup.js`、页面状态切换器禁止被 import 或复制进产品代码。

---

## 5. 实施阶段（正文主体）

> 每阶段结构固定：阶段名称 / 关键任务 / 具体技术实现（checkbox 步骤）/ 预期产出 / 验收标准。提交纪律：每个任务（T 编号）完成后一次 commit，message 用 `feat|test|chore|docs(scope): 描述`；阶段全部验收通过后推送远端（AGENTS Git Rule）。**V1.3 阶段收尾与提交门控（2026-09-10 用户拍板）**：每阶段完成后更新三处状态文档（工作区记忆 / AGENTS.md Project Status / README.md 遗留段）后**暂不 commit/push**，待用户提议代码审查且审查完毕后再统一提交；subagent 统一用 GLM 5.3 Flash，遇 429 直接打断询问用户换何种模型。

### Phase 0｜工程脚手架与基线（预计 0.5 天）

**关键任务**：初始化仓库与脚手架、锁定依赖、环境净化、测试基线。

**具体技术实现**

- [x] **T0.1 仓库初始化**：确认 `git status`（无 .git 则 `git init`）；写 `.gitignore`：`node_modules/ out/ release/ build/ *.log .workbuddy/ playwright-report/ test-results/ dev-userdata/`；建 `README.md`（一行简介 + dev/build 命令占位，Phase 8 完善）。→ 验证：`git status` 干净可提交。
  > 执行备注(2026-09-10): git init 于分支 main（初始分支由 master 更名，非建分支）；.gitignore 计划条目逐字保留，另按 AGENTS.md Git Rule 追加 `.playwright-cli/`、`.design-flow.json`、`output/`（会话插件产物与设计期截图，不入库）；README 含一行简介 + dev/build 命令占位 + NODE_TLS 提示（§3.9-2）；应用户指令经 gh 创建并链接远端 origin = https://github.com/CaiYan12/windy-concert（私有，仅链接未推送——推送时机按 §5 提交纪律为阶段验收后）；另有一笔 docs 提交收录既有文档（AGENTS/CONTEXT/docs/primalreport）。
- [x] **T0.2 脚手架**：`npm create @quick-start/electron@latest`（交互选 React + TypeScript 模板；非交互参数以 `npm create @quick-start/electron -- --help` 实际输出为准）。得到 electron-vite 三进程骨架与 tsconfig。
  > 执行备注(2026-09-10): create-electron@1.0.30 无 --help 支持（实跑掉入交互 prompt），非交互参数改经该包 index.js 源码（minimist）实证为 `--template react-ts --skip`，命令 `npm create @quick-start/electron@latest -- <临时目录> --template react-ts --skip`；仓库外临时目录生成后并入根目录，脚手架自带 .gitignore/README.md 丢弃、既有文件零覆盖（spec 审查 26 文件全为 A 状态）；未运行 npm install；package.json name 改为 windy-concert；模板交付 electron ^39.2.6 / electron-vite ^5.0.0 / react ^19.2.1，与 §3.1 版本策略列（React 18 / electron-vite ^2）存在漂移，留待 T0.3 经 npm view 核实后提请用户决策；质量审查 APPROVED（sandbox:false 为模板默认仅跟踪，dev.mjs 缺失属 T0.4 范围）。
- [x] **T0.3 依赖锁定**：对 §3.1 清单逐个 `npm view <pkg> version` 记录当日最新版，写入 package.json 并 `npm install`：`better-sqlite3 music-metadata sharp zustand react-router-dom react-virtuoso`；devDeps：`vitest @playwright/test`。装完跑 `npm run dev` 确认窗口可开（若报 electron 未下载，执行 3.9-3 修复）。
  > 执行备注(2026-09-10): §3.1 版本策略列与当日实际存在系统性漂移（React 18→19.2、electron-vite ^2→5、electron ≥33→模板 39 线、better-sqlite3 ^11→13、music-metadata ^10→11、vitest ^3→5、electron-builder ^24→26、react-router-dom ^6→7），按红线停下提请用户决策，拍板为「模板基线 + 新增依赖最新」：模板自带 electron ^39.2.6 / electron-vite ^5.0.0 / react ^19.2.1 / typescript ^5.9.3 / @vitejs/plugin-react ^5.1.1 / electron-builder ^26.0.12 保持不动；新增锁定（npm view 2026-09-10 实测）better-sqlite3 ^13.0.3、music-metadata ^11.15.0、sharp ^0.35.4、zustand ^5.0.15、react-router-dom ^7.18.3、react-virtuoso ^4.18.13、vitest ^5.0.0、@playwright/test ^1.63.0。install 640 包成功，install-app-deps 对 better-sqlite3 完成 rebuild（Electron 39.8.10 ABI），electron.exe 201MB 就位（无需 3.9-3 修复）。allow-scripts 白名单：`npm config set` 在本机 npm 10.9.7 被键校验拒绝，安装以 `npm_config_allow_scripts` 环境变量注入完成，持久化由主会话按 §4-2 直接编辑 ~/.npmrc 完成（追加 electron,better-sqlite3,sharp，既有项保留，`npm config get` 复验通过）。dev 冒烟（代理信号）：`timeout 30 env -u ELECTRON_RUN_AS_NODE npm run dev` 进程存活至超时（EXIT=124 预期）、main/preload 构建成功、renderer 起 5173、无 getAppPath 错误 → 窗口可开。jsdom 为 T0.5 任务文本明示的测试环境依赖（§3.1 未列，T0.5 时随任务新增并在此留痕）。
- [x] **T0.4 scripts/dev.mjs 与根目录 build.bat / start.bat**：dev.mjs 净化环境并透传参数 spawn 子进程：

```js
import { spawn } from 'node:child_process';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit', env, shell: true });
child.on('exit', (c) => process.exit(c ?? 0));
```

package.json scripts 按 §3.8 替换；按 §3.8 源码创建根目录 `build.bat`（打包 → 同步 build\ 绿色目录，`build.bat zip` 生成发布包）与 `start.bat`（dev 启动），两文件内容全 ASCII。→ 验证：在当前 shell 直接 `npm run dev` 可正常起窗口（不依赖手工 unset）；`start.bat` 双击可进入 dev；`build.bat` 完整链路验证推迟到 T8.1（脚手架期仅要求脚本存在且语法可执行）。
  > 执行备注(2026-09-10): dev.mjs（LF）/ build.bat / start.bat（CRLF、全 ASCII 零命中）均与 §3.8 源码块逐字一致（spec 审查逐字 diff 零差异）；package.json scripts 由模板 12 条替换为 §3.8 八条（移除 format/lint/start/typecheck:node/typecheck:web/build:* 等，依赖区块未动）；核心验证 `timeout 30 npm run dev`（无 env -u 前缀）EXIT=124（预期超时）、无 getAppPath 错误、main/preload 构建成功 → dev.mjs 净化生效；`npm run typecheck` 0 错误（模板无需修复）；bat 实际执行链路按计划留待 T8.1。质量审查 APPROVED（Minor：zip 分支无 build 存在性守卫属计划既定设计；dev.mjs 依赖 npm run 注入 PATH 属计划预见机制）。按审查建议与 AGENTS.md Git Rule 将 `*.tsbuildinfo` 补入 .gitignore（typecheck 实际副产物）。
- [x] **T0.5 测试基线**：`vitest.config.ts`（两个 project：node 环境跑 `src/main/**` + `tests/unit/**`，jsdom 跑 `src/renderer/**`）；`playwright.config.ts`（testDir `tests/e2e`，`_electron.launch({ args:['out/main/index.js'], env: 剔除 ELECTRON_RUN_AS_NODE 且注入 WC_USER_DATA 临时目录 })` 封装为 fixture `app`）；main/index.ts 顶部加 `if (process.env.WC_USER_DATA) app.setPath('userData', process.env.WC_USER_DATA)`（e2e 隔离钩子，兼作 §6 性能测量的可重置环境）。写一个恒真单测 `tests/unit/smoke.test.ts` 与一个空 e2e `launch.spec.ts`（启动→断言窗口 title）。→ 验证：`npm test` 与 `npm run test:e2e` 全绿。
  > 执行备注(2026-09-10): jsdom ^30.0.1 为唯一新增 devDep（jsdom project 运行时前提，§3.1 隐含依赖，T0.3 备注已留痕）；vitest.config.ts 双 project（node: src/main/**+tests/unit/**；jsdom: src/renderer/**，passWithNoTests 因 renderer 暂无测试）；tests/e2e/fixtures.ts 提供 app fixture（mkdtempSync 唯一 WC_USER_DATA 临时目录 + delete ELECTRON_RUN_AS_NODE + _electron.launch，teardown 清理临时目录与 app）；main/index.ts 仅一行钩子插入（imports 后、createWindow 前）；npm test 1 passed；npm run test:e2e 1 passed（窗口 title 实测 "Electron"，断言非空）；_electron 复用 electron 二进制未触发 playwright install chromium。环境注记：本 CLI 沙箱的 node-safe-delete shim 会在 vite emptyOutDir 时拦截批量删除，复跑 test:e2e 需 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 前缀（用户本机不受影响）。质量审查 APPROVED（Minor 不阻塞：fixtures 类型断言异味、page/firstWindow 重复暴露、launch.spec console.log 调试残留——留待后续阶段顺手清理）。

**预期产出**：可 dev、可 build、可单测、可 e2e 的空应用仓库。

**验收标准**：`npm run dev` 窗口正常；`npm run typecheck` 0 错误；`npm test` / `npm run test:e2e` 通过；git log ≥5 个合规 commit。

### Phase 1｜数据层：SQLite + 迁移 + 仓库 + FTS（预计 1 天）

**关键任务**：按 §3.4 DDL 建库，实现全部 repositories 与查询，纯数据层（无 Electron UI 依赖，可独立单测）。

**具体技术实现**

- [x] **T1.1 连接与迁移**：`src/main/database/connection.ts`（§3.4 迁移器代码）+ `migrations/0001_init.ts`（§3.4 全部 DDL）+ `migrations/index.ts`。单测 `tests/unit/db/migrations.test.ts`：① `:memory:` 打开即 user_version=1；② 重复打开幂等；③ `SELECT sqlite_version()` ≥3.34（trigram 可用性守卫）。
  > 执行备注(2026-09-10): connection.ts 与 0001_init.ts 均逐字（spec 审查：8 表 7 索引 3 触发器 + FTS trigram 虚表计数核对全中，关键约束抽查通过）；migrations/index.ts 导出 `migrations` 数组 + 最小 `interface Migration { up: string }`；新增 devDep @types/better-sqlite3 ^9.6.0（§4.1 类型包授权，唯一依赖新增，npm view 实测）；三条单测通过（sqlite_version 3.53.4，数值化比较规避字符串比较 bug）；better-sqlite3 在 node 下加载正常无 ABI 问题；typecheck 0 错误；质量审查 APPROVED（Minor：@types 落后运行时 4 个大版本，当前 API 无实际类型风险，预防性维护项留档）。
  > 执行备注(2026-09-10): 补记——T1.2 期间发现本任务交付的 0001_init.ts 中 tracks_fts_ad/au 触发器存在计划缺陷：'delete' 特殊 INSERT 仅适用于 contentless/external-content fts5 表，普通 fts5 表运行时抛 SQL logic error（主会话 node 实验独立复现，并验证标准 DELETE FROM 行为正确）；经用户批准修正为 `DELETE FROM tracks_fts WHERE rowid = old.rowid;`（commit 1def31f，仅触及上述语句，其余 DDL 逐字不变），计划正文按纪律保持原文、以本备注留痕。
- [x] **T1.2 trackRepo**：`createMany(tracks)`（事务批量 prepared insert）、`listSongs({sortBy, order, offset, limit})`（排序键白名单映射见 §3.7，防注入：键必须命中 Map 否则抛错；V1.3 起排序追加 `tracks.id` 次级键，保证重复键下 offset 分页稳定）、`findById`、`updateAfterParse(id, parsed)`、`updateFileIdentity(id, {filePath})`、`setStatus(ids, status)`、`markMissing(exceptPathsLower)`、`findByFileIdentity(fileName, size, mtime)`（move 检测，附加 `AND status='missing'` 条件在 service 层；V1.3 起返回 `TrackRow[]` 全部命中——唯一命中才 adopt，0 或 ≥2 均按 create，§3.5a 歧义宁可新建）、`setFavorite(id, favorite)`（同步写 favorited_at）、`incrementPlay(id)`、`listByIds(ids)`。
  > 执行备注(2026-09-10): 11 方法按规格交付（工厂函数 + prepared statements；findByFileIdentity 的 status 过滤参数化留痕——SQL 收口 repo、条件决策 service 两措辞同时满足；updateAfterParse 固定白名单 Map 生成 SET、值全 bind 留痕）；14 用例先行全绿。期间发现并经用户批准修正计划 §3.4 FTS 触发器缺陷（详见 T1.1 补记，commit 1def31f），FTS 同步断言解锁。质量审查 NEEDS_FIXES → 修复 IN 列表 32766 参数上限：setStatus/listByIds 按 500 分批、markMissing 改临时表 _wc_mark_missing_paths（NOT IN 语义不可分批，事务覆盖临时表全生命周期）、findByFileIdentity status 补守卫、+3 条大列表回归用例（commit 0e6426a），复审 APPROVED。终态 npm test 21 passed / 0 skipped、typecheck 0 错误。
- [x] **T1.3 artistRepo / albumRepo**：`upsertArtist(name) → id`（`INSERT ... ON CONFLICT(name) DO NOTHING` + SELECT）、`upsertAlbum(title, artistId)`；`recountStats()`（扫描后重算 counts 的两条 UPDATE，§3.5a 阶段 D）；`listAlbums` / `getAlbumWithTracks`（`ORDER BY disc_number, track_number`）/ `listArtists` / `getArtistOverview`。
  > 执行备注(2026-09-10): 7 方法按规格交付（recountStats 归入 albumRepo 单一入口，事务包裹；disc_count=COUNT(DISTINCT disc_number) WHERE NOT NULL、album_count=COUNT(DISTINCT album_id) FROM tracks、仅重算 count 列、listAlbums year DESC NULL 垫底+title ASC、listArtists name ASC——均留痕）；rowMapper.ts 提取 TrackRow 映射单一收口，trackRepo.ts 仅导入级最小 diff（spec 审查逐行核验 SQL 与行为零变化）；AlbumDetail/ArtistDetail 自定类型留痕。10 新单测，npm test 31 passed 零回归、typecheck 0 错误。质量审查 APPROVED（留档 follow-up：getAlbumWithTracks 的 disc_number NULL 排序依赖 SQLite 默认 NULLS-FIRST，与 listAlbums 的显式垫底约定不一致，因计划原文即 `ORDER BY disc_number, track_number` 未改码，Phase 4 消费时若需统一再提请）。
- [x] **T1.4 playlistRepo / historyRepo / folderRepo / coverRepo**：playlistRepo：`create/rename/delete/list/get(addTracks/removeTrack)`、`reorder(id, trackIds)`（事务内 DELETE+批量 INSERT，§3.4 注释）；historyRepo：`recordPlay(trackId)`（INSERT + tracks 侧 UPDATE 同事务）→ 返回 historyId、`updateOutcome(historyId, {playedDuration, completed})`、`listRecent(limit)`（§2 口径去重 SQL：V1.3 起子查询 `MAX(id)` GROUP BY track_id 再 JOIN——原 MAX(played_at) 在 datetime('now') 秒级粒度下同曲同秒两次播放会并列出重复行，违反 F7-2）；folderRepo：`add/remove/setEnabled/list`（path 规范化：小写盘符 + 去尾部 `\\`）；coverRepo：`insertCover` / `setAlbumCover(albumId, coverId)`。
  > 执行备注(2026-09-10): 四 repo 交付（playlistRepo PlaylistRow / folderRepo FolderRow 自定类型留痕；removeTrack 删最小 position 一次出现、留洞语义自洽留痕；historyRepo tracks 侧 UPDATE 收口自身 prepared 留痕；normalizePath 内部函数）。listRecent 按计划原文 MAX(played_at) 实现，秒级并列边界注释留痕（质量审查 I1：同曲同秒两次播放会出重复行，Phase 2 改 MAX(id)/tiebreak 必修——延后决策已留痕）。15 新单测，npm test 46 passed 零回归、typecheck 0 错误。质量审查 APPROVED（Minor 跟进项留档：UNC 主机段大小写归一、根路径 C:\→c: 语义、空串无校验、folder 测试断言 2/4 形态、addTracks FK 报错信息、reorder([]) 无守卫——收尾时记入 README 遗留段）。
- [x] **T1.5 shared 类型**：`src/shared/types.ts` 写全 §3.6 列出的 TrackRow/AlbumCard/ArtistCard/Settings/ScanProgress/搜索结果类型。
  > 执行备注(2026-09-10): 本任务提前至 T1.2 前执行（T1.2~T1.4 的 repo 返回类型依赖 TrackRow，先立契约避免类型空窗与返工；范围不变仅顺序调整，留痕）。四接口逐字 + ScanProgress/CoversReady/SearchResult/PlaylistSummary/SortKey/SortOrder；PlaylistSummary { id; name; trackCount } 为计划未定义形状的最小合理决定（搜索下拉所需，注释留痕）；@shared 别名接线：electron.vite.config.ts renderer 段 + tsconfig.web.json paths（baseUrl 实测为 "."，基准 src/shared/*，纠正了派发指令中的 "../../" 臆测）+ tsconfig.node.json include 补 src/shared；main/preload 侧无别名，以相对路径引入 shared（质量审查 Minor 留档）；typecheck 0 错误，npm test 4 passed 无回归；质量审查 APPROVED（TrackRow 为 §3.6 节选定稿，DDL 其余列如 composer/codec/channels 留待消费方扩展时补）。
- [x] **T1.6 查询单测**（`tests/unit/db/*.test.ts`，全部用 `:memory:` 库 + 手工 INSERT 造数）：
  - FTS 触发器：INSERT/UPDATE title/DELETE 后 `tracks_fts` 行数与内容同步；
  - trigram：中文 3 字符子串命中（trigram 分词器下限 3 字符，「七里」2 字符 MATCH 返回 0 行——<3 由 §3.5d 回退 LIKE 兜底；V1.3 按实测行为修正措辞）、英文大小写不敏感；
  - 短查询回退路径的 LIKE 行为；
  - 专辑唯一约束：同名不同 albumArtist → 两个 album；同 albumArtist 同名 → 冲突合并；
  - `listRecent` 去重：同曲目两次播放只返回最新一条；
  - `reorder` 重排后 position 连续无冲突；
  - `setFavorite` 写 favorited_at。
  > 执行备注(2026-09-10): 新增 tests/unit/db/query-behavior.test.ts（8 用例：FTS INSERT 同步含 COALESCE 空串、FTS DELETE 同步、trigram 中英行为、LIKE 语义背书 ×2、专辑 UNIQUE 约束 raw 角度 ×2）；其余五场景（listRecent 去重/reorder 连续/setFavorite/复合冲突合并/FTS UPDATE 同步）由既有 repo 测试覆盖，映射表见该文件头注释。**实测留痕**：trigram 存在 3 字符下限，「七里」（2 字符）MATCH 0 行——任务文中「七里命中七里香」措辞与 §3.5d 自身的 trigram 下限回退依据矛盾，按 SQLite 实际行为断言并留痕（§3.5d 设计自洽，无需改码）。执行方式降级留痕：本任务派发子代理遭遇 429 频率限制（至 13:44 UTC+8），子代理已完成测试文件后中断，主会话按「执行者须知」备选的 executing-plans 检查点流程接手完成自检（场景映射/import 边界审计：数据层仅依赖 better-sqlite3 类型、node:crypto、相对路径 shared/types 与内部 rowMapper，零 Electron 零 service 引用）与提交；两阶段审查由主会话自检替代，建议频率限制解除后补一轮独立审查。Phase 1 验收：npm test 54 passed（数据层用例 53，≥12 达标）、typecheck 0 错误、七 repo 全部有覆盖。

**预期产出**：数据层完成，全部 SQL 行为有单测背书。

**验收标准**：`npm test` 全绿（≥12 个数据层用例）；`npm run typecheck` 通过；T1.2~T1.4 每个 repo 至少一个用例覆盖；无任何 service/UI 代码 import 本层以外模块（目录内自检）。

### Phase 2｜扫描与 Metadata 管道（预计 3 天）

**关键任务**：worker 扫描、标签解析、增量与 move 检测、封面管线、容错；构造样本库与性能打点。

**具体技术实现**

- [ ] **T2.1 formats.ts 与 fixtures**：PLAYABLE=`{mp3, flac, wav, ogg, opus, m4a}`、SCANNABLE=PLAYABLE∪`{ape, wma, aiff, aif, dsf, dff, wv, tta, ac3, mka}`。`tests/fixtures/music/` 一次性制作并提交（每个 <100KB，固定为以下 8 个文件，后续 e2e 断言以「入库 7 条」为准——损坏文件按 F1-7 跳过不入库）：
  1. `01-夜曲.mp3`（完整标签 + 内嵌封面）
  2. `02-夜曲.flac`（完整标签）
  3. `03-晴天.m4a`（完整标签）
  4. `04-untagged.flac`（零标签）
  5. `05-hires.flac`（24bit/96kHz 标签完整，Hi-Res 列验收）
  6. `album2/06-Track06.wma`（完整标签，不可播格式；V1.4 原 .ape——ffmpeg 无 ape 编码器）
  7. `album2/07-Track07.mp3`（仅 album=测试专辑二、album_artist=测试艺人，缺 title/artist；专辑封面来自 `album2/cover.jpg`；V1.4 调整——防与 04 双零标签经「未知专辑」跨目录归组）
  8. `08-broken.mp3`（字节截断，扫描容错样本，不入库）
  ```bash
  ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 3 -metadata title="夜曲" -metadata artist="周杰伦" \
    -metadata album="十一月的萧邦" -metadata album_artist="周杰伦" -metadata track=1/10 -metadata disc=1 \
    -metadata genre="Pop" -metadata date=2005 -metadata composer="周杰伦" fixtures/music/01-夜曲.mp3
  ```
  无 ffmpeg 时从个人曲库复制 3 秒片段替代。Hi-Res 样本：`-ar 96000 -sample_fmt s32` 生成 24bit/96kHz FLAC 用于指标列验收。
- [ ] **T2.2 scanner.worker.ts**：实现 §3.5a 阶段 A 的 walker（`fs.promises.readdir` 递归、stat 并发批 64、目录/单文件失败仅记日志跳过——F1-7）与阶段 C 的解析（music-metadata `parseFile`，字段映射：`common.title ?? 文件名去扩展名`（F2-3）、`common.artists?.[0] ?? common.artist ?? common.albumartist` → artist_string 原样保留、`common.albumartist ?? artist_string ?? '未知艺术家'` → albumArtist、`common.album ?? '未知专辑'`、format/bitrate(`format.bitrate/1000`)/sampleRate(`format.sampleRate`)/bitDepth(`format.bitsPerSample`)/duration/channels、picture 取出待 cover 队列）。消息协议：`{type:'stat', files}` → 主进程分类回发 `{type:'parse', files}` → worker 分批 `{type:'batch', parsed, done}`。**worker 内禁止 import 数据库**。
- [ ] **T2.3 scanService.ts**：实现 §3.5a 全部五阶段；adopt 匹配需 `findByFileIdentity` 结果唯一（0 或 ≥2 命中均按 create 处理，歧义宁可新建）；启动时若 `settings.autoScanOnStartup` 且存在启用目录则后台触发增量扫描（不阻塞窗口显示）；`scan:progress` 事件；扫描日志含 summary（total/parsed/skipped/adopted/missingMarked/elapsedMs）写 `userData/logs/scan.log`。
- [ ] **T2.4 coverService + cover.worker**：接收 `{coverId 来源: embedded bytes | folderPath}` 队列；按 albumId 去重（内存 Map，首个成功者胜出——F2-4 同专辑复用）；folder 候选按 §3.5e 顺序探测；sharp 三档输出；`covers:ready` 事件；coverRepo 落库。**封面生成异步于扫描主流程**，扫描 done 不等待封面完成。
- [ ] **T2.5 provenance 写入**：解析时组装 `{title:'embedded'|'filename', artist:'embedded', ...}`；folder 封面对应 `cover:'folder'`；存入 tracks.meta_provenance（F2-6）。
- [ ] **T2.6 扫描单测**（`tests/unit/library/*.test.ts`，临时目录 + `:memory:` 库直接驱动 service）：
  - F1-2：5 层嵌套目录全部入库；
  - F1-4：二次扫描解析计数器=0（service 暴露 parseCount 供断言）；
  - 策略 1：改名/移动目录后重扫，Track id 不变（UUID 断言）；
  - F1-6：删除文件重扫 → status=missing；文件恢复 → available（走 adopt）；
  - F1-7：损坏文件与被占用文件（测试内以独占句柄模拟）不中断扫描；
  - F1-3：WMA 入库且 playable=0（V1.4 原 APE）；
  - F2-1：三格式 fixture 全字段断言（含 cover bytes 存在）；
  - F2-3：无标签文件 title=文件名去扩展名；
  - F2-4：仅 cover.jpg 目录的专辑获得 folder 来源封面。
- [ ] **T2.7 样本库生成脚本**：`scripts/gen-sample-library.mjs`（附录 B），支持 `--count 30000 --out <dir>`。

**预期产出**：完整「目录 → 入库 → 封面就绪」管道 + 30k 性能样本能力。

**验收标准**：T2.6 全绿；手工冒烟——`npm run dev` 向设置页（临时用 e2e 钩子或 T3 完成后走 UI）指向 fixtures 目录，扫描日志 summary 正确；3 万库首扫计时 ≤5 分钟（计时记录进 scan.log，此为 §6.2-P2 的预检，不达标立即触发 §7-R1 应对，不得拖到 Phase 8）。

### Phase 3｜IPC 契约、Preload 桥、设置与 i18n 运行时（预计 1.5 天）

**关键任务**：打通 §3.6 全部 channel、两个自定义协议、settings.json、运行时语言资源。

**具体技术实现**

- [ ] **T3.1 channels + handlers**：`src/main/ipc/channels.ts` 常量与类型；`index.ts` 逐条 `ipcMain.handle`，参数校验（id 存在性、枚举值）后转发对应 service/repo；`webContents.send` 封装 scan:progress / covers:ready。
- [ ] **T3.2 协议注册**：main/index.ts `protocol.registerSchemesAsPrivileged`（两 scheme，§3.5f）；ready 后 `protocol.handle('wc-cover'…)` 与 `protocol.handle('wc-file'…)`（路径前缀校验逻辑，folderRepo 缓存随目录变更失效）。
- [ ] **T3.3 preload**：contextBridge 暴露 §3.6 形态的 `window.api`；`onScanProgress`/`onCoversReady` 返回 unsubscribe。渲染层加 `src/renderer/src/ipc/client.ts` 薄封装。index.html CSP：`default-src 'self'; img-src 'self' wc-cover:; media-src 'self' wc-file:; style-src 'self' 'unsafe-inline'`。
- [ ] **T3.4 settingsStore**：`userData/settings.json` 原子写（tmp+rename）；默认值 `{language:'zh-CN', autoScanOnStartup:true, volume:0.8, muted:false}`；get/set IPC；language 变更即返回新资源。
- [ ] **T3.5 i18n**：`resources/locales/zh-CN.json`（全量文案 key，覆盖 §3.7 所有页面/菜单/空态/设置）；main 侧 `i18n:getMessages` 按磁盘读取（路径解析见 §3.8，5.5 运行时要求）；renderer `i18n/index.ts`：`t(key, params?)` + zustand 语言 store，切换语言重新拉取并整树重渲染。
- [ ] **T3.6 单测/类型测试**：settings 往返与默认值合并；`window.api` 形状用 `tests/unit/preload-contract.test.ts`（类型层 `expectTypeOf`）锁死，防止后续漂移。

**预期产出**：渲染层可完整调用后端能力，协议可出图出音频。

**验收标准**：`npm test` 全绿；`npm run test:e2e` 的 launch.spec 扩展为：临时 userData + fixtures 目录 → `library:addFolder {path}` → 收到 scan:progress done → `library:listSongs` 返回 7 条（损坏样本按 F1-7 跳过）；`wc-cover://` URL 在页面 `<img>` 成功显示（Playwright 断言 naturalWidth>0）。

### Phase 4｜应用 Shell 与浏览/搜索 UI（预计 3 天）

**关键任务**：设计资产接入、路由骨架、七个页面全部落地、虚拟滚动、搜索。视觉施工基线 = docs/design/mockups/（已验收，见 docs/design-handoff.md），本阶段照稿施工并保留页面态/行级态语义。

**具体技术实现**

- [ ] **T4.0 设计资产接入与视觉基线就位**：① 复制 `docs/design/tokens.css` → `src/renderer/src/styles/tokens.css`（唯一 tokens 源，后续只在此演进）；② 复制 `docs/design/mockups/assets/lucide/` 全部 47 个 SVG → `src/renderer/src/assets/icons/lucide/`（原样，不改名不筛选）；③ 实现 `Icon` 组件（`<img class="library-icon">` 本地加载，入参=图标名+尺寸档+token 语义，映射查 docs/design/icons.md）；④ 通读 `docs/design/notes.md` 的实施交接提醒（§8：先 tokens，再 Shell/TrackList/Cover/PlayerBar/QueuePanel/StateEmpty，最后页面接 IPC）。→ 验证：任一测试页用 `Icon` 渲染 5 个含色变体图标（含 `heart--accent.svg`），naturalWidth>0；无任何外部请求（Network 面板 0 外联）。
- [ ] **T4.1 骨架**：App.tsx + react-router（hash 路由）：`/songs(默认) /albums /albums/:id /artists /artists/:id /playlists /playlists/:id /liked /recent /settings /search`；Shell（Sidebar 232 + Topbar 56）视觉对照 `mockups/Songs.html` 壳层施工；PlayerBar/QueuePanel 先按 mockups 占位（Phase 5 填充）。落地页 = Songs（F3-1）。
- [ ] **T4.2 libraryStore**：zustand——列表数据 + 分页/排序参数 + `refresh()`（订阅 scan:progress done 自动刷新）。
- [ ] **T4.3 TrackList 组件**：react-virtuoso 虚拟滚动；列布局与 §3.7 一致，行视觉与六态（normal/hover/playing/missing/不可播/selected）对照 `mockups/Songs.html` 样本施工；排序点击表头（白名单 7 键，chevron 12px 特例尺寸按 icons.md）；右键菜单（菜单项四组，视觉对照 components.html 菜单区；「下一首播放/添加到队列」先空实现调 playerStore 占位函数，Phase 5 接通）。Cover 组件：`wc-cover` URL + 无封面占位（`--bg-elevated` 底 + `music-2` 图标，同 mockups）。
- [ ] **T4.4 Songs / Albums / AlbumDetail / Artists / ArtistDetail 页**：数据与交互严格按 §3.7 表；视觉逐一对照 `mockups/` 同名页面（AlbumDetail 的 Hero 渐变 = 唯一允许渐变，实现同稿）；AlbumDetail「随机播放」= 将曲目数组洗牌后 loadContext（Phase 5 接通前先挂占位）。
- [ ] **T4.5 搜索**：SearchBox（debounce 200ms，focus 320→400px 过渡对照 SearchResults.html）→ 下拉分组预览（对照 components.html 下拉区：四组各 5 条 + 查看全部）→ `/search?q=` 全结果页（对照 SearchResults.html 四段式）；结果空态文案走 i18n；handler 计时日志（≥3 与 <3 两路径都留点）。
- [ ] **T4.6 i18n 全覆盖检查**：grep 组件源码中的中文字面量，除注释外应为 0 命中（全部走 t()）。
- [ ] **T4.7 E2E `scan-and-browse.spec.ts`**：启动（fixtures 库）→ 等扫描 done → Songs 行数=7 → 排序点击标题列 → 断言首行变化 → Albums 网格出现（封面加载成功）→ 进专辑详情曲目按序 → Artists 无重复 → 搜索「夜曲」≤300ms 内出结果（Playwright 计时断言 `expect(duration).toBeLessThan(300)`，CI 波动阈值放宽至 500ms 并注明）→ 中文两字查询命中。
- [ ] **T4.8 E2E `shell-navigation.spec.ts`**：逐路由导航断言渲染无异常（控制台无 error 日志），F3-1 无死链验收。

**预期产出**：可浏览、可搜索的完整曲库界面（播放功能除外），与 mockups 视觉一致。

**验收标准**：T4.7/T4.8 全绿；`npm run typecheck` 通过；i18n 检查（T4.6）0 违例；**视觉对照走查**——11 路由逐一与 mockups 同名页并排比对，布局/层级/状态语义一致（允许 token 级像素差，记 notes.md）；图标全本地（DOM 无 inline SVG、无外联请求）；键盘 Tab 走查侧栏→主区→播放栏焦点可见（focus-visible 焦点环）；手工冒烟——滚动、排序、搜索手感无卡顿（正式性能验收在 Phase 8）。

### Phase 5｜播放器核心与队列（预计 3 天）

**关键任务**：AudioEngine、playbackService、PlayQueue 接入、播放栏、队列面板、计数口径。

**具体技术实现**

- [ ] **T5.1 PlayQueue 落地**：§3.5b 代码原样入 `player/queue.ts`（纯类无依赖）。
- [ ] **T5.2 queue 单测**（`tests/unit/player/queue.test.ts`，≥10 用例，F5 验收的自动化形态）：
  - F5-2：loadContext(10 首, startIndex=2) → order=10 首、current=第 3 首；
  - F5-5：shuffle 开启后 next() 走满一轮，序列无重复且为原集合；关闭后 order 恢复 original；
  - F5-6 六组合：off/off、off/all、off/one、on/off、on/all、on/one——逐组合断言 next 行为（含 all+on 一轮后重洗、one 下 next 不前进）；
  - F5-3：playNext 插队后播完插队曲回到原顺序（断言后续序列）；
  - 队首 previous：重启当前曲。
- [ ] **T5.3 AudioEngine + playbackService + playerStore**：AudioEngine 挂 `<audio>`，`crossOrigin` 不设、`preload='auto'`；playbackService 按 §3.5c 时序实现 loadTrack/recordPlay/updateOutcome/seek/setVolume（音量持久化 debounce 500ms 调 settings:set）/toggleMute；playerStore 暴露 F4-2 状态集（currentTrack/duration/position(250ms 节流)/playing/volume/muted/playMode），position 更新用 `timeupdate` 事件节流，避免重渲染风暴。
- [ ] **T5.4 播放栏**（F4-3 全要素，视觉对照 components.html PlayerBar 区）：封面+标题+艺术家（点击标题跳专辑详情）、收藏按钮、上一首/播放暂停/下一首（播放暂停=32px 白圆反色按钮，`pause--on-accent.svg`/`play--on-accent.svg` 变体）、Shuffle 开关、Repeat 三态循环点击、进度条可拖动 seek（4px 槽 hover 增至 6px，已播填充用 `--text-secondary` 不用主色）、音量条+静音、队列按钮；播放中行均衡器动画（唯一持续动画）。全部控件 disabled 态可用（空队列时）。
- [ ] **T5.5 队列面板**：320px 右侧滑入（250ms transform，对照 components.html QueuePanel 区）；「正在播放 / 下一首播放（插队，`corner-down-right` 标识）/ 下次播放」三段结构同稿；0.1 只读（拖拽重排/删除属 F5-4 禁区，不渲染任何编辑 affordance）。
- [ ] **T5.6 接通 T4.3/T4.4 占位**：TrackList 双击 = 所在页上下文整队（页面把当前视图的 TrackRow[] 与行号传 playerStore.playContext）；右键菜单「下一首播放/添加到队列」接 queue.playNext/enqueue；AlbumDetail 播放/随机播放按钮接通；不可播曲目双击 toast「M0.1 暂不支持此格式播放」。
- [ ] **T5.7 E2E `playback-queue.spec.ts`**：fixtures 库 → 专辑页双击第 2 首 → 队列面板出现整专辑且高亮第 2 首 → `audio` 元素 playing → 进度推进 → 手动 next → 插队一首 → 断言下一首为插队曲 → Shuffle 点击后队列顺序变化且当前曲不变 → Repeat 三态切换 UI 正确 → 单曲内 pause/seek 后 playCount 不变（查 `library:getTrack` 断言 playCount=1，再加载一次 =2）。

**预期产出**：完整可听、可队列操控的播放体验 + 计数/历史写入。

**验收标准**：T5.2 全绿（≥10 用例）+ T5.7 全绿；播放栏/队列面板与 components.html 并排对照一致；键盘走查：播放控制与队列开闭全键盘可达、关闭 QueuePanel 后焦点回落到触发按钮；人工听感冒烟（切歌起音 ≤500ms 手感）；`npm run typecheck` 通过。

### Phase 6｜收藏、歌单、最近播放（预计 2 天）

**关键任务**：收藏闭环、歌单 CRUD+拖拽+拼贴、最近播放页。视觉基线 = Liked.html / Playlists.html / PlaylistDetail.html / Recent.html。

**具体技术实现**

- [ ] **T6.1 收藏**：TrackList ♡/♥（`heart.svg`/`heart--accent.svg` 变体切换）、播放栏收藏按钮、Liked 页（绿色低透明渐变 Hero + `arrow-up-down` 排序下拉，5 键白名单，对照 Liked.html）；三处状态全局同步（同一 zustand 切片）。
- [ ] **T6.2 歌单 CRUD**：Playlists 页（网格 + CollageCover + 虚线「新建歌单」卡 + 内联命名输入，对照 Playlists.html）；PlaylistDetail（双击标题内联重命名 `pencil`、删除=行内确认条（`--danger` 文字，3s 无操作收回）、添加曲目右键子菜单、移除曲目；对照 PlaylistDetail.html）。
- [ ] **T6.3 拖拽重排**：PlaylistDetail 曲目表 HTML5 DnD（`grip-vertical` 手柄；dragstart 行 60% 透明、dragover 目标行上缘 2px `--accent` 插入线——mockup 已给视觉样本，本任务实现交互）→ 全量 `playlists:reorder`（repo 层事务重写，见 T1.4）。
- [ ] **T6.4 CollageCover**：canvas 2×2 绘制前 4 首封面（不足 4 用占位色块）导出 dataURL，仅列表展示用（不落库，D-1）。
- [ ] **T6.5 最近播放页**：`history:listRecent`；显示时间相对格式（i18n 内做 `formatRelative`）。
- [ ] **T6.6 E2E `favorites-playlists.spec.ts`**：收藏一首（列表行）→ 播放栏同步为 ♥ → Liked 页出现且排序正确 → 取消同步；新建歌单 → 右键添加 3 首 → 拖拽第 1 首到第 3 位 → 重启应用（重新 launch 同一 WC_USER_DATA）顺序持久（F6-3）→ 删除歌单；播放两首（一首播两次）→ Recent 去重且只占一行、时间为最新（F7-2）。

**预期产出**：收藏/歌单/历史三块完整闭环。

**验收标准**：T6.6 全绿；200 首歌单拖拽排序持久化按 §6 手工脚本 M4 验收（e2e 用小样本）。

### Phase 7｜设置页与 Library 管理（预计 1.5 天）

**关键任务**：四分区设置页、目录管理闭环、启动扫描开关、全量重扫、About。视觉基线 = mockups/Settings.html（开关 / 扫描进度 / 行内删除确认 / 已知限制四类控制态）。

**具体技术实现**

- [ ] **T7.1 Settings 页骨架**（F8-1）：分区锚点导航：General / Library / Playback / About；修改即时生效 + 持久化（settings:set 后确认回读）；控件（40×22 开关、`--bg-input` 进度槽）对照 Settings.html 施工。
- [ ] **T7.2 General**：语言选择（当前仅 zh-CN，下拉含占位提示「English · 0.5 提供」）；说明文案引 §8 已知限制。
- [ ] **T7.3 Library**（F8-2 / F1-1 / F1-5）：目录列表（`folder` 图标 + 真实 Windows 路径写法 + 启用开关 + `trash-2` 删除）；删除 = 行内确认条（对照 Settings.html 样本，禁系统弹窗）；添加按钮 → `library:addFolder`（无 path 参数走系统对话框）；「启动时自动扫描」开关绑定 settings.autoScanOnStartup；「全量重扫」（`refresh-cw`）触发 `library:rescanAll` + 扫描进度条（订阅 scan:progress，显示 done/total 与阶段文案，同 Settings.html 进度样本）。
- [ ] **T7.4 Playback**：音量默认值回显（实际音量控制在播放栏，此处只做说明与默认值）；留待 0.5 的 Metadata/Cache 分区不渲染占位（YAGNI，仅 About 里声明规划）。
- [ ] **T7.5 About**：版本号（读 package.json version）、已知限制八条（需求 §8 逐条对应文案，走 i18n）、技术栈致谢（Electron/Chromium/SQLite/music-metadata/sharp/React）。
- [ ] **T7.6 E2E `settings-folders.spec.ts`**：添加目录（直传 path）→ 重启仍在（F1-1 前半）→ 禁用 → rescanAll → 断言该目录文件 status=missing 或未被新扫（以 last_scan_at/解析计数佐证）→ 重新启用 → 恢复（F1-1 后半）；关掉 autoScanOnStartup → 重启不产生扫描事件。

**预期产出**：设置页完整，目录管理满足 F1-1 全部验收。

**验收标准**：T7.6 全绿；设置修改后重启全部保持（人工复核一遍）。

### Phase 8｜打包、性能验收与发布收尾（预计 1.5 天）

**关键任务**：图标、electron-builder 产物、七项性能指标实测、README/已知限制、最终人工验收。

**具体技术实现**

- [ ] **T8.1 图标与绿色产物**：`resources/icon.ico`（多尺寸 16/32/48/256，可用 ImageGen 或手工绘制后转换）；electron-builder.yml 按 §3.8 定稿；根目录运行 `build.bat` → 产出 `build\` 绿色目录（`Windy Concert.exe` + 依赖）；双击 `build\Windy Concert.exe` 冒烟（窗口起、扫描/播放可用）；`build.bat zip` 生成 `Windy-Concert-0.1.0-win64.zip`。
- [ ] **T8.2 性能实测**（`scripts/gen-sample-library.mjs --count 30000`，磁盘预留 ≥2GB，测完删除）：按 §6.2 表逐项测量并记录结果到 `docs/perf-0.1.md`（新建，允许）：首扫（scan.log elapsedMs）、启动增量（二次启动 scan.log）、启动到可交互（手工秒表×3 取中位，从双击图标到 Songs 列表可滚动）、搜索（控制台打点×10 取中位，含中文 2 字与英文）、内存（任务管理器空库）、切歌起音（手工×10 取中位）、发布 zip 体积（build.bat zip 后看文件属性）。任一不达标 → 停止，走 §7 对应条目，不得带病发布。
- [ ] **T8.3 3 万库滚动验收**：Songs 列表快速滚动、Albums 网格快速滚动，无可感知卡顿（封面 64/256 档加载策略生效）。
- [ ] **T8.4 E2E 全量回归 + 设计合规终检**：`npm run test:e2e` 五个 spec 全绿（对 build 产物路径执行）；按 design-handoff.md 验证清单执行设计合规终检：125% / 150% Windows 缩放截图不破版、键盘焦点全路径（队列/菜单/内联确认）、全页面控制台 0 error、DOM 无 inline SVG 与外联请求（图标策略复核）。
- [ ] **T8.5 文档收尾**：README.md 定稿（简介、平台要求、zip 发布物说明、已知限制八条、开发命令含 build.bat / start.bat、目录结构说明）；About 页核对与 README 一致。
- [ ] **T8.6 最终人工验收**：按 §6.3 脚本 M1~M8 逐条执行，结果记入 `docs/perf-0.1.md` 附表；全部通过后 git tag `v0.1.0` 并推送。

**预期产出**：可对外发布的 0.1.0 `build\` 绿色目录与发布 zip + 完整验收记录。

**验收标准**：§6 全部条目通过；`build\Windy Concert.exe` 双击可直接运行；`git log` 干净、`v0.1.0` tag 存在。

---

## 6. 最终验收标准（M0.1 发布门槛）

### 6.1 功能验收（每条注明自动化载体）

| 需求 | 验收标准（摘自终稿） | 载体 |
|---|---|---|
| **视觉一致性（V1.2 新增）** | 11 页与 docs/design/mockups/ 对照一致；状态矩阵语义完整；图标策略合规（无 CDN/hydration/inline SVG）；全 token 化无硬编码 | Phase 4~7 各阶段对照走查 + T8.4 终检 |
|---|---|---|
| F1-1 | 添加 D:\Music 重启仍在；禁用目录不再扫描 | e2e settings-folders |
| F1-2 | 5 层嵌套全部入库 | 单测 |
| F1-3 | 原生集可播；WMA 入库且 UI 标记不可播原因（V1.4 原 APE） | 单测 + e2e scan-and-browse |
| F1-4 | 二次扫描不重解析未变文件（解析计数=0） | 单测 |
| F1-5 | 启动增量 ≤10s（3 万库）；新增文件下次启动入库 | scan.log + 人工 M2 |
| F1-6 | 拔盘显示 missing 不消失；重连恢复 | 单测 + 人工 M5 |
| F1-7 | 损坏+占用文件不中断扫描 | 单测 |
| F2-1 | 三格式全字段正确入库 | 单测 |
| F2-2 | 内嵌 > 文件夹封面优先 | 单测（封面来源断言） |
| F2-3 | 无标签显示文件名（去扩展名） | 单测 + e2e |
| F2-4 | 仅 cover.jpg 专辑正常显示封面 | 单测 + e2e |
| F2-5 | 3 万库滚动无卡顿 | 人工 M6 |
| F2-6 | 每条 Metadata 可查出来源 | 单测（provenance 断言） |
| F3-1 | 全路由可达无死链 | e2e shell-navigation |
| F3-2 | 虚拟滚动流畅；7 排序键可用 | e2e + 人工 M6 |
| F3-3 | 网格按封面缓存加载 | e2e |
| F3-4 | 艺术家聚合无重复 | e2e |
| F3-5 | 播放按钮整轨入队 | e2e playback-queue |
| F3-6 | 主艺人聚合口径数据准确 | e2e |
| F3-7 | 中英文 ≤300ms | e2e 计时 + T8.2 复测 |
| F4-1/2 | 全部播放 API/状态经播放栏与队列可验证 | e2e playback-queue |
| F4-3 | 播放栏图例全可用、拖动即时响应 | e2e + 人工 M3 |
| F4-4 | 系统切默认输出后新播放走新设备 | 人工 M7 |
| F5-1 | 队列/歌单数据层与 UI 严格分离 | 架构审查（§4.3） |
| F5-2 | 专辑页双击第 3 首 → 整队且从第 3 首播 | e2e playback-queue |
| F5-3 | 插队播完回原序；尾插；面板查看 | e2e |
| F5-5 | Shuffle 一轮无重复；关闭复原序 | 单测 queue |
| F5-6 | 6 组合行为正确 | 单测 queue |
| F6-1 | 收藏状态三处同步 | e2e favorites-playlists |
| F6-2 | 布尔字段方案无多余表 | DDL 审查 |
| F6-3 | 歌单 CRUD + 拖拽持久化 | e2e + 人工 M4（200 首） |
| F7-1 | 暂停 10 次 playCount 仅 +1 | e2e |
| F7-2 | 重复播放只占一行 | e2e |
| F7-3 | 历史可查任意一天记录 | 单测 historyRepo |
| F8-1/2 | 设置即时生效持久化；目录管理 | e2e settings-folders |
| 5.5 | i18n 架构 + 中文资源运行时读取 | T4.6 检查 + 代码审查 |
| 5.4 | Hi-Res 指标正确展示 | e2e（24/96 样本列值断言） |

### 6.2 性能验收（全部记录进 docs/perf-0.1.md）

| 指标 | 目标 | 方法 |
|---|---|---|
| 首次全量扫描 | ≤5 分钟 / 3 万首 | scan.log elapsedMs |
| 启动到可交互 | ≤3 秒 | 人工秒表×3 取中位 |
| 启动增量扫描 | ≤10 秒 | scan.log |
| 搜索出结果 | ≤300ms | handler 打点×10 取中位 |
| 空库内存 | ≤500MB | 任务管理器 |
| 切歌起音 | ≤500ms | 人工×10 取中位 |
| 发布 zip 体积 | ≤200MB（build\ 目录压缩后） | 文件属性 |

### 6.3 人工验收脚本（发布前由产品负责人执行）

- **M1 全功能走查**（S1 场景）：添加真实个人目录 → 封面墙/艺术家/搜索/双击即播全流程。
- **M2 增量**：运行中另存一个新文件入目录 → 重启 → 自动入库。
- **M3 播放栏**：进度拖动、音量、静音、Repeat×Shuffle 六组合手测。
- **M4 歌单 200 首**：拖拽排序 → 重启持久化。
- **M5 移动硬盘**：拔盘（或改目录名模拟）→ missing 展示 → 接回恢复。
- **M6 3 万库滚动**：Songs/Albums 快速滚动观察。
- **M7 输出设备**：系统默认设备切换后新播放走新设备。
- **M8 绿色包**：`build.bat zip` → 将 zip 拷到另一目录解压 → 双击 exe 完整功能冒烟（扫描、播放、搜索）；确认无残留服务/开机项，删除目录即完成卸载。

---

## 7. 风险与应对

| # | 风险 | 触发信号 | 应对 |
|---|---|---|---|
| R1 | music-metadata 单 worker 解析速率不足 3 万/5 分钟 | Phase 2 预检 >5 分钟 | 升级为 worker 池（4 线程分片文件清单），接口已隔离在 scanner.worker 内，主流程零改动 |
| R2 | trigram FTS 对 <3 字查询不可用 | 已知行为 | 已内置 LIKE 回退（D-2），单测覆盖两路径 |
| R3 | better-sqlite3/sharp 原生模块与 Electron ABI 不匹配 | postinstall/rebuild 失败 | `npx @electron/rebuild`；sharp 改用 prebuilt binary；仍失败则 sharp 降级 jimp 并在执行备注记录性能代价 |
| R4 | VBR MP3 duration 不准（header 估算） | 样本对比偏差 >2s | 对 mp3 采样 `parseFile(path, {duration:true})`（全文件扫描，慢）；按格式白名单启用，不动其他格式 |
| R5 | 移动 + 内容修改的文件被判为新曲目（旧记录永久 missing） | 单测边界确认 | 已知接受（策略 1 的启发式边界），记入执行备注与 README 已知限制，不额外处理 |
| R6 | cover.worker 大库封面生成缓慢 | 3 万库封面队列 >10 分钟 | 封面异步不阻塞扫描与播放；仅网格渐进显示，验收 F2-4/F2-5 不受影响；必要时 512 档懒生成 |
| R7 | Playwright 计时断言在 CI 波动 | e2e 偶发红 | 阈值放宽至 500ms 并以 Phase 8 打点为准（已写入 T4.7） |
| R8 | 打包后 i18n/协议路径失效（dev 正常、prod 404） | build\ 绿色包冒烟 | 路径解析已按 app.isPackaged 分流（§3.8）；e2e 补一个对 build 产物的 launch 冒烟（T8.4） |
| R9 | 3 万首写入期间 UI 卡顿 | 人工感知 | 批量事务 ≤500 行/批 + WAL；仍卡则把写库也移入 scanner worker 独立连接 |
| R10 | 环境变量陷阱复发（ELECTRON_RUN_AS_NODE） | dev/e2e 莫名以 Node 模式启动 | dev.mjs + e2e env 剔除双保险（§3.9）；症状特征已记录 |
| R11 | mockup.css 被整体拷贝成全局样式，选择器泄漏 + 组件化债务 | 多组件样式互相干扰、改 tokens 不生效 | §3.7 演进约定 + §4.3-8：样式按组件拆分、全 token 化引用；T4.0 明确移植方式 |
| R12 | UI 非最终版，后期调整引发大改 | 用户提出视觉修订 | tokens.css 单源 + 组件全 token 化引用（§3.7 演进约定），调整成本锁定在 tokens 层；偏离一律先记 notes.md |

---

## 附录 A. M0.1 需求 → 任务映射核对表

| 需求 | 任务 | | 需求 | 任务 |
|---|---|---|---|---|
| F1-1 | T1.4/T3.1/T7.3 | | F3-3 | T4.4 |
| F1-2 | T2.2/T2.6 | | F3-4 | T4.4 |
| F1-3 | T2.1/T2.2/T4.3 | | F3-5 | T4.4/T5.6 |
| F1-4 | T2.3/T2.6 | | F3-6 | T4.4 |
| F1-5 | T2.3/T7.3 | | F3-7 | T1.6/T4.5 |
| F1-6 | T2.3/T2.6/T4.3 | | F4-1~2 | T5.3/T5.4 |
| F1-7 | T2.2/T2.6 | | F4-3 | T5.4 |
| F2-1 | T2.2/T2.6 | | F4-4 | T5.3（跟随系统=默认行为）+人工 M7 |
| F2-2 | T2.4/T2.6 | | F5-1 | T5.1/§4.3 |
| F2-3 | T2.2/T2.6 | | F5-2 | T5.1/T5.6 |
| F2-4 | T2.4/T2.6 | | F5-3 | T5.1/T5.5/T5.6 |
| F2-5 | T2.4/T8.3 | | F5-5/6 | T5.1/T5.2 |
| F2-6 | T2.5/T2.6 | | F6-1 | T1.2/T6.1 |
| F3-1 | T4.1/T4.8 | | F6-2 | §3.4 DDL |
| F3-2 | T4.3/T4.7 | | F6-3 | T1.4/T6.2~T6.4 |
| F7-1 | T5.3/T5.7 | | F8-1 | T7.1 |
| F7-2 | T1.4/T6.5 | | F8-2 | T7.3 |
| F7-3 | T1.4/T2.3 | | i18n(5.5) | T3.5/T4.6 |
| 数据模型 | T1.1 | | Hi-Res(5.4) | T2.1~T2.2/T4.3 |
| 性能(5.1) | T2.3 打点/T8.2 | | 已知限制(§8) | T7.5/T8.5 |

无未映射条目；反向核对：本计划无任何任务对应 §1.3 范围外需求。

## 附录 B. 样本库生成脚本（scripts/gen-sample-library.mjs 要点）

```js
// 用法: node scripts/gen-sample-library.mjs --count 30000 --out D:/PerfLib
// 结构: 混合 3 层嵌套目录；文件名 Track-{i}.mp3 / {i}.flac 交替；
// 每 50 首复制一份带标签 fixture（tests/fixtures/music/01-夜曲.mp3）测解析路径，
// 其余复制静音 fixture（无标签）测回退路径；执行前检查目标磁盘剩余空间 >2GB。
// 目录分布: out/艺术家{a..j}/专辑{n}/文件 —— 保证 Albums/Artists 聚合有真实数据量。
```

（脚本本体随 T2.7 实现，行为以上注释为验收契约。）
