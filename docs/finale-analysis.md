# Windy Concert 需求分析报告（终版）

| 项 | 内容 |
|---|---|
| 版本 | V2.0（修订版） |
| 日期 | 2026-09-09 |
| 取代 | primalreport.md（组会初版需求报告） |
| 修订方式 | 对初版逐项 grill 确认，共 23 项决策，全部经产品负责人确认 |
| 文档目的 | 交接给需求分析师，作为功能细化与开发排期的唯一需求输入 |
| 配套文档 | CONTEXT.md（领域术语表）、docs/adr/0001~0003（关键决策记录） |

---

## 1. 产品概述

### 1.1 定位

Windy Concert 是一款面向桌面端的现代化本地音乐播放器，准确定义为：

> 以本地音乐库为核心、能够理解和整理用户音乐收藏、并拥有现代流媒体播放器交互体验的 Personal Music Platform。

用户只需指定音乐目录，系统自动完成扫描、Metadata 读取、封面提取、数据库构建，最终呈现的是"歌曲 / 艺术家 / 专辑 / 歌单"的曲库视图，而非文件路径视图。产品体验参考 Spotify、网易云音乐、Apple Music、MusicBee、foobar2000，但不提供商业流媒体服务。

### 1.2 目标用户

**大众本地音乐用户为主，兼顾发烧友。**

- 大众用户：拥有几百到几千首本地音乐文件的普通 Windows 用户，核心诉求是"扫完就能听、封面齐全、界面现代、搜索好用"。
- 发烧友：无损/Hi-Res 收藏者，曲库可达万首级，在意规格指标展示（采样率/位深/比特率）；Gapless、ReplayGain、bit-perfect 等深度音频能力在后续版本保障，MVP 承诺 Hi-Res 指标的正确展示。

### 1.3 产品边界（显式约束）

| 边界 | 说明 |
|---|---|
| Local First | 无网络时扫描、播放、搜索、收藏、歌单、专辑/艺术家浏览全部可用。网络只负责增强体验，不维持基本功能 |
| 不做流媒体 | 无在线曲库、试听、下载。网络仅用于 Metadata/封面/歌词补全 |
| 无账号、无云同步 | 无登录、无用户系统，数据全部留在本地。云同步列为 2.0+ 远期可选项 |
| 无遥测 | 不采集任何用户数据 |

> 决策记录：ADR-0003。

### 1.4 核心设计原则

1. **Local First**：见 1.3。
2. **Metadata First**：围绕 Track / Artist / Album / Genre / Playlist / Library 实体设计，文件只是 Track 的数据来源之一，禁止围绕"文件"组织产品。
3. **数据库与文件系统分离**：扫描完成后所有 UI 查询走数据库，不实时遍历硬盘。
4. **播放器核心与 UI 分离**：UI → PlayerStore → PlaybackService → AudioEngine 分层，UI 不直接接触底层音频 API。
5. **外部元数据服务插件化**：MetadataService 下挂 LocalTagProvider / MusicBrainzProvider / AcoustIDProvider / CoverArtProvider / LastFmProvider，新增 Provider 不修改核心音乐库。

---

## 2. 用户场景

| # | 场景 | 用户期望 | 覆盖需求 |
|---|---|---|---|
| S1 | 大众用户把网易云下载目录配置进音乐库 | 扫描后自动出现带封面的专辑墙、艺术家列表，双击即播，搜索秒出 | F1、F2、F3、F4 |
| S2 | 文件毫无标签（Track01.flac） | MVP 显示文件名原样；0.5 联网补全后自动变成"夜曲 / 周杰伦 / 十一月的萧邦 / 2005"；1.0 无标签也能靠声纹指纹识别 | F2、F9、F12 |
| S3 | 发烧友 3 万首无损曲库 | 首扫 5 分钟内完成，滚动列表不卡，规格列正确显示 24bit/96kHz 等指标 | F1、F5、NFR 性能指标 |
| S4 | 听歌时的日常操作 | "下一首播放"插队、随机不重复、喜欢的歌一键收藏进"喜欢的音乐" | F5、F6 |
| S5 | 用户整理文件夹，移动了音乐文件 | 收藏、歌单、播放历史全部保留（Track 身份不因路径变化丢失） | F1 数据层、F7 |

