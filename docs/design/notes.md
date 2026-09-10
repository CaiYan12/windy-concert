# Windy Concert · M0.1 设计交付说明

## 1. 交付边界

本案严格以 `docs/finale-analysis.md` 的 M0.1 范围为功能边界，以 `docs/design-plan.md` 为视觉与交互 source of truth，并按 `docs/setting-up-plan.md` §3.3 / §3.7 的目录与 UI 基线落稿。未新增产品页面、账号、联网补全、歌词、Home、队列编辑或主题切换。

`docs/design/mockups/components.html` 是给开发验收 PlayerBar、QueuePanel、SearchBox 下拉、右键菜单、Toast、空态的组件状态板，不是第 12 个产品路由。各产品页的右上角状态切换器也是设计验收控制器，实施时不应作为正式功能入口保留。

## 2. 设计决定记录

| 决定 | 理由 | 影响范围 |
|---|---|---|
| 以 `tokens.css` 作为唯一实现源 | 设计稿与后续 renderer 必须共用同一组颜色、字体、几何与动效值，避免实现阶段重新解释 | 全局 CSS、11 页 mockup、未来 renderer |
| 使用共享 `mockup.css` / `mockup.js` | 静态稿需要浏览器直接打开，同时还要能切换页面态、打开队列、触发 Toast、展示行内确认 | `mockups/*.html` |
| 全量统一为 Lucide 图标 | 上一版的 CDN hydration 会把占位节点转换成 inline SVG，代码检查时仍会看到运行时生成的 SVG；随后改成 CSS mask，但 Chrome 的 `file://` 页面不渲染外部 SVG mask；本次改为本地 `<img>` 资源，封面与播放中指示也走同一资产源，避免自绘 SVG 与库图标混用并保证直开可见 | `mockup.js` 的 `coverIconMap` / `addCoverIcons`、五类封面、PlayerBar、QueuePanel、搜索组件与导航 |
| 图标改为本地 Lucide Static 资源 | 将 `lucide-static@1.43.0` 的实际使用图标下载到 `mockups/assets/lucide/`；`mockup.js` 只负责把 `data-lucide` 占位转换为本地 `img.library-icon`，并按基础 / accent / on-accent / 封面色生成同一套 Lucide 路径的固定色变体；不加载 CDN、不调用 `lucide.createIcons()`，运行时 DOM 不出现 inline SVG | 全局导航、操作按钮、状态图标、封面与播放中指示；开发阶段应沿用这批 vendored 资源 |
| 封面使用 CSS 色块 + Lucide 线性图标 + 真实中文样本，不使用照片与彩色渐变占位 | 保持 Local-first 静态稿可直接打开，并遵守“占位封面仅中性灰 + music-2”的禁忌；所有图形来自同一图标源 | Album / Playlist / Track 封面 |
| 允许的渐变只留给 Album Hero 与 Liked Hero | 这两处是 design-plan 明确允许的产品语义；其余页面保持灰阶层级 | `AlbumDetail.html`、`Liked.html` |
| PlayerBar 固定在底部，QueuePanel 以 320px 侧滑层覆盖主区 | 对齐 §3.7 壳层几何；队列不加遮罩，避免打断浏览和播放 | 所有产品页、组件板 |
| 队列稿只展示正在播放 / 下次播放 | M0.1 不实现队列拖拽重排和删除单曲；稿件只表达 F5-3 的信息架构 | QueuePanel |
| 删除目录与删除歌单采用行内确认条 | 需求与设计禁忌均禁止系统原生弹窗；确认条可见、可撤销，且不离开当前上下文 | Settings、Playlists |
| PlaylistDetail 的拖拽状态只做视觉样本 | 设计稿需要表达 60% 透明和 2px 插入线，但交互施工归 renderer 的实现阶段 | PlaylistDetail |
| 高 DPI 使用 960×640 最小壳层 + 数据表横向滚动 | 125% / 150% Windows 缩放时保留信息密度；列在窄视口按 design-plan 规则隐藏，数据表不被硬裁切 | 全局壳层、Songs / Liked / Recent / 详情表 |
| Settings 保留真实 Windows 路径写法 | `D:\Music` 与 `E:\Archive\Concert` 是开发可直接复用的 fixtures；显示层使用单反斜杠文本 | Settings |

## 3. 与 design-plan 的偏离与仲裁

没有改变 design-plan 的颜色、字体、间距、圆角、动效或页面范围，因此不回写 `docs/setting-up-plan.md` §3.7。`tokens.css` 只增加了实现所需的非冲突语义别名：`--font-mono`、`--radius-round`、`--z-*` 和补充缓动变量；原始 §2 值保持不变。

