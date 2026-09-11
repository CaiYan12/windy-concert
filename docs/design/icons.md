# Windy Concert · M0.1 图标映射

静态稿的 UI 图标统一使用本地 vendored 的 Lucide Static `1.43.0` 资源，来源为 `https://unpkg.com/lucide-static@1.43.0/icons/{name}.svg`。文件位于 `mockups/assets/lucide/`，由 `mockup.js` 将 `data-lucide` 占位替换为本地 `<img>`；这同时兼容 `file://` 直开与静态服务器预览。浏览器 DOM 不生成 inline SVG，也不依赖运行时 CDN。基础图标与语义色变体均来自同一套 Lucide 路径；没有使用 emoji 或第三方 UI 组件库。

| Lucide 名称 | 使用位置 | 尺寸 | 颜色 token |
|---|---|---:|---|
| `music-2` | 品牌标记、歌曲导航、无封面占位、空态 | 16 / 20 / 24 | `--text-primary` / `--text-tertiary` |
| `disc-3` | 专辑导航、专辑空态 | 16 / 24 | `--text-secondary` / `--text-tertiary` |
| `mic-2` | 艺术家导航、头像占位、艺术家空态 | 16 / 24 | `--text-secondary` / `--text-tertiary` |
| `library` | 歌单导航、歌单空态、搜索预览 | 16 / 24 | `--text-secondary` / `--text-tertiary` |
| `heart` | 收藏按钮、收藏导航、Liked Hero | 16 / 24 | `--text-secondary` 未收藏；`--accent` 已收藏 |
| `history` | 最近播放导航、Recent 空态 | 16 / 24 | `--text-secondary` / `--text-tertiary` |
| `settings` | 设置导航 | 16 | `--text-secondary` |
| `search` | 顶栏搜索框、无结果态 | 16 / 24 | `--text-secondary` / `--text-tertiary` |
| `folder-plus` | 添加目录按钮、空库态 | 16 / 24 | `--on-accent` 按钮内；`--text-tertiary` 空态 |
| `folder` | 设置页目录行 | 16 | `--text-tertiary` |
| `play` / `pause` | 播放按钮、卡片 hover、行 hover | 16 / 20 | `--on-accent` 播放按钮；`--text-primary` 其他位置 |
| `skip-back` / `skip-forward` | PlayerBar 上一首 / 下一首 | 16 | `--text-secondary` |
| `shuffle` | PlayerBar 与详情页随机播放 | 16 / 20 | `--text-secondary` |
| `repeat` | PlayerBar 循环模式 | 16 | `--text-secondary` |
| `list-music` | PlayerBar 队列入口 | 16 | `--text-secondary` |
| `volume-2` | PlayerBar 音量 / 静音 | 16 | `--text-secondary` |
| `file-x-2` | missing 行、文件缺失状态 | 15 / 16 | `--text-tertiary` |
| `ban` | 不可播行、不可播状态 | 15 / 16 | `--text-disabled` |
| `more-horizontal` | 顶栏与行级更多操作 | 16 | `--text-secondary` |
| `plus` | 侧栏新建歌单、歌单空卡 | 16 / 24 | `--text-tertiary` |
| `x` | QueuePanel 关闭、搜索清除 | 16 | `--text-secondary` |
| `chevron-up` / `chevron-down` | 表头排序、排序提示 | 12 | `--text-secondary` |
| `chevron-left` / `chevron-right` | 详情页返回、菜单子层级 | 16 | `--text-secondary` |
| `arrow-up-down` | Liked 排序选择 | 16 | `--text-secondary` |
| `corner-down-right` | QueuePanel “下一首播放”插队标识 | 16 | `--text-tertiary` |
| `grip-vertical` | PlaylistDetail 拖拽排序 | 16 | `--text-tertiary` |
| `refresh-cw` | 重新扫描 / 全量重扫 | 16 | `--text-secondary` |
| `trash-2` | 设置页目录移除 | 16 | `--text-secondary`；行内确认文字 `--danger` |
| `pencil` | PlaylistDetail 重命名 | 16 | `--text-secondary` |
| `check` | Toast 已完成提示 | 16 | `--accent` |
| `file-check-2` | 组件板交付物标识（仅设计稿） | 16 | `--text-tertiary` |

## 统一实现规则

尺寸约束遵循 design-plan §2.4 的 16 / 20 / 24 三档；表头 chevron 和文件状态图标是为密度场景保留的 12 / 15px 特例。所有 UI 图标、封面图标、PlayerBar 播放中指示和搜索组件图标均来自 `mockups/assets/lucide/*.svg`，通过 `<img>` 显示；基础、accent、on-accent 和封面色变体继续使用同一套 Lucide 路径。这样不依赖 CSS mask 的本地文件权限，且不保留自绘 `<svg>`、CSS 几何图标或第二套图标资产。HTML / JS 源码及运行后的页面 DOM 均不包含 inline SVG。进度条、音量条、开关旋钮和歌单圆点属于控件结构 / 状态标记，不作为图标处理。

资源版本与授权：本交付锁定 `lucide-static@1.43.0`，其单文件头部保留 Lucide Static 的 ISC 许可声明；后续工程接入应继续使用同一资源版本或在升级时重新审计图标映射。