---

## 3. 功能需求

版本列标注需求首次交付的版本：M0.1 / M0.5 / M1.0 / M2.0。验收标准为该版本发布前必须满足的可检验条件。

### F1 音乐库与扫描

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F1-1 | 音乐目录管理 | 添加/删除/临时禁用音乐目录；目录列表持久化 | M0.1 | 添加 D:\Music 后重启应用目录仍在；禁用目录不再被扫描 |
| F1-2 | 递归扫描 | 任意深度目录结构，不预设"艺术家/专辑"固定层级 | M0.1 | 5 层嵌套目录内音频文件全部入库 |
| F1-3 | 格式过滤 | 原生可播集：MP3/FLAC/WAV/OGG(Vorbis+Opus)/M4A(AAC+ALAC)；APE/WMA/AIFF/DSF/DFF/WV/TTA/AC3/MKA 等扫描入库但标记不可播 | M0.1 | 原生集可播；APE 入库且 UI 明确标记不可播原因；0.5 起 FFmpeg 兑现播放（F11-5） |
| F1-4 | 增量扫描 | 记录 path/size/modifiedTime 三元组，均未变化则跳过；变化则重新解析 | M0.1 | 二次启动扫描不重新解析未变化文件（日志/耗时可证） |
| F1-5 | 扫描触发 | 启动时自动增量扫描（设置可关）+ 设置页手动全量重扫按钮；File Watcher 实时监听留 0.5 | M0.1 / M0.5 | 3 万首库启动增量扫描 ≤10s；新增文件下次启动自动入库 |
| F1-6 | 文件删除检测 | 文件消失 → Track 置 missing，不删数据库记录（移动硬盘断开不导致曲库消失）；状态三态：available / missing / ignored。ignored 的 UI 入口（右键忽略/恢复）0.5 提供，MVP 仅建状态字段 | M0.1 | 拔掉移动硬盘后曲目显示 missing 状态而非消失；重连后自动恢复 |
| F1-7 | 扫描容错 | 单文件读取失败/被占用 → 跳过并记录，扫描不中断；同一文件出现在多个音乐目录 → 去重（路径唯一） | M0.1 | 构造 1 个损坏文件 + 1 个被占用文件，扫描完成且其余文件正常入库 |
| F1-8 | File Watcher | 监听音乐目录 Created/Modified/Deleted/Renamed 实时更新；配合定期完整校验，不完全依赖 Watcher | M0.5 | 运行中向音乐目录拖入新文件，10s 内出现在曲库 |

### F2 Metadata 与封面

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F2-1 | 本地标签读取 | ID3v1/v2、Vorbis Comment、FLAC Metadata、MP4 Metadata、APEv2；字段：Title/Artist/Album/AlbumArtist/TrackNo/DiscNo/Genre/Year/Composer/Comment/Lyrics/Cover | M0.1 | 构造含完整标签的 MP3/FLAC/M4A 样本，字段全部正确入库 |
| F2-2 | 优先级链 | 文件内 Metadata > 文件夹封面 > 网络 Metadata（0.5 起）> 文件名显示。网络数据永不覆盖内嵌标签字段 | M0.1 起生效 | 同一字段内嵌与网络来源冲突时，内嵌值胜出 |
| F2-3 | 无标签回退 | MVP：无标签曲目显示文件名原样，不做文件名模式解析（维持初版优先级原序） | M0.1 | 无标签文件在 Songs 列表显示文件名（不含扩展名） |
| F2-4 | 本地封面发现 | 优先内嵌封面；其次同目录 cover.jpg/png、folder.jpg/png、front.jpg、album.jpg，同专辑内复用 | M0.1 | 只有 cover.jpg 无内嵌封面的专辑，列表与详情页正常显示该封面 |
| F2-5 | 封面缓存 | 多尺寸缓存 64/256/512，列表页不加载原图 | M0.1 | 3 万首曲库滚动 Songs 列表无可感知卡顿 |
| F2-6 | 来源追溯（Provenance） | 关键字段记录来源：embedded / folder / network / filename / user | M0.1（数据层；来源管理 UI 见 F11-4） | 数据库中每条 Metadata 可查出其来源 |
| F2-7 | 在线补全 | MusicBrainz（实体标准库，保存 Recording/Release/Artist MBID）+ Cover Art Archive（按 Release MBID 取封面）+ Last.fm（bio/Tags/相似艺术家，仅增强）。Provider 架构，核心音乐库不感知具体服务 | M0.5 | 无封面专辑联网补全后显示封面；断网时已有数据不受影响 |
| F2-8 | 匹配置信度 | Title 35% + Artist 30% + Album 15% + 时长差 15% + 曲目号 5%（初始权重，可调）；≥96% 自动采用，81%~95% 采用并标记，62%~80% 请求用户确认，<62% 不匹配。1.0 引入 AcoustID/ISRC/MBID 后可信度提升 | M0.5（初版）/ M1.0（完整） | 匹配结果按阈值走对应分支，用户可见确认对话框 |
| F2-9 | Metadata Cache | 在线查询结果本地缓存，避免重复请求 | M0.5 | 同一专辑二次打开不再发起网络请求 |