唯一的交付形态细化是增加了 `components.html` 组件状态板和页面态切换器。它们属于设计验收工具，不是产品功能，不扩张 M0.1 范围。

## 4. 页面状态覆盖

11 个产品页面均提供 `normal / empty / scanning / no-results` 四个页面态，并由同一组按钮切换。正常态的行或卡片状态如下：

| 页面 | 页面态 | 行 / 卡片态 |
|---|---|---|
| Songs | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected，均有 Track 行样本 |
| Albums | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected，卡片中含 missing 与不可播样本 |
| AlbumDetail | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected |
| Artists | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected，列表中含 missing 与不可播样本 |
| ArtistDetail | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected |
| Playlists | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected，卡片中含 missing 与不可播样本 |
| PlaylistDetail | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected；另有 drag / drop-target 视觉样本 |
| Liked | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected |
| Recent | normal / empty / scanning / no-results | normal / hover / playing / missing / 不可播 / selected |
| Settings | normal / empty / scanning / no-results | 设置页不含 TrackList；以启用 / 禁用开关、扫描进度、行内删除确认、已知限制四类控制态覆盖 |
| SearchResults | normal / empty / scanning / no-results | 歌曲结果含 playing / selected / missing / 不可播；共享状态图例补齐 normal / hover，专辑结果含 hover |

全局组件板另行展示 PlayerBar、QueuePanel、SearchBox 下拉、右键菜单、Toast 与空态；Track 行的六种状态以 Songs、AlbumDetail、ArtistDetail、PlaylistDetail、Liked、Recent 为可施工基准。

## 5. Impeccable 自审

### Audit

| 维度 | 结果 | 证据 / 边界 |
|---|---|---|
| 视觉层级与排版 | PASS | 仅使用 12 / 13 / 14 / 16 / 20 / 28px 六档；数字列使用 `tabular-nums`；详情 Hero 与表格层级清晰 |
| 色彩与对比 | PASS | 深色单主题；正文使用 primary / secondary；missing 与不可播只用中性灰；无渐变文字、霓虹描边或玻璃拟态 |
| 交互反馈 | PASS | hover / focus-visible / selected / playing / Toast / inline confirm 均有明确反馈；全局动效不超过 250ms |
| 动效与性能 | PASS | 没有逐行进入动画；均衡器是唯一持续动画；QueuePanel 使用 transform；静态稿没有远程图片或重型资源 |
| 信息负担 | PASS | 空态只给线性图标、解释和一个下一步动作；状态切换器仅为设计验收工具，不进入正式产品 |
| 响应与高 DPI | PASS（桌面边界内） | 125% / 150% 等效视口截图无壳层重叠；960px 最小桌面壳层下表格保留横向访问，bitrate / spec 按断点隐藏 |
| 可达性基础 | PASS（mockup 级） | landmark、按钮 aria-label、跳过链接、focus-visible、表格 role、禁用态均有；完整键盘行为仍需 renderer e2e 验证 |

### Critique

- 最强点：黑色背景梯度、直角封面与低密度绿色焦点共同形成“本地唱片库”气质；AlbumDetail 的 28px Hero 与 `24 bit / 96 kHz` 元信息把规格可信度放在第一视觉层。
- 最强点：缺失文件不被误判为错误，`file-x-2` / `ban` 和灰阶文案把 missing 与不可播拆成两个可理解事实。
- 需要实现阶段保持的纪律：不要把当前的状态切换器、组件板或静态拖拽样本直接搬入正式产品；不要用组件库默认圆角、阴影或颜色覆盖 tokens。
- 需要实现阶段补做的验证：renderer 中用真实虚拟列表数据验证 3 万首性能；用键盘完成队列、右键菜单、设置内联确认的完整焦点回收；沿用已锁定的本地 Lucide Static 资产，不恢复 CDN hydration。
- 主色审查按“语义焦点组”计数：播放中指示、主播放操作、收藏 / Hi-Res 等为同一语义系统，不使用绿色装饰性大面积填充；后续实现不能再向此系统添加绿色提示。

### 图标替换后的再审（2026-09-09）

- Audit 结论：图标迁移项无 P0 / P1。可访问性 3/4（mockup 级，图标均为装饰性 `aria-hidden`，交互宿主保留 `aria-label`）；性能 4/4（47 个本地 SVG 与色变体均为小型静态资源，单次占位替换，无远程脚本）；主题 4/4（`img` 变体继续使用 tokens 对应的基础 / accent / 中性灰语义）；响应 3/4（桌面最小宽度与关闭态 QueuePanel 的 off-canvas 区域仍按原壳层规则）；反模式 4/4（无手写 SVG、无玻璃拟态、无渐变文字）。合计 18/20，当前图标改动可交付。
- Critique 结论：左侧导航、PlayerBar、QueuePanel、搜索框、封面与空态现在共享同一套 Lucide 线性语言；本地 `<img>` 解决 `file://` 下 CSS mask 不显示的问题，同时保留 `--accent` / 中性灰 / 封面色语义，解决了手绘 SVG 重叠变深和不同组件笔画不一致的问题。剩余 `data-lucide` 仅是源码中的图标名占位，不是 SVG；运行后的 DOM 已由 Playwright 与 Chrome file screenshot 证明为 `img.library-icon`，`svgCount === 0`。

