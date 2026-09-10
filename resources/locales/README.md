# resources/locales —— i18n 语言资源（T3.5）

## 文件约定

- 每语言一个 `*.json`，文件名 = BCP-47 语言标签（当前仅 `zh-CN.json`，M0.1 单语言）。
- **扁平点号 key**（`nav.songs` / `player.play`），不支持嵌套——main 侧 `i18n:getMessages`
  原样 JSON.parse 后透传，renderer 侧 `t(key)` 直接查表。
- 值一律为 string；插值占位符用 `{name}` 形态（renderer `t(key, params)` 替换）。

## 分区约定（前缀 → 用途）

| 前缀 | 用途（对应计划 §3.7） |
| --- | --- |
| `app.*` / `common.*` | 应用名与通用按钮（确认/取消/删除/重命名/返回） |
| `nav.*` | 侧栏导航七项 + 侧栏歌单区（新建歌单） |
| `search.*` | 顶栏搜索框占位、结果分组标题、无结果 |
| `page.*` | 非导航页标题（专辑/艺术家/歌单详情、搜索结果页）；Songs 等导航页标题复用 `nav.*` |
| `songs.*` / `albums.*` / `albumDetail.*` / `artists.*` / `artistDetail.*` | 列表列名、排序项、详情页动作（播放/随机播放）与计数 |
| `playlists.*` / `playlistDetail.*` | 歌单 CRUD（新建/重命名/删除确认/拖拽）与详情页操作 |
| `track.*` | 曲目行状态：文件缺失灰标、不可播 tooltip、收藏切换 |
| `menu.*` | 曲目右键菜单（下一首播放/添加到队列/收藏/添加到歌单子菜单等） |
| `empty.*` | 空态：无目录引导、 Songs/收藏/最近/歌单/搜索空态 |
| `player.*` / `queue.*` | 播放栏控件（播放/暂停/上下首/音量/静音/循环/洗牌）与队列面板 |
| `hires.*` | Hi-Res 指标标签（格式/比特率/采样率/位深） |
| `settings.*` | 设置页四分区 General/Library/Playback/About 及各控制项 |
| `toast.*` | 操作反馈（扫描完成/目录与歌单变更/收藏与队列变更） |

## 运行时读取路径

- 开发态：`process.cwd()/resources/locales`；打包态：`process.resourcesPath/locales`
  （electron-builder `extraResources` 同步，见计划 §3.8）。