> 在线源决策记录：ADR-0002（仅官方 API 三件套，网易云源远期合规评估）。已知限制：MusicBrainz 华语覆盖率一般，文档如实声明，由本地 cover.jpg 发现规则部分弥补。

### F3 浏览页面与搜索

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F3-1 | 应用 Shell | 侧边栏导航：歌曲/专辑/艺术家/歌单/收藏/最近播放/设置；落地页 = Songs | M0.1 | 全部页面路由可达，无死链 |
| F3-2 | Songs 列表 | 列：封面缩略图/序号/标题/艺术家/专辑/时长/格式/比特率/采样率·位深；排序：标题/艺术家/专辑/添加时间/年份/时长/播放次数 | M0.1 | 3 万首列表虚拟滚动流畅；所有排序列可用 |
| F3-3 | Albums 网格 | 专辑封面网格 + 标题 + 艺术家；点击进专辑详情 | M0.1 | 网格按封面缓存加载，无可感知卡顿 |
| F3-4 | Artists 列表 | 艺术家头像/名称列表；点击进艺术家详情 | M0.1 | 艺术家按曲目聚合，无重复项 |
| F3-5 | 专辑详情页 | 封面、标题、艺术家、年份·曲目数、播放/随机播放按钮、按 Disc/曲目号排序的曲目表 | M0.1 | 播放按钮将专辑整轨入队 |
| F3-6 | 艺术家详情页（基础） | 头像/名称、曲目数/专辑数、全部专辑网格、全部曲目列表 | M0.1 / M0.5（丰富版：bio、热门曲目） | 数据准确（主艺人聚合口径） |
| F3-7 | 全局搜索 | 范围：Track/Artist/Album/Playlist；实现：SQLite FTS；入口：顶部搜索框，实时结果分组展示 | M0.1 | 中文/英文关键词 ≤300ms 出结果 |
| F3-8 | 搜索增强 | 拼音、模糊匹配、别名、简繁体、日文罗马音 | M1.0（可选，视排期） | 输入"qlx"可命中"七里香" |
| F3-9 | Home 首页 | 问候语 + 最近播放 + 最近添加 + 最常听专辑/艺术家 + 我的歌单 + 喜欢的音乐 | M0.5 | 落地页从 Songs 切换为 Home |

