# Windy Concert · M0.1 项目建立实施计划（setting-up-plan）

> **执行者须知（For agentic workers）**：本计划使用 checkbox（`- [ ]`）跟踪进度，逐任务推进。完成一步立即勾选并按「提交纪律」提交一次。执行期间只允许两类改动：勾选状态变更、在对应步骤下追加执行备注（格式：`> 执行备注(YYYY-MM-DD): …`）。禁止执行期间改写计划正文、范围与验收标准——发现计划错误时先停下，在会话中提出修订再继续。推荐执行方式：subagent-driven-development（每任务派发独立子代理、任务间两阶段审查）或 executing-plans（本会话内分批执行 + 检查点）。

| 项 | 内容 |
|---|---|
| 计划版本 | V1.7 |
| 日期 | 2026-09-10 |
| 修订记录 | V1.0 初版；V1.1 发布形态改 build\ 绿色目录 + zip（build.bat / start.bat，NSIS 后置）；V1.2 设计案已交付验收（docs/design-handoff.md），renderer 实施基线锁定为 docs/design/tokens.css + mockups/，Phase 4~7 任务挂接设计稿，图标策略改为本地 vendored lucide-static@1.43.0；V1.3（2026-09-10，grill 会话三项裁定 + 工作流约定）：① §4.2 AGENTS.md 只读边界按该文件自身声明校正（# Project Info 以上固定只读，其下 windy-concert 区按阶段收尾约定更新）；② T1.6 trigram 措辞按实测行为修正（trigram 下限 3 字符，<3 由 §3.5d LIKE 回退兜底）；③ Phase 2 开工清单升格正文：T1.2 findByFileIdentity 改返回 TrackRow[]（唯一命中才 adopt，0 或 ≥2 按 create）、listSongs 追加 tracks.id 次级排序键、T1.4 listRecent 改 MAX(id)（原 MAX(played_at) 秒级同曲同秒会并列出重复行）；④ §5 提交纪律补阶段提交门控（状态更新后暂不提交，待用户提议代码审查完毕后统一提交）；V1.4（2026-09-10）：T2.1 fixture #6 由 06-Track06.ape 改为 06-Track06.wma——实测 ffmpeg 9.0 无 ape 编码器/封装器无法产出合法 .ape，wma 同属 SCANNABLE 不可播集（CONTEXT.md 不可播定义点名 WMA），F1-3 语义等价；V1.5（2026-09-10，用户裁定）：§3.5a 阶段 B 内部顺序重排——markMissing 反向标记前置到分类之前（原序为分类后标记），使「单次重扫的文件移动」可被 adopt 命中保留 UUID（播放计数/收藏不丢）；复制场景（新旧路径并存）旧行不标 missing 仍走 create，无振荡；§3.5a 其余行为不变，T2.6 补单次移动与复制不挤占两用例；V1.6（2026-09-10，用户裁定，Phase 2 第三方评审 I-1）：调和 §3.5e 与 F2-2 的矛盾——封面来源优先级 embedded > folder 强制生效（coverService 状态机支持同专辑混源时 embedded 后到替换重跑，旧 coverId 行与目录保留），§3.5e 管线描述同步补注，coverService.test 补混源两用例；V1.7（2026-09-10，Phase 3 第三方评审）：① §5 Phase 3 验收文案澄清——addFolder 不自动扫描，调用方须显式 library:scan（Phase 4/7 UI 接线注意）；② T3.1 执行备注 channel 计数勘误（§3.6 实为 28 invoke + 2 event = 30 条，原备注「31/29」计数有误） |
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

**（e）封面管线（F2-2/F2-4/F2-5）**：封面来源判定顺序 = 内嵌 picture（type=front 优先，无则第一张）→ 同目录候选 `cover.jpg → cover.png → folder.jpg → folder.png → front.jpg → album.jpg`。同专辑首个带封面的曲目胜出（内存 Map 按 albumId 去重）——**V1.6 调和：同专辑混源时 embedded 后到替换重跑（embedded > folder 强制优先，F2-2 语义）；旧 coverId 行与目录保留不删**。sharp 生成 64/256/512 三档 JPEG（quality 85，`fit:'inside'`）写入 `userData/covers/{coverId}/`。渲染层 URL：`wc-cover://{coverId}?s=256`，handler 校验 coverId 为 UUID 格式后 `net.fetch(pathToFileURL(...))` 返回流。

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

