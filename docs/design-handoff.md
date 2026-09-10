# Windy Concert · M0.1 Design Agent Handoff

## Status

**READY FOR RENDERER IMPLEMENTATION｜当前设计产物可作为 M0.1 交付物。**

设计范围锁定在 `docs/finale-analysis.md` 的 11 个产品页面，设计语言、页面规格和状态矩阵按 `docs/design-plan.md` 执行，工程目录与 UI 实现基线按 `docs/setting-up-plan.md` §3.3 / §3.7 对齐。

本轮图标问题已经收口：所有展示用图标统一使用本地锁定的 `lucide-static@1.43.0` SVG 资产，并由 `mockup.js` 以 `<img class="library-icon">` 加载；不再依赖 CDN、运行时 SVG hydration、CSS mask 或 HTML 内联自绘 SVG。直接打开 `file://` 页面也已验证可见。

## Source of truth

- `docs/design/tokens.css`：renderer 可直接复用的颜色、字体、间距、圆角、几何、阴影和动效 tokens。
- `docs/design/mockups/mockup.css`：静态稿共享壳层、表格、卡片、Hero、播放栏、队列和反馈样式。
- `docs/design/mockups/mockup.js`：仅用于设计验收的状态切换、Toast、队列、收藏、选择和行内输入演示；不得直接作为正式产品业务逻辑。
- `docs/design/mockups/assets/lucide/`：本地 Lucide 图标资产唯一来源，共 47 个 SVG（35 个基础图标 + 12 个语义 / 封面变体）。
- `docs/design/notes.md`：设计决定、偏离说明、页面状态矩阵、Impeccable audit / critique 与 §8 checklist。
- `docs/design/icons.md`：最终图标映射、尺寸、颜色 token 与本地资产规则。

## Delivered files

11 个产品页：

`Songs.html`、`Albums.html`、`AlbumDetail.html`、`Artists.html`、`ArtistDetail.html`、`Playlists.html`、`PlaylistDetail.html`、`Liked.html`、`Recent.html`、`Settings.html`、`SearchResults.html`。

额外的 `components.html` 是共享组件状态板，不是产品路由；它覆盖 `PlayerBar`、`QueuePanel`、`SearchBox` 下拉、右键菜单、Toast 和空态等全局组件。`icons.md` 是最终图标映射表；`mockups/assets/lucide/` 是本地锁定的 Lucide Static 图标资产。

## Verification

- 12 个 HTML 页面（11 个产品页 + `components.html`）已完成批量复验。
- 每页的本地图标 `<img class="library-icon">` 均已加载成功，`naturalWidth > 0`；复验未发现缺失本地图标资产。
- 批量结果：`inlineSvg = 0`、未解析 `data-lucide = 0`、外部 Lucide script = `0`、控制台错误 = `0`。
- 已操作验证 Songs 的“空库”页面态、QueuePanel 打开 / 关闭，以及本地图标加载；运行时 DOM 使用 `img.library-icon`，不生成 inline SVG。
- 已用 Chrome 直接打开 `file:///D:/Dev/windy-concert/docs/design/mockups/components.html` 并确认图标可见，证据截图为 [components-file-open-icons.png](D:/Dev/windy-concert/output/playwright/components-file-open-icons.png)。
- HTTP 复核截图为 [components-local-lucide-assets.png](D:/Dev/windy-concert/output/playwright/components-local-lucide-assets.png)、[Albums-local-lucide-assets.png](D:/Dev/windy-concert/output/playwright/Albums-local-lucide-assets.png)、[SearchResults-local-lucide-assets.png](D:/Dev/windy-concert/output/playwright/SearchResults-local-lucide-assets.png)。
- 静态稿没有构建步骤。Playwright 的 `open` 运行器不接受 `file:` URL，因此 HTTP 批量验证使用 `127.0.0.1` 静态服务器；`file://` 兼容性另由 Chrome 直开截图单独验证。
- 状态矩阵、§8 禁忌 checklist、Impeccable audit / critique 的结果已记录在 `docs/design/notes.md`；当前交付不需要返工图标设计。

## Leader Agent next steps