### F4 播放器核心

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F4-1 | 播放 API | play / pause / stop / seek / next / previous / setVolume / setRate / loadTrack | M0.1 | 全部 API 经播放栏与队列操作可验证 |
| F4-2 | 播放状态 | currentTrack / duration / position / playing / paused / volume / muted / playMode，UI 订阅状态渲染 | M0.1 | 播放栏实时反映状态，无丢帧不同步 |
| F4-3 | 播放栏 | 封面+标题+艺术家、收藏按钮、上一首/播放暂停/下一首、Shuffle 开关、Repeat 三态、进度条（可拖动 seek）+当前时间/总时长、音量条+静音、队列按钮 | M0.1 | 图例全部可用；进度拖动即时响应 |
| F4-4 | 音频输出 | 音量、静音；输出设备跟随系统默认（应用内设备选择/独占模式 → F11-6） | M0.1 | 系统切换默认输出设备后新播放走新设备 |
| F4-5 | Gapless 无缝播放 | 现场/古典/DJ Mix 场景曲目间无 200ms 静音 | M1.0 | 相邻曲目切换无 audible gap（波形可证） |
| F4-6 | Crossfade 交叉淡入淡出 | 可配置时长的曲目间过渡 | M1.0 | 5s crossfade 设置生效 |
| F4-7 | ReplayGain | Track/Album Gain；后期可本地分析 LUFS/True Peak 统一听感音量 | M1.0 | 两首响度差异大的曲目连播，听感音量一致 |
| F4-8 | 均衡器 EQ | 预设 + 自定义 EQ | M1.0 | EQ 开关生效可听辨 |

### F5 队列与播放模式

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F5-1 | 队列与歌单分离 | Playlist = 长期保存的集合；Queue = 当前播放会话的顺序。切歌操作的是 Queue | M0.1 | 概念在数据层与 UI 均严格分离，无交叉引用 |
| F5-2 | 上下文入队 | 双击曲目 → 所在上下文（Songs 全表/专辑/歌单/搜索结果/艺术家曲目）整体入队，从该曲开始播 | M0.1 | 在专辑页双击第 3 首，队列 = 专辑全部曲目且从第 3 首播放 |
| F5-3 | 手动队列操作 | "下一首播放"（插队到当前曲后）、"添加到队列"（尾插）、队列面板查看 | M0.1 | 插队曲播完后回到原顺序 |
| F5-4 | 队列编辑 | 队列面板内拖拽重排、删除单曲 | M0.5 | 拖拽后播放顺序即时改变 |
| F5-5 | Shuffle | 独立开关（布尔）；真随机 = 对队列洗牌成不重复序列依次播放，非每次 random()（避免 A-B-A-C-A） | M0.1 | 开启 Shuffle 播完一轮前无重复曲目；关闭后恢复原顺序 |
| F5-6 | Repeat | 独立三态：关 / 列表循环 / 单曲循环；与 Shuffle 自由组合（随机+列表循环 = 洗完一轮重洗） | M0.1 | 三态 × Shuffle 两态共 6 种组合行为全部正确 |

### F6 收藏与歌单

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F6-1 | 喜欢的歌曲 | 任意入口 ♡→♥；"喜欢的音乐"自动歌单，支持按添加时间/歌手/专辑/歌曲名/播放次数排序 | M0.1 | 收藏状态全局同步（列表/播放栏/详情页） |
| F6-2 | 收藏建模 | MVP：Track.favorite 布尔字段；"喜欢专辑/艺术家"出现时再拆 Favorite(entityType, entityId) 实体表 | M0.1 | 布尔字段方案，无多余表 |
| F6-3 | 自建歌单 | 新建/删除/重命名/添加歌曲/移除歌曲/拖拽排序；封面 = 前 4 首封面自动拼贴（无上传）；描述字段建表预留、无编辑 UI | M0.1 | 200 首歌单内拖拽排序持久化 |
| F6-4 | 歌单增强 | 多选批量加入歌单、描述编辑、封面上传 | M0.5 | 多选 50 首一次入歌单 |
| F6-5 | 智能歌单 | 条件规则自动生成（最近添加/播放最多/从未播放/最常听歌手/年份区间/FLAC Only/Hi-Res/Rating≥4），本质为保存的查询 | M0.5 | 建规则后歌单内容随曲库变化自动更新 |
| F6-6 | M3U 导入导出 | 与 foobar/MusicBee 互操作 | M1.0（可选） | 导出 M3U 在foobar2000 可播放 |