- [x] **T2.1 formats.ts 与 fixtures**：PLAYABLE=`{mp3, flac, wav, ogg, opus, m4a}`、SCANNABLE=PLAYABLE∪`{ape, wma, aiff, aif, dsf, dff, wv, tta, ac3, mka}`。`tests/fixtures/music/` 一次性制作并提交（每个 <100KB，固定为以下 8 个文件，后续 e2e 断言以「入库 7 条」为准——损坏文件按 F1-7 跳过不入库）：
  > 执行备注(2026-09-10): formats.ts 两 ReadonlySet 共 16 项；fixtures 8 件 ffmpeg 制作（均 ≤56K）；自证通过——01/02/03 标签+内嵌封面、05 96kHz/24bit（pcm_s24le 中转）、04/07 零用户标签、06 wma 可解析、08 损坏。**关键实测**：music-metadata 11.15.0 对截断 mp3 容错不抛错（0 字节也返回空元数据），08 定型为 70 字节 ID3-only（parseFile 返回 hasAudio:false）——**T2.2/T2.3 的 F1-7 跳过判据必须为「parseFile 抛错 OR !hasAudio/无 duration」**。质量审查发现 04/07 双零标签将经「未知专辑」跨目录归组使 07 的 folder 封面用途落空，经用户批准 07 重制补 album=测试专辑二/album_artist=测试艺人 最小标签，并补完计划正文三处 ape→wma 替换（commit c4a3b47）；质量审查同时留痕：electron-builder files 建议后续补 !tests/**（T8.1）。
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
- [x] **T2.2 scanner.worker.ts**：实现 §3.5a 阶段 A 的 walker（`fs.promises.readdir` 递归、stat 并发批 64、目录/单文件失败仅记日志跳过——F1-7）与阶段 C 的解析（music-metadata `parseFile`，字段映射：`common.title ?? 文件名去扩展名`（F2-3）、`common.artists?.[0] ?? common.artist ?? common.albumartist` → artist_string 原样保留、`common.albumartist ?? artist_string ?? '未知艺术家'` → albumArtist、`common.album ?? '未知专辑'`、format/bitrate(`format.bitrate/1000`)/sampleRate(`format.sampleRate`)/bitDepth(`format.bitsPerSample`)/duration/channels、picture 取出待 cover 队列）。消息协议：`{type:'stat', files}` → 主进程分类回发 `{type:'parse', files}` → worker 分批 `{type:'batch', parsed, done}`。**worker 内禁止 import 数据库**。
  > 执行备注(2026-09-10): 协议留痕补全——入口消息 {type:'stat', dirs}、batch/done 携带 skipped 数组、独立 done 消息、V1.3 落地后新增 error 形态（顶层 try/catch 兜底 + 未知消息回执）；parsed 预埋 tags 在场标记（T2.5 provenance 输入）；F1-7 跳过判据三分支（抛错 OR !hasAudio OR 无 duration，T2.1 实测）；walker 路径去重（lowercase 键，重叠目录防重）。构建接线：electron.vite.config.ts main 块 rollupOptions.input 附加入口（T2.3 改 ?nodeWorker 后须删除该条目防双份打包）。冒烟实证：fixtures stat=8 → parsed=7、skipped 含 08-broken；字段映射抽验 01 全 tags/04 全回退。质量审查 NEEDS_FIXES（错误兜底+路径去重两 Important）→ 修复复审通过（commit 0161626），复审残留一行断言收敛主会话修正（a1b61e2）。picture 批字节量级留痕至 M5（PARSE_BATCH 200，备选降 100/同 album 置空）。
- [x] **T2.3 scanService.ts**：实现 §3.5a 全部五阶段；adopt 匹配需 `findByFileIdentity` 结果唯一（0 或 ≥2 命中均按 create 处理，歧义宁可新建）；启动时若 `settings.autoScanOnStartup` 且存在启用目录则后台触发增量扫描（不阻塞窗口显示）；`scan:progress` 事件；扫描日志含 summary（total/parsed/skipped/adopted/missingMarked/elapsedMs）写 `userData/logs/scan.log`。
  > 执行备注(2026-09-10): createScanService(deps) 注入面七项（db/getFolders/workerFactory?/onProgress?/onCoverJob?/logDir?/now?）——workerFactory 为 T2.6 可测性接缝（伪 worker 同协议回放）；repo 扩展：trackRepo.listIdentityAll 新增、updateFileIdentity 扩签 {filePath?,fileSize?,fileMtime?}、TrackParseUpdate 白名单补 artistId/albumId；startupScan(bool) 已暴露，index.ts 实际接线留待 T3（settings store 未建，留痕）；electron.vite.config.ts 已删 scanner.worker input 条目（?nodeWorker 由 scanService 引入），vitest.config.ts 加 stub alias。**评审发现并修复三问题**（commit 11dd703，复审 APPROVED）：C1 missing 行同路径回归永不复活（破 F1-6「文件恢复→available」——§3.5a unchanged 分支未提 status 复活属计划与 T2.6/M5 的潜伏矛盾，按 F1-6 语义补齐 reviveIds 双分支复活，留痕评审裁定）；I1 批事务异常吞噬致主进程 uncaughtException/Promise 卡死（try/catch→detachParse+reject）；M1 adopt 两写事务原子化。另：worker ParsedTrack 补 7 字段映射（trackNumber/discNumber/year/genre/composer/comment/codec——T2.2 任务文字段清单未列而 T2.6 F2-1 全字段断言必需，API 实态 comment=IComment[].text、字段名 disk 非 disc，commit 4bd147b）。测试 67 条全绿。
- [x] **T2.4 coverService + cover.worker**：接收 `{coverId 来源: embedded bytes | folderPath}` 队列；按 albumId 去重（内存 Map，首个成功者胜出——F2-4 同专辑复用）；folder 候选按 §3.5e 顺序探测；sharp 三档输出；`covers:ready` 事件；coverRepo 落库。**封面生成异步于扫描主流程**，扫描 done 不等待封面完成。
  > 执行备注(2026-09-10): cover.worker（?nodeWorker 接线，vitest stub alias 扩展）——§3.5e 六候选顺序逐字、三档 64/256/512 JPEG quality85 fit:inside、单实例 sharp clone、失败回执不抛死、顶层兜底、零 db/electron；coverService——albumId 状态机（succeeded 丢弃/failed 排队重试，首个成功者胜出）、串行队列 enqueue 立即返回、成功路径 coverId 预生成→worker 写三档→insertCover({id})→setAlbumCover→onCoverReady；coverRepo 扩签 CoverInsert.id?（预生成 id 与目录名原子一致，randomUUID 回退）；scanService 零改动——wireCoverPipeline(deps: Pick<ScanServiceDeps,'onCoverJob'>) 辅助供 T3 组装。质量审查三 Important（部分失败残留清理/测试⑤重建路径/coversDropped 观测断层）→ 修复（d944177）+ 复审残留（wireCoverPipeline 签名收窄，主会话修正 4db10f2）闭环。T3 留痕：scan.log 的 coversDropped 汇合口径（scanService 侧 + coverService.droppedCount）由 T3 决定。sharp 实测单图 4 次解码已优化为 clone 三档。73 tests 全绿。
- [x] **T2.5 provenance 写入**：解析时组装 `{title:'embedded'|'filename', artist:'embedded', ...}`；folder 封面对应 `cover:'folder'`；存入 tracks.meta_provenance（F2-6）。
  > 执行备注(2026-09-10): buildProvenance 五键固定（title: embedded|filename；artist/album/albumArtist: embedded|default；cover: embedded|folder 按 picture 有无——source 尝试即记录，成功与否属 T2.4 运行时），JSON.stringify 紧凑形态；create TrackInsert 与 changed updateAfterParse 双路透传（重解析即刷新）。3 用例（全 embedded/零标签 folder+default/changed 刷新）。质量审查 APPROVED，两注释级 Minor 顺手落掉（0001_init 值域注释补全、toBe 存储契约注释，commit 5ae4523）。76 tests 全绿。
- [x] **T2.6 扫描单测**（`tests/unit/library/*.test.ts`，临时目录 + `:memory:` 库直接驱动 service）：
  - F1-2：5 层嵌套目录全部入库；
  - F1-4：二次扫描解析计数器=0（service 暴露 parseCount 供断言）；
  - 策略 1：改名/移动目录后重扫，Track id 不变（UUID 断言）；
  - F1-6：删除文件重扫 → status=missing；文件恢复 → available（走 adopt）；
  - F1-7：损坏文件与被占用文件（测试内以独占句柄模拟）不中断扫描；
  - F1-3：WMA 入库且 playable=0（V1.4 原 APE）；
  - F2-1：三格式 fixture 全字段断言（含 cover bytes 存在）；
  - F2-3：无标签文件 title=文件名去扩展名；
  - F2-4：仅 cover.jpg 目录的专辑获得 folder 来源封面。
  > 执行备注(2026-09-10): tests/unit/library/scan.e2e.test.ts 13 用例（真集成：RealLogicWorkerAdapter 注入 workerFactory 直驱真 walkFiles/parseFiles + 真 music-metadata + 真 sharp + wireCoverPipeline；scanner.worker 做最小导出重构 walkFiles/parseFiles 纯函数化，入口行为零变化）。九场景全绿 + 两用例强化：策略 1 正向（移出→missing→移入→adopt 三步流）+ 反向（改名失配→新 UUID+旧行 missing）。**计划语义缺口（用户裁定 V1.5）**：adopt 仅匹配 missing 行 + missing 标记在分类后 ⇒ 单次重扫的移动生成新 UUID 丢播放计数——markMissing 前置修复（commit 91b7a9f，复制场景无振荡实证），T2.6 补「单次移动保 id」「复制不挤占」两用例。F1-7 如实留痕：b) 目录冒充音频文件被 walk isDirectory 分支拦截（真实链路不可达 EISDIR），等效失败在 parseFiles 纯函数层复现；c) Node/libuv 无法造真独占句柄（FILE_SHARE默认全开），以 a/b 两条覆盖容错语义。F2-1 断言含 meta_provenance 全 embedded 与封面三档真实生成。**测试环境**：vitest.config.ts 顶部禁用 safe-delete shim（>50 项批量删除保护致清理 ENOTEMPTY 假失败，commit 随 91b7a9f 系列），vitest #10692 需大写盘符 cwd。89 tests 全绿（13 文件）。
  > 执行备注(2026-09-10): **Phase 2 验收（§6.2-P2 预检）**——30k 样本库（gen-sample-library 生成 30000 文件/839.78MB/14.32s）首扫计时 **39.5s（elapsedMs=39548，≤5min 达标）**，parsed=30000/skipped=0，scan.log 已记录（证据为运行时 console 行 [PERF30K] 与 scan.log 断言，临时计时测试与样本库验收后删除）；封面异步未计入扫描计时（T2.4 语义）。冒烟 = T2.6 真集成用例（service 直驱 fixtures 目录，summary 正确）。临时 perf 测试文件未入库。
- [x] **T2.7 样本库生成脚本**：`scripts/gen-sample-library.mjs`（附录 B），支持 `--count 30000 --out <dir>`。
  > 执行备注(2026-09-10): 附录 B 契约逐条落地（10 艺术家均分+余数摊派、每艺术家 min(5,tracks) 专辑、全局 i 奇偶交替命名、i%50===1 标签版——flac 槽标签分支为计数方案固有死分支已注释留痕、statfsSync 磁盘检查 max(2GB, 均摊×1.1)、非空拒绝+--force、总数自校验）；同步复制 copyFileSync 非 await 串行（30k 量级 10-30s SSD）。自证：count=300/60/30/51 四轮字节核算逐一吻合、50 阈值边界实证、非空拒绝与 --force 实证。质量审查 APPROVED（Minor：dirCount 漏计艺术家目录、复制失败无半成品提示——体验级留档）。附录 B 适配点四处留痕（07 路径 album2/ 子目录、07 最小标签口径、flac 槽标签版、专辑数自定）。

**预期产出**：完整「目录 → 入库 → 封面就绪」管道 + 30k 性能样本能力。

**验收标准**：T2.6 全绿；手工冒烟——`npm run dev` 向设置页（临时用 e2e 钩子或 T3 完成后走 UI）指向 fixtures 目录，扫描日志 summary 正确；3 万库首扫计时 ≤5 分钟（计时记录进 scan.log，此为 §6.2-P2 的预检，不达标立即触发 §7-R1 应对，不得拖到 Phase 8）。

### Phase 3｜IPC 契约、Preload 桥、设置与 i18n 运行时（预计 1.5 天）

**关键任务**：打通 §3.6 全部 channel、两个自定义协议、settings.json、运行时语言资源。

**具体技术实现**

- [x] **T3.1 channels + handlers**：`src/main/ipc/channels.ts` 常量与类型；`index.ts` 逐条 `ipcMain.handle`，参数校验（id 存在性、枚举值）后转发对应 service/repo；`webContents.send` 封装 scan:progress / covers:ready。
  > 执行备注(2026-09-10): channels.ts 实现全量 31 条 channel（§3.6 表 invoke 29 + event 2，playlists 展开为 8 条、settings 2 条）+ IpcPayloads/IpcReturns 逐条映射；ipc/index.ts registerIpcHandlers(deps)——handleRegistrar 可注入（默认 ipcMain.handle，测试内存 registrar 直呼），参数校验后转发；**搜索数据层随本任务新增**（T2 未含：trackRepo.search ≥3 FTS MATCH escapeFts 双引号转义/<3 LIKE LIMIT 50、albumRepo/artistRepo/playlistRepo.search LIKE LIMIT 10、trackRepo.listFavorites 白名单五键+id 兜底——§3.6 library:search channel 的依赖）；index.ts 组装：ping 移除、WC_USER_DATA 保留、db/settingsStore/coverService/scanService 构建接线、wireCoverPipeline 改「返回注入 onCoverJob 的新 deps」（评审前置③）、coverDroppedExtra 汇合（前置②）、startupScan(settings.autoScanOnStartup)、T3.2 协议占位注释；startupScan 实际接线完成（T2.3 留痕项闭环）。**质量评审三 Important 修复**（commit a97954f，复审 APPROVED）：mainWindow closed 悬挂引用、scan/rescanAll fire-and-forget 无 catch、i18n lang 白名单防路径穿越；顺手 addFolder path 守卫 + completed 严格布尔化。i18n:getMessages 缺文件返回 {}（T3.5 交付资源）、id 不存在返回 null 形态、dialog 注入——均留痕。122 tests 全绿。
  > 执行备注(2026-09-10): 勘误（Phase 3 第三方评审）——本条上文「31 条（invoke 29 + event 2）」计数有误：§3.6 实为 **28 invoke + 2 event = 30 条**（library 12 / favorites 2 / playlists 8 / history 3 / settings 2 / i18n 1），实现与 preload-contract 锁均按 30 条对齐；另 scan:progress 的 phase:'cover' 从未发射（T2.3 遗留），Phase 4 渲染层勿等待该相位（README 遗留段已记）。
- [x] **T3.2 协议注册**：main/index.ts `protocol.registerSchemesAsPrivileged`（两 scheme，§3.5f）；ready 后 `protocol.handle('wc-cover'…)` 与 `protocol.handle('wc-file'…)`（路径前缀校验逻辑，folderRepo 缓存随目录变更失效）。
  > 执行备注(2026-09-10): src/main/library/protocols.ts 纯函数（零 electron）——resolveAudioRequest（URL 解析→decodeURIComponent 异常捕获→normalize 击穿穿越→lower 前缀校验 + path.sep 边界防 d:\music2 混淆；WHATWG URL 非 special scheme opaque host 语义实测留痕：host 不解码故 encodeURIComponent 可逆）、resolveCoverRequest（UUID 正则防穿越、s 白名单 {64,256,512} 缺省 256）、createFolderCache（get/invalidate）；registerSchemesAsPrivileged 位于模块顶层 ready 前（约束自查）；protocol.handle 错误码 403/400/404 分工，net.fetch(pathToFileURL) 流式；失效接线：ipc 三 folder handler 成功后 onFoldersChanged → folderCache.invalidate()。**质量审查安全专项七向量推演无绕过**（normalize 前置/二次编码/斜杠混用/空 host/UNC/s 参数混淆/超长路径）。质量审查 APPROVED（Minor 留痕：Content-Type 依赖 net.fetch 扩展名推断待 Phase 5 冒烟、403 body 回显被拒路径待收敛、wc-file 带 query 用例缺——T3.6 随手补）。137 tests 全绿。
- [x] **T3.3 preload**：contextBridge 暴露 §3.6 形态的 `window.api`；`onScanProgress`/`onCoversReady` 返回 unsubscribe。渲染层加 `src/renderer/src/ipc/client.ts` 薄封装。index.html CSP：`default-src 'self'; img-src 'self' wc-cover:; media-src 'self' wc-file:; style-src 'self' 'unsafe-inline'`。
  > 执行备注(2026-09-10): preload/index.ts 重写——invoke<C> 泛型（IpcPayloads/IpcReturns 锁形，void payload 编译期禁参）、六分组 28 方法、onScanProgress/onCoversReady 独立 listener + unsubscribe off 同实例；channel 常量 import 自 ../main/ipc/channels（零逻辑纯常量跨目录 import，留痕）；preload bundle 实测 4.39kB 无 main 模块泄漏（repo 类型 import type 构建期擦除）。env.d.ts 以 import('../../preload/index').Api 接线 Window.api；**实测发现**：preload/index.d.ts 与 env.d.ts 同名 .d.ts 会被 TS 去重跳过导致 declare global 失效——删除前者合并入后者（含 electron 声明迁移）。CSP 逐字落地。**质量评审 Important 修复**（commit bb55833）：preload 移除 window.electron 后 env.d.ts 声明与模板组件（App.tsx ping 按钮/Versions.tsx）未同步 → dev 渲染即崩且 typecheck 静默放行——删除声明/清理模板残留/Versions.tsx 删除（export {} 模块语义保住 declare global），复审 APPROVED。tsconfig.web include 补 import 链闭包（composite TS6307；channels.ts 依赖 repo 契约类型的耦合留痕，DTO 下沉 shared 收口建议 Phase 4 前做）。137 tests 全绿。
- [x] **T3.4 settingsStore**：`userData/settings.json` 原子写（tmp+rename）；默认值 `{language:'zh-CN', autoScanOnStartup:true, volume:0.8, muted:false}`；get/set IPC；language 变更即返回新资源。
  > 执行备注(2026-09-10): **提前执行**（T3.1 handlers 依赖 store；get/set 的 IPC handler 接线归 T3.1，本任务交付 store 本体）。createSettingsStore(deps:{settingsDir}) 注入式零 electron（userData 路径 T3.1 传入）；原子写 try-rename-first（libuv MOVEFILE_REPLACE_EXISTING 覆盖同名通常成功，EPERM 才降级删旧+rename——质量审查指正原「先删旧」方案崩溃窗口过大与注释不准确，已修正）；pickKnown 双重职责（未知键过滤 + KEY_VALIDATORS 逐键 typeof 校验，volume 含有限数校验）——质量审查 Important：IPC 边界后 renderer 参数运行时不可信，已补防线；损坏 JSON/类型非法键回退默认值不抛错；volume 钳制 [0,1]（set 与 get 双侧）；language 值域 M0.1 仅 zh-CN（类型约束）。9 用例。质量复审 APPROVED。
- [x] **T3.5 i18n**：`resources/locales/zh-CN.json`（全量文案 key，覆盖 §3.7 所有页面/菜单/空态/设置）；main 侧 `i18n:getMessages` 按磁盘读取（路径解析见 §3.8，5.5 运行时要求）；renderer `i18n/index.ts`：`t(key, params?)` + zustand 语言 store，切换语言重新拉取并整树重渲染。
  > 执行备注(2026-09-10): zh-CN.json 142 key 十一分区（nav/search/songs/artists/playlists/track/menu/empty/player/settings/toast——对照 §3.7 逐字抽取，含「此格式 M0.1 暂不支持播放，0.5 版恢复」等）；分区约定落盘 resources/locales/README.md。renderer i18n/index.ts：zustand store + useSyncExternalStore 适配（zustand v5 getServerSnapshot 回退 getInitialState 空表的坑，实测留痕）、t() 插值 {name} 形态/缺 key 回退 key 本身、ensureLoaded 幂等（并发共享 promise）、getApi() 经 globalThis.window?.api 兜底保证 node 可测；零 electron import。**越界修订披露（spec 审查定性：可接受的必然跟随）**：ipc-handlers.test.ts 的 i18n 占位断言被真实资源推翻，拆为 zh-CN 真实返回 + fr-FR 缺失 {} 两例（覆盖意图保留）。9 用例。质量审查 APPROVED。146 tests 全绿。
- [x] **T3.6 单测/类型测试**：settings 往返与默认值合并；`window.api` 形状用 `tests/unit/preload-contract.test.ts`（类型层 `expectTypeOf`）锁死，防止后续漂移。
  > 执行备注(2026-09-10): settings 往返/默认值合并/损坏回退/钳制/类型防线——已由 T3.4 9 用例覆盖（引用不重复造）。preload-contract.test.ts：toEqualTypeOf 签名锁（含事件 unsubscribe 形态）+ not.toBeAny 防线 + **分组键存在性锁**（评审建议落地，防方法删除/改名漂移）。**关键发现**：tsconfig 原不含 tests/**——typecheck 从未校验测试文件，expectTypeOf 断言此前形同虚设；已将契约测试单文件纳入 tsconfig.node.json include 并反向验证（注入错误断言 exit 2 拦截成功）；存量测试纳入属后续工作（存在既有类型错误，超出边界；长期建议 tsconfig.tests.json 方案，留痕）。156 tests 全绿。

**预期产出**：渲染层可完整调用后端能力，协议可出图出音频。

**验收标准**：`npm test` 全绿；`npm run test:e2e` 的 launch.spec 扩展为：临时 userData + fixtures 目录 → `library:addFolder {path}` → 显式 `library:scan` → 收到 scan:progress done → `library:listSongs` 返回 7 条（损坏样本按 F1-7 跳过）；`wc-cover://` URL 在页面 `<img>` 成功显示（Playwright 断言 naturalWidth>0）。**V1.7 澄清：addFolder 不自动扫描（实现与 §3.6 契约一致）——调用方须显式 `library:scan`；原验收流程文字省略该步，Phase 4/7 UI 接线时必须补扫描调用。**

### Phase 4｜应用 Shell 与浏览/搜索 UI（预计 3 天）

**关键任务**：设计资产接入、路由骨架、七个页面全部落地、虚拟滚动、搜索。视觉施工基线 = docs/design/mockups/（已验收，见 docs/design-handoff.md），本阶段照稿施工并保留页面态/行级态语义。

**具体技术实现**

- [x] **T4.0 设计资产接入与视觉基线就位**：① 复制 `docs/design/tokens.css` → `src/renderer/src/styles/tokens.css`（唯一 tokens 源，后续只在此演进）；② 复制 `docs/design/mockups/assets/lucide/` 全部 47 个 SVG → `src/renderer/src/assets/icons/lucide/`（原样，不改名不筛选）；③ 实现 `Icon` 组件（`<img class="library-icon">` 本地加载，入参=图标名+尺寸档+token 语义，映射查 docs/design/icons.md）；④ 通读 `docs/design/notes.md` 的实施交接提醒（§8：先 tokens，再 Shell/TrackList/Cover/PlayerBar/QueuePanel/StateEmpty，最后页面接 IPC）。→ 验证：任一测试页用 `Icon` 渲染 5 个含色变体图标（含 `heart--accent.svg`），naturalWidth>0；无任何外部请求（Network 面板 0 外联）。
  > 执行备注(2026-09-10)：资产接入完成——tokens.css 与 47 SVG 逐字节复制（`cmp`/`diff -rq` 核验零差异），tokens 加入 `.prettierignore` 保字节一致；Icon 组件 `src/renderer/src/components/Icon.tsx`（`import.meta.glob('?url&no-inline')` + `.library-icon` + 未知图标 warn 去重 + null，尺寸档 12|15|16|20|24）。**关键技术发现①（CSP 硬约束）**：Vite 默认把 <4KB 资产内联为 data URI，而 renderer CSP `img-src 'self' wc-cover:` 不含 `data:` → 必须加 `?no-inline` 强制产出独立文件，否则打包后图标全被拦截。**关键技术发现②（颜色机制实证）**：设计稿不运行时上色——语义色烘焙进变体文件（`heart.svg` stroke=#ffffff / `heart--accent.svg` stroke=#1ed760），层次感由 `.library-icon` 上下文 opacity 承担（默认 .6，语义覆写 .92/1/.38/.25）；`<img>` 无法给 SVG path 上色且规则禁 CSS mask，故 Icon 不接收 color prop（评审 I-1 已移除 dead prop）。**评审修复（commit 71d5fb2，复审 APPROVED + 变异双向验证）**：`IconName` 由手写联合改为 `ICON_NAMES` 常量数组派生 + 单测集合双向相等守卫（防资产改名/手写漏项静默漂移）、warn per-name 去重、测试断言去掉对目录名的依赖（生产产物为 `[name]-[hash].svg`）。170 tests 全绿。
  > **⚠️ 验收顺延（评审 I-3，避免「验收已过」错觉）**：计划原文的「naturalWidth>0 / Network 0 外联」**未被 T4.0 自动化覆盖**——Icon.test.tsx 用 `renderToStaticMarkup`（HTML 字符串无法度量 naturalWidth），且 T4.0 时 Icon 尚无消费者被 tree-shake（`out/renderer/assets/` 无 svg）。**该项正式顺延至 T4.1**（首个页面接入 Icon 后）：在 e2e 断言真实 `<img>.naturalWidth>0` + `page.on('request')` 全本地请求，并把「构建产物含独立 svg」纳入冒烟。
- [x] **T4.1 骨架**：App.tsx + react-router（hash 路由）：`/songs(默认) /albums /albums/:id /artists /artists/:id /playlists /playlists/:id /liked /recent /settings /search`；Shell（Sidebar 232 + Topbar 56）视觉对照 `mockups/Songs.html` 壳层施工；PlayerBar/QueuePanel 先按 mockups 占位（Phase 5 填充）。落地页 = Songs（F3-1）。
  > 执行备注(2026-09-10)：**hash 路由理由**——Electron 生产 renderer 由 `loadFile()` 以 `file://` 加载，history 路由无 SPA fallback，深链/刷新会落到不存在路径白屏；故 `createHashRouter`（未用 BrowserRouter）。结构：`routes.ts`（11 路由纯数据表 `ROUTE_DEFS`，零依赖可 jsdom 直测）+ `router.tsx`（`APP_ROUTES`，handle 承载 titleKey/eyebrowKey）+ `components/layout/`（AppShell/Sidebar/Topbar/PlayerBar/QueuePanel）+ `styles/shell.css`（mockup.css 壳层子集，逐块标注来源行号）+ `pages/PagePlaceholder.tsx`；`/` 与 `*` 重定向 `/songs`。几何实测与 tokens 一致（sidebar 232 / topbar 56 / playerbar 72 / queue 320）。zh-CN.json **纯追加 22 key**（142→164，既有键值零改动）。12 条有意偏离逐条留痕（brand-mark 图标 17→16 取 Icon 档位 / player-bar 三列 minmax 因设计稿最小宽 800 > 主区 728 改 `minmax(0,…)` / 不移植演示态进度 36% / 不移植 `:hover #ffffff` 字面量色 / disabled 态占位期新增 opacity .25 并标注 T5 移除 / nav-badge 无数据不渲染 / PagePlaceholder 不复刻绑定真实数据的 `.page-head` 等）。**T4.0 顺延验收三项已在此落地**：build 产物 47 个独立 svg、`data:image/svg` 0 命中、e2e 断言零 http(s) 外联 + `naturalWidth>0`。`assets/main.css` 移除模板 body flex 居中/wavy-lines 背景/全局禁选与 `#root` 布局（6+/17−，Shell 全视口落地的必要前置，已论证，模板孤儿类按 AGENTS 保留）。
  > **质量评审修复（commit cc801bd，复审 APPROVED + 反向验证）**：**C1（Critical，实测复现）**——skip-link `href="#main-content"` 在 hash 路由下触发 popstate，router 读 `hash="main-content"` → 未命中 → `*` 重定向 → **在任意非 Songs 页激活「跳到主要内容」会被弹回 Songs**；修法 `onClick` preventDefault + 手动 focus（保留 href 语义），e2e 回归落在非 Songs 页（反向验证证明该用例确能捕获缺陷）。**I2（双匹配器漂移）**——自研 `matchRoute` 大小写敏感 vs react-router `caseSensitive:false`，致 `#/Albums` 侧栏高亮「专辑」但顶栏标题「歌曲」；已**单源化**：删除整个 `matchRoute/compile/normalize`，titleKey/eyebrowKey 进 `RouteObject.handle`，Topbar 用 `useMatches()` 读。**残留留痕（上游不对称，非本项目引入）**：`#/%61lbums` 顶栏正确但侧栏 `aria-current` 不亮——`matchRoutes` 做 `decodeURIComponent` 而 NavLink 直接比较 `location.pathname` 不解码（react-router 7.18.3 源码实测确认）；如需消除应做 URL 规范化重定向，不在本阶段范围。**I3**——i18n 守卫从「路由键清单」升级为「**扫描 src/renderer 源码 `t('...')` 字面量集合 ⊆ zh-CN.json**」（14 文件 26 键 0 缺失，正对照注入不存在的键可 FAIL）。**I4**——补 `prefers-reduced-motion` / `prefers-contrast: more` 两自包含块；窄窗断点（1100/1000px）显式不移植并留痕（`min-width:960px` + player-bar `minmax(0,…)` 下不溢出）。**I1**——`NAV_ITEMS` 由 `ROUTE_DEFS.filter(nav)` 派生（单源），删除 Sidebar 自维护清单。194 tests 全绿。
  > **后续回加提示（复审留痕，非缺陷）**：`.sr-only` 已在 M1 删除（当时零引用），但 T4.3 轨道表表头需要它（`mockup.css:102` 有定义）——T4.3 回加；`role="slider"` 的 `aria-valuenow` 为 ARIA 必需属性，M5 占位期移除，T5.4 补回；`routes.test.ts` 一处注释称「% 解码语义与 NavLink 一致」措辞不准（侧栏实际不解码），后续顺手收紧。
- [x] **T4.2 libraryStore**：zustand——列表数据 + 分页/排序参数 + `refresh()`（订阅 scan:progress done 自动刷新）。
  > 执行备注(2026-09-10)：`src/renderer/src/stores/libraryStore.ts`（目录名与计划 §目录结构 line 169 一致）。状态 `{songs: TrackRow[], loading, error: string|null, params: {sortBy, order, offset, limit}}` + 动作 `refresh/setSort/setPage`；导出 `useLibraryStore/useLibrary/ensureScanProgressSubscription/stopScanProgressSubscription/DEFAULT_LIBRARY_PARAMS`。**边界决定**：只做 songs 列表，不缓存 albums/artists（本任务无消费者，缓存即无消费者的状态——T4.4 各页自取；评审判「本阶段不抽通用列表 slice」，待第 2 个列表 store 出现时再抽 `createListStore` 工厂）。**并发保护 = 请求序号令牌**（`ipcRenderer.invoke` 无 AbortSignal，无法取消主进程查询；唯一真实风险是旧请求晚到覆盖新结果，序号足以消除，成功/失败两分支都丢弃过期结果）。订阅模块级幂等长驻（参照 i18n `ensureLoaded` 模式）+ `stopScanProgressSubscription()` 供测试/HMR 复位；测试隔离靠惰性 `getApi()`（模块加载时无 api → 订阅空操作）+ beforeEach 复位，无跨用例泄漏。默认 `limit=50` 与主进程 `trackRepo.listSongs` 及 `clampLimit` 兜底单源一致。
  > **songsCount 事实核查（重要留痕）**：Sidebar 的 `nav-badge` 需曲目总数，**经全仓核查确认无现成 IPC 通道**——`channels.ts` 无 stats/total 类 channel、`library:listSongs` 返回裸 `TrackRow[]` 无 total 字段、`trackRepo` 无 count 方法；且 `listSongs` 是服务端分页（默认 limit 50、clamp 上界 200），`songs.length` 是**当前页长度而非总数**（30k 曲库会显示「50」）。**判定：不接入 AppShell**——用页长冒充总数即回归假数据（违反 T4.1 确立的「不渲染假数据」原则），且派发明确禁止擅自新增 channel。**→ 待办：Phase 4 后补 `library:getStats` 通道或让 `library:listSongs` 返回 `{items, total}`**（届时更新 `Sidebar.tsx:20-23` 那条现已过时的「T4.2 接入后由 AppShell 传入真实 count」注释）。
  > **质量评审修复（commit 3cc0d21，变异验证）**：**I-1（约定分裂）**——同仓 i18n 的 `setLanguage` 内部触发取数，而 libraryStore 的 `setSort/setPage` 不触发，两 store 两种答案且「忘 refresh」是静默失效（T4.3 表头点击会踩）；已改为 setter 内部 `void refresh()`，对齐 i18n 先例（排序/翻页为离散动作不需 debounce；连续调用由序号守卫保证正确）。**I-2**——补 4 例反向验证：旧请求「失败」晚到不得覆盖新请求成功状态（直接守护 catch 分支序号守卫）、loading 转换断言、旧请求晚到结算时新请求仍在飞不得清 loading、setter 触发 refresh 的参数断言；**变异验证**：删除 catch 分支序号守卫 → 2 例 FAIL（原「删掉整套仍绿」失效），已还原。209 tests 全绿。
  > **T4.3 前置设计决策（评审 I-3 立案）**：`refresh()` 全量替换数组 vs 虚拟滚动的张力——`listSongs` 是 offset/limit 分页（上界 200），store 无 `append/loadMore` 通道。T4.3 须明确取舍：走分页（需扩 store 加追加动作 + `refresh` 全量替换会导致 offset 变化时内容整体跳变）还是只对当前页做渲染；virtuoso 须配 `computeItemKey={i => songs[i].id}` + `itemContent` 用 `useCallback` 防全行重渲。另：`setSort` 后 refresh 失败会致「列表为旧排序数据而表头指示器已指向新排序」的 UI 自相矛盾，T4.3/T4.4 需用 error 状态呈现错误条并考虑置灰排序指示。
  > 执行备注(2026-09-10)：交付 `src/renderer/src/components/` 下 `TrackList.tsx`（296 行容器 + 表头）/ `trackListUtils.ts`（纯函数与常量）/ `TrackRowItem.tsx`（单行）/ `TrackContextMenu.tsx`（右键菜单）+ `Cover.tsx`，样式 `styles/tracklist.css` / `styles/cover.css`。**分页取舍定调**：只对当前页渲染，virtuoso 仅作行渲染优化，不扩 store（不引入 append/loadMore）——`computeItemKey={i => songs[i].id}`、`itemContent` 走 `useCallback`，两条均按前述立案落地。**六态优先级**：missing > unplayable > normal，不可播含 `!playable || status==='ignored'`。§3.7 列宽逐字入 CSS grid：`44px 40px minmax(200px,2fr) 1fr 1fr 64px 56px 72px 110px 28px`。**回调注入而非建 store**：onPlayNext/onEnqueue/onToggleFavorite/onActivate/onSortChange + playingTrackId 全部经 props 注入（playerStore 属 T5.6，本任务不越界创建）。**Cover 档位解耦**：`wc-cover://{coverId}?s={size}` 固定 64 档，盒尺寸由 className 承担（cover--table 40 / cover--mini 48 / cover--hero 200）；onError 以 url 为键回退占位（行复用不沿用旧失败标记）。
  > **T4.3 质量评审修复（commit 0805cca，一轮+复审）**：**C1（Critical，播放图标）**——`music-2` + CSS `color:var(--accent)` 对 `<img>` 无效，改 `music-2--accent` 变体并删无效 CSS；同批系统性自查 22 处 Icon 用法，另修 2 处无效上色（播放态、row-play 禁用态）。**I2**——子菜单自身 scroll 不再误关菜单（`contains(event.target)` 守卫）。**I3（失效模式）**——e2e 注释称「双击拦截由单测锚定」但 grep 零命中，补 3 例真实双击用例（变异验证：删守卫 → 2 例 FAIL → 还原）。**I1（复审阻断，已修）**——`.track-list-error*` / `.is-sort-degraded` 四条 CSS 规则全仓不存在，单测只断言类名致误绿（与 I3 同一失效模式）；已补规则（错误条：`--bg-elevated` 底 + 2px `--danger` 左缘 + 主/次两级文字；降级：`.track-row--head.is-sort-degraded { opacity: .45 }`），并把测试从「类名存在」加硬为「两段落在 title/hint 子元素」「降级类挂在表头行本体」。**C1 同族遗漏（复审中等，已修）**——`Cover.tsx` 的 `cover-icon` 类击败设计稿 `.38` 占位透明度，致占位图标 100% 白；实测设计稿 15 个 `cover--placeholder` 内部 `<i>` **全部无** `cover-icon`（该类的唯一注入点 `mockup.js` addCoverIcons 要求 `.cover` 不带色类且无直接图标子节点，对占位封面恰好相反 → 设计稿里是死规则），故删类并把 58% 尺寸与 .38 不透明度改由 `.cover--placeholder .library-icon` 承担。**I4（复审补测）**——Home/End 方向键、菜单关闭后焦点归还触发行，两项实现存在但无锚点，已补 3 例（其中一个因 virtuoso 在 jsdom 无布局而不渲染数据行，退到行组件级挂载并留痕说明）。**M1/M4**——菜单首帧视口钳制、`sr-only` 回加。当前 273 tests 全绿 / typecheck 0 错 / 6 例 e2e 通过（数值以复审轮实跑为准）。
  > **T4.3 遗留（用户裁定，T4.4 前置）**：① **封面通路**——`tracks.cover_id` 全仓无写入点（coverService 只写 `albums.cover_id`，`TrackRow.coverId` 恒 null），Songs 封面列因此全走占位；用户裁定「**渲染层走专辑封面**」，即 T4.4 在 `listSongs` 等查询里 JOIN `albums.cover_id` 回填 `TrackRow.coverId`，**不改扫描管线**。② **Liked 术语**——用户裁定统一用「收藏」，设计稿 `Liked.html` / design-plan §4.6 的「喜欢的音乐」需改；`docs/design/**` 实施期只读，T6 前解除约束后处理。
  > **二轮复审修复（2026-09-11，复审 agent-8a42f048 结论 NEEDS_FIXES → 3 Important + 2 Minor 已修）**：① **错误条容器规则缺失**——首轮修复只写了 `-title`/`-hint` 子规则，`.track-list-error` 容器本体（--bg-elevated 底 + 2px --danger 左缘）遗漏，已补（期间发现变异/还原链路有还原瑕疵，容器规则曾丢失；教训：变异验证的还原必须以 `git diff` 校验和比对收口，不得只凭 rg 单点确认）。② **css-contract 守卫子串盲点**——`toContain('.track-list-error')` 被子规则 `-title`/`-hint` 满足，容器规则缺失时守卫照样绿（恰是 I1 要消灭的 false-green 在守卫自身复现）；已引入 strict 语义（选择器 + `\s*\{` 规则原文匹配），对存在裸规则的选择器标 strict，descendant 形态的选择器（.is-playing/.is-unavailable）保持 toContain 并注明不可 strict 的原因。③ **I4 焦点归还测试空转**——原行级 harness 把 trigger 记在测试闭包、又在测试体手动 focus（复审变异 3：删生产 `menuTriggerRef.current?.focus()` 后测试仍绿）；已重做为 `TrackList.focus.test.tsx` 真实集成测试：vi.mock('react-virtuoso') 令真实 TrackList 在 jsdom 渲染数据行（文件级隔离，不污染 TrackList.test.tsx 的「数据态走真实 virtuoso」边界），走 contextmenu → TrackList.onOpenMenu → TrackContextMenu Escape → closeMenu 全链路，删生产 focus 调用必红。④ Minor：计划测试数 260→273 实数；cover.css `:not(.cover-icon)` 注释表述改为中性（不臆测设计稿作者意图，只陈述「对占位封面是空防御」的事实）。复审对 C1 事实主张（cover-icon 是设计稿死规则）的独立复核结论：**属实**。
- [x] **T4.3 TrackList 组件**：react-virtuoso 虚拟滚动；列布局与 §3.7 一致，行视觉与六态（normal/hover/playing/missing/不可播/selected）对照 `mockups/Songs.html` 样本施工；排序点击表头（白名单 7 键，chevron 12px 特例尺寸按 icons.md）；右键菜单（菜单项四组，视觉对照 components.html 菜单区；「下一首播放/添加到队列」先空实现调 playerStore 占位函数，Phase 5 接通）。Cover 组件：`wc-cover` URL + 无封面占位（`--bg-elevated` 底 + `music-2` 图标，同 mockups）。
- [x] **T4.4 Songs / Albums / AlbumDetail / Artists / ArtistDetail 页**：数据与交互严格按 §3.7 表；视觉逐一对照 `mockups/` 同名页面（AlbumDetail 的 Hero 渐变 = 唯一允许渐变，实现同稿）；AlbumDetail「随机播放」= 将曲目数组洗牌后 loadContext（Phase 5 接通前先挂占位）。
  > 执行备注(2026-09-11)：五页落地于 `src/renderer/src/pages/`（Songs/Albums/AlbumDetail/Artists/ArtistDetail + 各自单测），PagePlaceholder 改为 pathname 分发器（routes.ts/router.tsx 冻结未动，ROUTE_DEFS 已含参数路由）。公共件：`useBrowseData.ts`（三态 + cancelled 守卫取数 hook）、`playerBridge.ts`（playContext/shuffleContext 占位，签名对齐 T5.6 loadContext，详情页两按钮是唯一切换点）、`browseFixtures.ts`；样式 `styles/browse.css`（自 mockup.css 收口迁移，Hero 渐变 `#2a2832` 为全项目唯一字面色、三重留痕）。i18n +15 键；css-contract 守卫入检 browse.css（7 个 strict 条目，含评审建议补登的 `.browse-state`）。**Songs 页头不渲染总数**（无 songsCount 通道，页长冒充即假数据；Albums/Artists 渲染真实 total）。**前置修复①（用户裁定封面通路）**：rowMapper `TRACK_SELECT_COLUMNS` 的 coverId 列 tracks.cover_id → albums.cover_id + TRACK_SELECT_FROM 增 JOIN albums；playlistRepo/historyRepo 自有 FROM 补各自 JOIN（评审复核全仓 7 处 TRACK_SELECT 引用点：无双重 JOIN、无漏 JOIN、tracks.cover_id SELECT 零残留）；扫描管线未动。**前置修复②**：`?playing=` 后门三件套移除（PagePlaceholder 钩子/.tracklist-page 规则/tracklist.spec 步骤④⑤.5），C1 播放行断言记 T4.4~T5.6 覆盖空窗、T5.6 补齐。
  > **T4.4 质量评审修复（2026-09-11，复审 agent-b4872a8c 结论 NEEDS_FIXES → 修 2 处后放行）**：**Important-1**——ArtistDetail.tsx 专辑卡曲目数拼裸中文「首」绕过 t()（哨兵测试测不到硬编码），改走既有键 `albumDetail.trackCount`，顺删冗余 AlbumCard import。**Important-2**——封面通路无测试锚定（评审 M1 变异实证：SELECT 列改回 tracks.cover_id 后全量仍 296 绿，静默语义回退）→ 补 `tests/unit/db/trackRepo.test.ts` 锚定用例（经生产通道 insertCover+setAlbumCover 落封面，断言 findById/listSongs 的 coverId === 所属专辑 cover_id、无封面专辑 → null）；修复后变异复验：同变异 → trackRepo.test **1 failed** → 还原（git diff sha1 前后一致）——锚定有牙。修复后 298 tests / typecheck 0。
  > **T4.4 留意（后续任务承接）**：① songsCount 通道缺失（Songs 总数不渲染）——Phase 4 后补 library:getStats 或 listSongs 返回 {items,total}；② playerBridge 是 T5.6 唯一切换点；③ e2e C1 播放行断言空窗至 T5.6；④ 艺术家真实头像待 T6（artists 表无封面列，当前 mic-2 占位）；⑤ ArtistDetail 专辑网格与曲目表共享 flex 高度，超长场景如需独立滚动后续包 .browse-scroll。
  > **T4.4 前置移除项（T4.3 复审立案）**：`src/renderer/src/pages/PagePlaceholder.tsx` 里的 `#/songs?playing=<id>` 生产后门——T4.3 为 e2e 断言播放行图标走 accent 变体而引入的临时验证钩子（同时 `tracklist.css` 的 `.tracklist-page` 容器规则、`tests/e2e/tracklist.spec.ts` 第 ④/⑤.5 步对该钩子的依赖也属同一批）。T4.4 用真实 Songs 页替换 PagePlaceholder 的 Songs 分支时，三处须一并移除/改写；移除后播放态断言改由 T5.6 的 playerStore 提供，或在 T4.4~T5.6 之间保留 e2e 覆盖空窗并在 T5.6 补齐。
- [x] **T4.5 搜索**：SearchBox（debounce 200ms，focus 320→400px 过渡对照 SearchResults.html）→ 下拉分组预览（对照 components.html 下拉区：四组各 5 条 + 查看全部）→ `/search?q=` 全结果页（对照 SearchResults.html 四段式）；结果空态文案走 i18n；handler 计时日志（≥3 与 <3 两路径都留点）。
  > 执行备注(2026-09-11)：SearchBox 组件（debounce 200ms 纯函数单源 searchUtils.ts + requestId 竞态防护 + 四组各 ≤5 下拉 + Escape/点外/Enter/Ctrl+K/↓↑ 键盘可达 + IME isComposing 守卫）、SearchResults 页（/search?q= 四段式，空 q 引导态**零 IPC**——SearchResultsContent 条件挂载绕 hook 规则）、handler 计时日志（`[search] q=… path=fts|like took=…ms` 两路径打点，判据与 trackRepo 内部路由同口径 `q.trim().length>=3` 并注释声明同步负担）、search.css（mockup.css 2064-2134/1607-1636/741-765 收口迁移）+ css-contract 9 条登记（8+1 strict）。i18n +7 键。主会话裁定：① 下拉「查看全部」→ `/search?q=`（结果页组头 → 分区页，两处 affordance 分工）；② ↓/↑ 为合理可达性增强；③ console.warn 中文留痕（与 main 侧先例一致）；④ 结果页歌单组 artist-row 形态为声明偏离（PlaylistSummary 无封面数据，禁造假数据）。
  > **T4.5 两阶段评审闭环**：**spec 审查（agent-991bd538）✅ compliant**——逐条核验无缺失；夹具完整性通过（实现中段曾发生并行编辑覆盖致 searchCalls 桩丢失，已重写，终态无残留）；未声明保真偏离 3 处上报。**质量审查（agent-59b6ec2b）NEEDS_FIXES → 修复子代理（agent-453d3d98）已修**：①下拉 Link 导航后不关闭（useLocation 变化统一 setOpen(false)）；②Escape/goToResults/路由切换在途响应落地会重开下拉（各路径 requestSeqRef.current++ 失效在途 + 卸载守卫）；③IME isComposing 的 Enter/Escape 不触发跳页/关下拉；④css-contract 补登 .search-anchor（定位锚，丢失则下拉漂出视口）。Minor 落实：下拉补 28px 封面/头像列（曲目/专辑 Cover 64 档 + CSS 盒、艺术家 mic-2、歌单 library 图标盒——禁假数据）、紧凑表副标题「艺术家 · 专辑」、全空白输入不发请求回归锚、Ctrl+K 聚焦用例。debounce 与 css-contract 变异验证均红（hash 收口一致）。修复后 **330 tests / 34 files、typecheck 0、build ✓、e2e 7 passed**（主会话实跑复核）。
  > **T4.5 留意**：环境噪声——Git Bash 偶发 vitest worker 全挂（`reading 'config'`，与改动无关），换 PowerShell 或复跑判定；T4.7 将补「搜索夜曲 ≤300ms」e2e 计时断言，本任务 handler 计时日志即其观测点。
- [x] **T4.6 i18n 全覆盖检查**：grep 组件源码中的中文字面量，除注释外应为 0 命中（全部走 t()）。
  > 执行备注(2026-09-11，主会话直接核验)：三层 grep 全部 0 违例——① 行级 CJK 扫描（排除注释/测试/CSS）：命中仅 console 诊断日志（i18n/libraryStore/Icon/SearchBox/playerBridge，开发者向非 UI 文案，与 main 侧中文错误串先例一致，T4.5 评审 Minor-6 已裁定留痕）与块注释/行尾注释；② 属性级（alt/title/aria-label/placeholder/label="…中文…"）0 命中；③ JSX 文本节点（>中文<）唯一命中在 Icon.tsx 文档注释内、CSS content 无中文。既有守卫：源码 t() 字面量 ⊆ zh-CN.json（T4.2 I3 引入，i18n 测试常驻）。
- [x] **T4.7 E2E `scan-and-browse.spec.ts`**：启动（fixtures 库）→ 等扫描 done → Songs 行数=7 → 排序点击标题列 → 断言首行变化 → Albums 网格出现（封面加载成功）→ 进专辑详情曲目按序 → Artists 无重复 → 搜索「夜曲」≤300ms 内出结果（Playwright 计时断言 `expect(duration).toBeLessThan(300)`，CI 波动阈值放宽至 500ms 并注明）→ 中文两字查询命中。
  > 执行备注(2026-09-11)：交付 `tests/e2e/scan-and-browse.spec.ts`（2 用例）+ `tests/e2e/helpers.ts`（setupScannedLibrary/watchRequests 零外联/watchConsoleIssues/ApiLike——runScan 类助手已在三个既有 spec 重复两次，抽公共件止步于新 spec 侧，既有 spec 不回改）。曲目按序=动态选曲目最多专辑，DOM 行序与 getAlbum 期望序（disc→trackNumber）全等（零硬编码曲名）；Artists 无重复=Set(names).size===length 且页头计数与 listArtists 对账；「夜曲」2 字符走 **LIKE 路径**命中即「中文两字查询命中」证据。计时：设计目标 300（`WC_E2E_SEARCH_STRICT=1` 可收紧），默认 500 宽松并注明 CI 波动；**实测 76/123/137ms**。首跑曾 1 失败：Albums 网格封面 real=0——`useBrowseData` 挂载只取一次 listAlbums，covers 异步落库不重取（源码时序特性非 bug，tracklist.spec 已有「等落库+reload」先例）→ 按同款稳健形态修复（api 轮询 coverId + reload 后断言）。
- [x] **T4.8 E2E `shell-navigation.spec.ts`**：逐路由导航断言渲染无异常（控制台无 error 日志），F3-1 无死链验收。
  > 执行备注(2026-09-11)：T4.1 既有 3 用例零改动，追加 2 用例——①**11 路由矩阵**（含 /albums/:id、/artists/:id 用不存在 id 走 notFound 真实分支、/search?q= 空查询引导态、4 条占位页）：每条断言顶栏标题 + 主内容目标文案 + hash 落位（未被 `*` 兜底重定向）+ 控制台零 error/pageerror + 零外联；**启动期无已知 console error，watchConsoleIssues 未做任何豁免过滤**。②**F3-1 无死链**：侧栏 7 入口逐一点击 → hash 落位 + aria-current 迁移 + 顶栏同步 + 主内容非空。
- [x] **T4.9 Songs 翻页**（Phase 4 收尾评审新增，用户裁定 2026-09-11「Phase 5 前补」）：Songs 页页脚最小翻页控件接 `libraryStore.setPage`（offset/limit 机制已就绪，页长 50、上界 200）；上一页/下一页 + 页码呈现；**禁假总数**——总数通道缺失，用「第 N 页」形态而非「共 M 条」，末页判定=返回行数 < limit 时禁用下一页、首页禁用上一页；i18n 键追加（zh-CN.json）；单测：控件渲染态（首/中/末页禁用逻辑）+ setPage 驱动取数参数断言；e2e 不要求（fixtures 7 首单页）。
> 执行备注(2026-09-11)：交付 `src/renderer/src/pages/Songs.tsx` 页脚翻页（nav.songs-pagination + 上一页/下一页 + 页码，接 libraryStore.setPage）+ browse.css 四组规则 + zh-CN.json 4 键 + css-contract 2 条 strict 登记 + Songs.test.tsx 4 新用例（三态禁用/setPage 接线参数/空态不渲染/越界空页兜底）。**设计稿无分页区**（grep 零命中），最小形态偏离留痕。**禁假总数落实**：页码=offset/limit+1，末页判定=当页行数<limit 禁下一页（整数倍边界落空页由越界空页兜底退路缓解，根治待总数通道）。**渲染门槛一处放宽（留痕）**：offset>0 且 0 行的越界空页仍渲染控件——避免「上一页」退路随控件消失成死路。修复后 345 tests / typecheck 0 / e2e 11 passed。
- [x] **T4.10 遗忘前置收口**（Phase 4 收尾评审新增，用户裁定 2026-09-11「现在就修」）：① **IPC 常量/payload 类型下沉 shared**——消除 preload→main 目录耦合（`src/preload/index.ts:11-12` 仍 `import { IPC } from '../main/ipc/channels'`；将 IPC 常量与 IpcPayloads 迁至 `src/shared/`，main/preload/renderer 引用同步更新，行为零变化）；② **protocol net.fetch 失败分支用例**——`src/main/index.ts:167-190` 内联 handler 的 403/404 分支（防目录穿越外的协议错误路径）提为可测函数或以测试资产驱动，补失败分支单测（happy path 已由 e2e scan-flow naturalWidth 覆盖）。

- [x] **T4.11 Phase 5 前置收口包**（收尾评审 songsCount 立案，用户裁定 2026-09-11）：① 新增 `library:getStats` 只读通道（返回 tracks/albums/artists 总数，additive 不改 listSongs 形状——用户裁定选型）+ repo 层 count 查询；② Songs 页头按设计稿形态渲染真实总数（「全部歌曲 · N 首曲目」，i18n 插值，替代现 songs.heading 纯标题）；③ Songs 翻页末页判定根治（total 就绪：offset+limit>=total 禁下一页，替换行数<limit 近似）；④ Sidebar nav-badge 接线真实计数（用户裁定随本次接线；仅渲染设计稿有的徽标位，同步修正 T4.2 立案的过时注释）；⑤ TrackList 增 `sortable?: boolean`（默认 true），AlbumDetail/ArtistDetail 传 false——设计稿详情页表头为纯文本无排序按钮（grep 实证），顺带消除 aria-sort 失真；⑥ 相关单测 + css-contract 登记 + 既有 e2e 不破。

> 执行备注(2026-09-11)：交付 `stores/statsStore.ts`（zustand + scan:progress done 幂等订阅 + formatCount 千位分隔单一口径，与 libraryStore 订阅模式同构）+ 三 repo `count()`（SELECT COUNT(*)，trackRepo 含全部状态行与 listSongs 同口径）+ shared/ipc.ts 三处契约 + handler/preload + Songs 页头/翻页/Sidebar 徽标接线 + TrackList `sortable` 开关（详情页 false）。**设计稿事实纠正两处（评审独立复核属实）**：① Songs 页头计数在**副行** `<p>30,000 首曲目 · 按标题排序</p>` 而非标题内（任务书原写「全部歌曲 · N 首曲目」有误，以稿为准）；② nav-badge **仅歌曲一项**有徽标位（专辑/艺术家无）。「按X排序」副行动态插值（设计稿静态文本的防失真动态化，SORT_LABEL_KEYS 复用既有键）。翻页根治：total 就绪 `offset+limit<total` 禁下一页 + 「共 M 页」，未就绪回退行数近似。评审 APPROVED：M1 删 getStats handler → 2 failed；M2 sortable 默认翻转 → 3 failed；均 hash 收口还原。**360 tests / typecheck 0 / e2e 11 passed**。Minor 遗留（不阻塞）：statsStore 专属单测欠账（scan done 分支无直接用例，与 libraryStore 同模式同欠账）、Sidebar 徽标无直接断言（formatCount 已由页头锚定）、设计稿页头 eyebrow「Library / Tracks」未渲染（非本任务范围，后续立案）。
**预期产出**：可浏览、可搜索的完整曲库界面（播放功能除外），与 mockups 视觉一致。

**验收标准**：T4.7/T4.8 全绿；`npm run typecheck` 通过；i18n 检查（T4.6）0 违例；**视觉对照走查**——11 路由逐一与 mockups 同名页并排比对，布局/层级/状态语义一致（允许 token 级像素差，记 notes.md）；图标全本地（DOM 无 inline SVG、无外联请求）；键盘 Tab 走查侧栏→主区→播放栏焦点可见（focus-visible 焦点环）；手工冒烟——滚动、排序、搜索手感无卡顿（正式性能验收在 Phase 8）。

### Phase 5｜播放器核心与队列（预计 3 天）

**关键任务**：AudioEngine、playbackService、PlayQueue 接入、播放栏、队列面板、计数口径。

**具体技术实现**

- [x] **T5.1 PlayQueue 落地**：§3.5b 代码原样入 `player/queue.ts`（纯类无依赖）。
- [x] **T5.2 queue 单测**（`tests/unit/player/queue.test.ts`，≥10 用例，F5 验收的自动化形态）：
  - F5-2：loadContext(10 首, startIndex=2) → order=10 首、current=第 3 首；
  - F5-5：shuffle 开启后 next() 走满一轮，序列无重复且为原集合；关闭后 order 恢复 original；
  - F5-6 六组合：off/off、off/all、off/one、on/off、on/all、on/one——逐组合断言 next 行为（含 all+on 一轮后重洗、one 下 next 不前进）；
  - F5-3：playNext 插队后播完插队曲回到原顺序（断言后续序列）；
  - 队首 previous：重启当前曲。
  > 执行备注(2026-09-11)：**T5.1 逐字保真实证**——`sed -n '379,463p'` 提取计划代码块与 `src/renderer/src/player/queue.ts` SHA1 相同（`a4cd45ea…`，评审独立复验 diff 零差异），零格式差异、语义 0 改动。**T5.2 18+1 用例**（`tests/unit/player/queue.test.ts`，node project）：F5-2/F5-5（集合性质断言，随机性无关）/F5-6 六组合逐组合/F5-3 插队回原序完整序列/enqueue 尾插/队首 previous 重启/空队列/越界 startIndex 原样语义×2（注释标注「计划代码原样」现状锚）/upNext 副本/深拷贝锚定（评审 M1 缺口补锚：外部变异入参不污染队列，变异复验 1 failed→还原与计划代码逐字节一致）。on/all 重洗断言显式注释 Fisher–Yates 两次碰撞可能，稳健性核实通过。两处计划代码原样语义上报备案（未改代码）：①顺序模式 loadContext 越界 startIndex 原样存 index（current null、next 视为队尾）；②previous() 在 index=0 且 repeat='all' 时走绕回分支（与队首重启语义不同分支序）。评审（agent-60efcf5c）APPROVED。**379 tests / typecheck 0 / e2e 11 passed**。
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