1. 先阅读 `docs/finale-analysis.md`、`docs/design-plan.md`、`docs/setting-up-plan.md` §3.3 / §3.7、`docs/design/notes.md`、`docs/design/icons.md` 和本交接文档，再开始 renderer 施工。
2. 锁定并复用 `docs/design/tokens.css`；不要在 renderer 中重新定义颜色、字体、间距、圆角或动效变量。
3. 按 `setting-up-plan.md` Phase 4 → 5 → 6 → 7 拆出 Shell、TrackList、Cover、PlayerBar、QueuePanel、空态和 Settings 控件；以 `docs/design/mockups/` 作为视觉基线。
4. 使用本地 `docs/design/mockups/assets/lucide/` 资产及 `img.library-icon` 对应的本地资源策略；不要恢复 CDN hydration、CSS mask 或手写 inline SVG，保证 Local-first 无网络启动。
5. 用真实 IPC / SQLite / 虚拟列表替换静态 fixture，保留页面态与行级态语义；不要把 `components.html` 或页面状态切换器带入正式产品功能。
6. 施工后的偏离或必要取舍写入 `docs/design/notes.md`，并重新执行 Impeccable audit / critique、125% / 150% 高 DPI、键盘焦点、3 万首虚拟列表、播放 / 队列 e2e 与控制台无报错验证。

## Suggested skills

- `design-flow`：按当前 renderer 阶段动态调度设计与验证技能。
- `frontend-design`：实现阶段保持字体层级、反馈和信息密度纪律。
- `frontend-ui-engineering`：将静态稿拆为可维护的 renderer 组件与交互状态。
- `impeccable`：每个 renderer 页面完成后执行 audit / critique。
- `playwright`：进行后台浏览器的页面态、键盘焦点、队列和播放操作验证。
- `chinese-encoding`：任何中文资源或 PowerShell 写入前确认 UTF-8 完整性。
- `handoff`：下一次交接需要重新压缩上下文时使用。

## Prompt for Leader Agent

> 当前 `docs/design/` 产物已验收，可直接作为 Windy Concert M0.1 renderer 实施基线；不要重新设计页面或返工图标。请在 `D:\Dev\windy-concert` 继续施工。
>
> 开始前必须阅读：`docs/finale-analysis.md`、`docs/design-plan.md`、`docs/setting-up-plan.md` §3.3 / §3.7、`docs/design/notes.md`、`docs/design/icons.md` 和 `docs/design-handoff.md`。以 `docs/design/tokens.css` 为唯一 tokens source of truth，以 `docs/design/mockups/` 为视觉基线。
>
> 实现 11 个产品页面及共享 Shell、TrackList、Cover、PlayerBar、QueuePanel、SearchBox、右键菜单、Toast、空态和 Settings 行内确认。不要把 `components.html` 或页面状态切换器当成产品路由或产品功能；它们只用于设计验收。
>
> 图标必须沿用 `docs/design/mockups/assets/lucide/` 的本地 47 个 SVG 资产，并采用 `img.library-icon` 的本地加载策略。禁止恢复外部 Lucide CDN、运行时 SVG hydration、CSS mask、HTML 内联自绘 SVG 或其他图标库混用，保证 Local-first 无网络启动。
>
> 保持深色单主题、无 UI 组件库、无 Tailwind、无玻璃拟态、无渐变文字、无插画空态；missing / 不可播使用中性灰；主色每屏不超过 3 处；不使用逐行进入动画或系统原生弹窗，确认一律内联。范围锁死在 M0.1 的 11 个页面，需求冲突以 `docs/finale-analysis.md` 为准并记录到 `docs/design/notes.md`。
>
> 用真实 IPC / SQLite / 虚拟列表替换静态 fixture，保持页面态（空库 / 扫描中 / 正常 / 无结果）与行级态（normal / hover / playing / missing / 不可播 / selected）的语义。完成后用后台 Playwright 验证 125% / 150% 高 DPI、键盘焦点、播放与队列、状态覆盖和控制台无报错，并执行 Impeccable audit / critique；任何偏离先记录理由和影响范围。