### F7 播放历史与最近播放

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F7-1 | 播放计数口径 | 每次 loadTrack（加载播放）即计：playCount+1 并写一条 PlayHistory；同曲内暂停恢复、进度拖动不重复计数 | M0.1 | 同一曲暂停 10 次恢复，playCount 仅 +1 |
| F7-2 | 最近播放 | 按 PlayHistory 聚合，曲目去重（重复播放保留最新一条），展示封面/标题/艺术家/时间 | M0.1 | 重复播放同一首只占一行 |
| F7-3 | PlayHistory 记录 | trackId / playedAt / playedDuration / completed，为统计与推荐提前收集 | M0.1 | 历史表可查询任意一天的播放记录 |
| F7-4 | 统计与年度报告 | 常听歌曲/艺术家、年度报告、听歌画像 | M2.0 | 年度报告数据与 PlayHistory 一致 |

### F8 设置

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F8-1 | 设置页框架 | 分区：General / Library / Playback / About（MVP）；Metadata / Appearance / Cache 分区随版本补齐 | M0.1 | 设置修改即时生效并持久化 |
| F8-2 | Library 设置 | 音乐目录管理（F1-1）、启动自动扫描开关（F1-5）、手动全量重扫入口 | M0.1 | 见 F1 验收 |
| F8-3 | Metadata 设置 | 自动补全开关、自动取封面开关、优先本地数据开关、各 Provider 启停（MusicBrainz/Last.fm） | M0.5 | 关闭 Provider 后不再发起对应请求 |
| F8-4 | 缓存管理 | 封面/Metadata 缓存目录与清理 | M0.5 | 清理后功能不受损（自动重建） |

### F9 在线 Metadata 增强（0.5 主体）

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F9-1 | Provider 架构 | MetadataService + Provider 接口，MusicBrainz/CAA/Last.fm 为首批实现；后续加 Provider 不改核心 | M0.5 | 新增一个 stub Provider 无需改动 Library 核心 |
| F9-2 | 补全流程 | 发现缺失信息 → 查询 → 置信度匹配（F2-8）→ 按阈值采用/确认/放弃 → 写库带 provenance | M0.5 | 断网时流程优雅降级，不阻塞本地功能 |
| F9-3 | 外部 ID 保存 | musicBrainzRecordingId / ReleaseId / ArtistId 作为跨 Provider 公共 ID；AcoustID、ISRC 预留字段 | M0.5 | MBID 入库可在详情页查证 |
| F9-4 | 网易云等国内源 | 远期可选项，先评估接口合规性与稳定性再决策 | 远期 | — |

### F10 歌词

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F10-1 | 本地歌词双源 | 内嵌歌词 + 同名 .lrc 文件（同目录、同名匹配），LRC 时间轴滚动展示，LyricsService 独立模块 | M0.5 | .lrc 文件歌词随播放逐行高亮 |
| F10-2 | Now Playing 沉浸页 | 大封面 + 标题 + 歌词；背景 = 封面主色提取 + Blur + 渐变 | M0.5 | 播放栏点击封面进入沉浸页 |
| F10-3 | 在线歌词 | LRCLIB 等免费歌词源 | M1.0（可选） | 无本地歌词时自动联网补 |

### F11 音频高级与格式扩展（1.0 主体）

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F11-1 | FFmpeg 格式兜底 | APE/WMA/AIFF/DSF/DFF/WV/TTA/AC3/MKA 播放兑现（转码或解码流） | M0.5 | F1-3 标记不可播的文件恢复可播 |
| F11-2 | 声纹识别 | Chromaprint 客户端指纹 → AcoustID Web Service → MusicBrainz 实体；无标签文件自动识别（差异化核心能力） | M1.0 | Track01.flac 识别为正确曲名/艺术家/专辑 |
| F11-3 | Match Engine | F2-8 置信度完整实现 + AcoustID/ISRC/MBID 加权 | M1.0 | 匹配报告可审计 |
| F11-4 | Metadata 来源管理 UI | 查看每条信息来源、按来源优先级解决冲突、用户编辑最高优先 | M1.0 | 用户改过的字段不被任何 Provider 覆盖 |
| F11-5 | CUE 整轨分轨 | 读取 .cue 生成虚拟 Track（时间偏移切分）；1.0 评估实现 | M1.0（评估） | 整轨 FLAC+CUE 显示为 N 首独立曲目 |
| F11-6 | 输出设备控制 | 应用内音频设备选择、Exclusive Mode | M1.0 | 应用内切换输出设备即时生效 |