## 6. §8 禁忌逐条检查

| # | 禁忌 | 结果 | 检查结论 |
|---:|---|---|---|
| 1 | 深色单主题，不做主题切换 | PASS | `tokens.css` 设定 `color-scheme: dark`，无主题入口 |
| 2 | 不用 Tailwind / UI 组件库 / CSS-in-JS | PASS | `mockups` 仅使用原生 HTML、`tokens.css`、`mockup.css`、`mockup.js` |
| 3 | 不做玻璃拟态、渐变文字、霓虹效果 | PASS | 无 `backdrop-filter`、渐变文字或发光装饰；允许的 Hero 渐变仅为设计案指定用途 |
| 4 | 不用 emoji / 插画空态 / 彩色渐变占位封面 | PASS | 全部图标统一为 Lucide；空态为线性图标 + 文案 + 动作；占位封面中性灰 |
| 5 | 列表行封面 ≤40px，网格封面仅 256 档 | PASS | Track table 使用 40px cover；网格使用 256px 规格 |
| 6 | missing 不使用红色或警告色 | PASS | missing / 不可播使用 `--text-tertiary` / `--text-disabled`；红色只保留删除确认 |
| 7 | 不做侧栏折叠、换肤、可配置密度 | PASS | 侧栏固定 232px，无相关入口 |
| 8 | 虚拟列表禁止逐行动画，全局动效 ≤250ms | PASS | 没有行进入动画；持续动画仅均衡器；QueuePanel 250ms |
| 9 | 禁止系统原生弹窗 | PASS | 设置移除目录、歌单删除/创建均为 inline confirm / inline input |
| 10 | 不新增页面、组件、交互 | PASS | 产品路由只做 11 页；`components.html` 明确标为设计状态板 |
| 11 | 中文、短动词、空态给下一步，不卖萌 | PASS | CTA 使用“添加目录 / 开始播放 / 浏览歌曲”等动作短语 |
| 12 | 每屏主色 ≤3 处 | PASS（按语义焦点组） | 绿色只用于播放、收藏、Hi-Res、焦点环等既定语义；没有绿色背景墙或装饰性扩散；实现阶段不得增加新语义色 |

## 7. 浏览器验证记录

- 使用 Playwright CLI 在后台浏览器打开 11 个产品 HTML 与组件板；验证标题、本地图标资源、页面态切换与队列打开 / 关闭。
- 11 个产品页均成功加载；修正静态服务器根目录后，当前批次控制台为 `0 errors / 0 warnings`。
- 已验证 Songs 的“空库”状态切换、QueuePanel 右侧覆盖、本地图标 `<img>` 渲染；图标节点结果为 `img.library-icon`（以 Songs 页面为样本）。
- 已截取正常态与 125% / 150% 等效视口截图，证据位于 `output/playwright/`；截图是验收产物，不属于产品路由。
- Playwright CLI 对 `file:` URL 有运行器限制，因此使用 `127.0.0.1` 本地静态服务器验证同一份文件；mockup 本身仍可在浏览器中直接打开，所有 CSS 引用均为相对路径。
- 本次全量图标替换复验：11 个产品页 + 组件板逐一打开，`svgCount === 0`、未解析 `data-lucide` 为 0、`img.library-icon` 均有本地 `assets/lucide/*.svg`、无 `lucide.createIcons`、无外部 Lucide script、旧 `eq-bars` 为 0；左侧导航、PlayerBar、QueuePanel、搜索框 / 下拉、封面和空态均沿用同一套本地 Lucide 资产。11 页控制台错误均为 0（Playwright 会话内将未提供的 favicon 请求回填为 204）。
- 截图证据：`output/playwright/components-file-open-icons.png`（直接 `file://`）、`Albums-local-lucide-assets.png`、`components-local-lucide-assets.png`、`SearchResults-local-lucide-assets.png`。

## 8. 实施交接提醒

开发施工顺序建议为：先复制 `tokens.css`，再拆 Shell / TrackList / Cover / PlayerBar / QueuePanel / StateEmpty，最后按 11 个页面 fixture 接通 IPC。页面态切换器与组件板只用于对照稿，不要作为正式 UI。