### F12 智能化（2.0 主体）

| 编号 | 需求 | 细节规则 | 版本 | 验收标准 |
|---|---|---|---|---|
| F12-1 | 数据基础 | playCount / skipCount（由 PlayHistory.completed 推导）/ favorite / lastPlayed / rating / genre / artist 字段自 M0.1 起收集 | M0.1（数据）/ M2.0（应用） | 历史数据完整可查 |
| F12-2 | 推荐能力 | 猜你喜欢、最近常听、很久没听、相似歌曲、Daily Mix、自动歌单 | M2.0 | 推荐结果可解释（基于行为数据） |
| F12-3 | Audio Embedding | 音频特征向量 + 用户偏好向量，本地相似度推荐 | M2.0 | 相似歌曲可试听验证合理性 |
| F12-4 | 云同步 | 多设备库同步 | 远期可选 | — |

---

## 4. 数据模型

存储：SQLite 单文件数据库。实体与关键字段如下（字段清单为需求级约定，具体 DDL 由设计阶段产出）：

| 实体 | 关键字段 | 说明 |
|---|---|---|
| Track | id, title, artistId, albumId, albumArtist, trackNumber, discNumber, year, genre, duration, filePath, fileSize, format, codec, bitrate, sampleRate, bitDepth, channels, coverId, musicBrainzId, acoustId, dateAdded, lastPlayedAt, playCount, favorite, rating, status(available/missing/ignored), createdAt, updatedAt | status 为本次修订新增；原始艺术家字符串完整保留 |
| Artist | id, name, sortName, avatar, background, musicBrainzId, description, trackCount, albumCount | |
| Album | id, title, artistId, year, genre, coverId, musicBrainzId, discCount, trackCount | 分组键 = 专辑名 + albumArtist |
| Playlist | id, name, description, cover, createdAt, updatedAt | cover 为自动拼贴 |
| PlaylistTrack | playlistId, trackId, position, addedAt | 解决 Playlist N:N Track |
| PlayHistory | id, trackId, playedAt, playedDuration, completed | completed 服务于 skip 分析 |
| LibraryFolder | id, path, enabled, recursive, lastScanAt | |
| Favorite | （M2.0 前不建表，用 Track.favorite） | 拆表时迁移成本低（一条 INSERT SELECT） |

关键策略（均经确认）：

1. **Track 稳定 ID**：UUID，首次扫描分配；重扫时以"文件名+大小+mtime"三元组匹配新路径，命中视为移动、保留原 ID。禁止用路径做 ID。
2. **多艺术家**：MVP 单主艺人（artistId）+ 完整保留原始 artist 字符串（含 feat.）；TrackArtist 多对多关联表（含 main/feat 角色）1.0 建、回填。
3. **Provenance**：关键字段（title/artist/album/cover/year/genre）记录来源 embedded / folder / network / filename / user，用户编辑最高优先。
4. **外部 ID 预留**：MBID / AcoustID / ISRC 字段 M0.1 建表即预留。
5. **专辑归组**：album + albumArtist 组合键，避免不同艺术家同名专辑混编。

架构边界（六条，违反即架构事故）：

```
UI ≠ Player        Player ≠ Queue      Queue ≠ Playlist
Track ≠ File       Metadata ≠ Track    Remote Metadata ≠ Local Library
```

模块分层：UI → Application 层（Library / Player / Playlist / Metadata / Queue / Favorite Service + Scanner）→ Infrastructure（SQLite / 文件系统 / AudioEngine / FFmpeg / MusicBrainz / AcoustID / CAA）。UI 不知道 FFmpeg，播放器不知道 MusicBrainz，Metadata 系统不知道 Playlist。

---

## 5. 非功能需求

### 5.1 性能与容量指标（可验收）

| 指标 | 目标值 | 验证方式 |
|---|---|---|
| 设计容量 | 30,000 曲（超出不保证体验但不崩溃） | 构造 3 万文件样本库 |
| 首次全量扫描（含标签解析） | ≤ 5 分钟 / 3 万首 | 计时日志 |
| 启动到可交互 | ≤ 3 秒 | 计时 |
| 启动增量扫描 | ≤ 10 秒 | 计时日志 |
| 搜索出结果 | ≤ 300ms | FTS 查询计时 |
| 空库内存占用 | ≤ 500MB | 任务管理器 |
| 切歌起音 | ≤ 500ms | 操作计时 |

### 5.2 可靠性

- 扫描单文件失败不中断整体（F1-7）。
- 数据库损坏：引导用户重建库（重新扫描恢复），收藏/歌单随库丢失为已接受风险（无云同步）。
- missing 状态保护移动硬盘场景（F1-6）。

### 5.3 数据安全

- 全部数据本地存储（数据库 + 缓存目录），无上传、无遥测。
- 不涉及密码/账号，无明文密码问题域。

### 5.4 兼容性

- 操作系统：Windows 10/11 x64（MVP 唯一发布平台；代码禁止平台死锁，保留扩展 macOS/Linux 可能）。
- Hi-Res 指标（24bit/96kHz、DSD 等）在 Songs 列表与详情页正确展示。

### 5.5 界面语言

- 多语言架构自 M0.1 起：每种语言一个独立资源文件，程序运行时从文件读取文案，支持多语言切换。
- M0.1 交付中文资源；英文资源文件 0.5 补齐。

---

## 6. 技术与实现约束

| 约束 | 内容 | 依据 |
|---|---|---|
| 框架 | Electron + TypeScript | ADR-0001 |
| 数据库 | SQLite（单文件、零运维、FTS） | ADR-0001 |
| 音频管道 | Chromium 媒体管道为主；Chromium 不支持的格式由 FFmpeg 兜底（M0.5 起） | ADR-0001 |
| 解码边界 | 原生：MP3/FLAC/WAV/OGG/OPUS/M4A(AAC/ALAC)；不可播（待 FFmpeg）：APE/WMA/AIFF/DSF/DFF/WV/TTA/AC3/MKA | F1-3 |
| 音频后端 | WASAPI 共享模式（跟随系统默认输出）；独占模式 1.0 评估 | F4-4/F11-6 |
| 平台 | Windows 10/11 x64 优先，不锁死跨平台 | ADR-0001 |
| 打包体积 | 预期 ≤ 200MB（M0.1，无 FFmpeg）；FFmpeg 引入后约 +100MB | — |

已知技术风险：Electron 内 bit-perfect/独占输出路径受限，1.0 若强需独占模式可能引入原生模块；APE 实时转码有音质路径争议，兜底方案以"可播"为第一目标。

---

## 7. 版本路线图

| 版本 | 主题 | 包含 |
|---|---|---|
| 0.1 | 可日常使用的本地播放器 | F1-1~7、F2-1~6、F3-1~7、F4-1~4、F5-1~3/5/6、F6-1~3、F7-1~3、F8-1~2 + 完整数据模型 + 性能指标 |
| 0.5 | 在线补全 + 体验补齐 | F1-8、F2-7~9、F3-9、F5-4、F6-4~5、F8-3~4、F9-1~3、F10-1~2、F11-1、英文资源 |
| 1.0 | 智能识别 + 音频高级 | F2-8 完整、F3-8（可选）、F4-5~8、F6-6（可选）、F10-3（可选）、F11-2~6、TrackArtist 回填 |
| 2.0 | 智能化 | F7-4、F12-1~3 |
| 远期 | — | F9-4 网易云源评估、F12-4 云同步 |

排序原则（承自初版）：简单 + 高收益 + 高解耦 优先，复杂 + 强耦合（音频 DSP、推荐引擎、云同步）殿后。

---

## 8. 已知限制（MVP 发布时如实告知用户）

1. APE/WMA/AIFF/DSF 等格式入库但不可播，0.5 恢复。
2. 无歌词（0.5 提供本地双源）。
3. 无在线 Metadata/封面补全（0.5 提供官方三件套）。
4. CUE 整轨按单曲目入库，不做分轨（1.0 评估）。
5. 无标签曲目显示文件名原样，无文件名智能解析（0.5 联网补全优先）。
6. 应用内无输出设备选择（跟随系统，1.0 提供）。
7. 超过 3 万首曲库不承诺性能指标。
8. 数据库损坏时收藏/歌单不可恢复（无云同步）。

---

## 9. 术语与决策索引

- 领域术语表：CONTEXT.md（曲目/艺术家/专辑/歌单/播放队列/播放过一次/曲目状态/不可播曲目/智能歌单等）。
- ADR-0001：Electron + TypeScript + SQLite，Windows 优先。
- ADR-0002：在线源仅官方 API 三件套。
- ADR-0003：Local First 产品边界。

---

## 附录 A. 相对 primalreport 的修订对照

| # | 条目 | 初版方案 | 修订结果 | 原因 |
|---|---|---|---|---|
| 1 | 目标用户 | 未定义 | 大众为主兼顾发烧友 | 产品定位需要明确画像 |
| 2 | 目标平台 | 未定义 | Windows 优先、不锁死跨平台 | 开发环境与用户主体 |
| 3 | 技术栈 | 未定义 | Electron + TS + SQLite | ADR-0001 |
| 4 | 产品边界 | 隐含 | 显式：Local First/无流媒体/无账号/无云/无遥测 | ADR-0003 |
| 5 | 版本路线 | 0.1→0.5→1.0→2.0 | 维持 | 分层合理 |
| 6 | Track 稳定 ID | 仅"不能用路径" | UUID + 三元组移动启发式 | 具体化 |
| 7 | 多艺术家 | 未定义 | 单主艺人 + 保留原串；多对多 1.0 | 平衡 MVP 工期与准确性 |
| 8 | 收藏建模 | 字段优先、后期拆实体 | 维持（MVP 布尔字段） | 迁移成本低 |
| 9 | 播放计数口径 | 未定义 | loadTrack 即计（点击即计） | 产品负责人选择，实现最简 |
| 10 | 歌单 MVP 范围 | 含描述编辑/封面上传 | 极简 + 自动拼贴封面；描述仅预留 | 砍 MVP 工期 |
| 11 | 音频格式 | 11 种全部支持 | 原生集可播 + 不可播标记；FFmpeg 0.5 兑现 | Chromium 解码边界 |
| 12 | 扫描触发 | 未定义 | 启动增量（可关）+ 手动全量；Watcher 0.5 | 无感体验 |
| 13 | 无标签命名回退 | 文件名解析排网络后，位置模糊 | 维持原序；MVP 显示文件名原样不解析 | 维持初版优先级设计 |
| 14 | 在线源 | 未定中文方案 | 官方三件套；网易云远期合规评估 | ADR-0002 |
| 15 | 队列操作 | 仅上下文自动生成 | + 插队/尾插/队列面板；重排 0.5 | 对齐主流产品心智 |
| 16 | 播放模式 | 四态枚举 | Shuffle 布尔 × Repeat 三态独立组合 | 表达"随机+循环" |
| 17 | 输出设备 | MVP 含系统输出设备 | 砍出 MVP，1.0 应用内选择 | Electron 无干净 API |
| 18 | MVP 页面矛盾 | 44 节含 Albums/Artists、45 节 0.5 又含 Artist/Album Page | 基础详情页进 MVP；Home 与丰富版 0.5 | 消除矛盾 |
| 19 | 歌词 | 来源未拆版本 | 0.5 本地双源；在线 1.0 可选 | 拆分工期 |
| 20 | 性能指标 | 仅"30,000 Tracks" | 七项量化指标 | 可验收 |
| 21 | 界面语言 | 未定义 | 每语言独立资源文件、运行时读取、多语言架构；中文首发 | i18n 架构先行 |
| 22 | CUE 整轨 | 未提及 | 显式后置 1.0，MVP 已知限制 | 控制工期 |
| 23 | 遥测 | 未提及 | 显式无遥测 | 边界显式化 |

---

## 附录 B. 需求确认记录

- 2026-09-09：产品负责人对上述 23 项修订逐项确认，版本范围清单（0.1/0.5/1.0/2.0）整体确认通过。
- 本文档为需求阶段产物，不含实施计划；实施计划另行编制。
