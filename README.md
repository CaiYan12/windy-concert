# Windy Concert

本地优先的 Windows 桌面音乐播放器（Electron + TypeScript + SQLite）。Local First：无流媒体、无账号、无云同步、无遥测。

## 开发命令

```
npm run dev        # 开发模式启动（scripts/dev.mjs 自动净化 ELECTRON_RUN_AS_NODE）
npm run build      # 生产构建
npm run typecheck  # TypeScript 类型检查（web + node 双 tsconfig）
npm test           # Vitest 单测（node / jsdom 双 project）
npm run test:e2e   # 生产构建 + Playwright Electron E2E
npm run dist       # 生产构建 + electron-builder --win dir
```

## 环境提示

- 本机用户环境变量存在 `NODE_TLS_REJECT_UNAUTHORIZED=0`，npm 安装期会输出 TLS 证书警告，属预期现象。
- 若用户环境存在 `ELECTRON_RUN_AS_NODE=1`，所有 Electron 启动路径（dev.mjs / bat / e2e env）已做净化，无需手工 unset。
- 本机 npm 默认拦截白名单外依赖包的 install 脚本：`~/.npmrc` 的 `allow-scripts` 已含 `electron, better-sqlite3, sharp`；全新克隆后如遇 Electron 起不来或原生模块 ABI 报错，先检查该白名单。

## 项目详细信息

- **当前状态**：Phase 3 · IPC 契约、Preload 桥、设置与 i18n 运行时已完成并通过第三方评审（2026-09-10，结论 With fixes → 分页钳制/数组拒绝/归一加固已修复，160 tests + 2 e2e 全绿，30k 数据库文件 1.19s 全链路 e2e），全部已提交入库。Phase 0~2 均已完成入库。下一步等「进入 Phase 4」指令。
- **技术栈**：Electron ^39.2.6 + electron-vite ^5.0.0（三进程：main / preload / renderer）+ React ^19.2.1 + TypeScript ^5.9.3；数据层 better-sqlite3 ^13.0.3（WAL）、music-metadata ^11.15.0、sharp ^0.35.4；状态 zustand ^5.0.15、路由 react-router-dom ^7.18.3、列表 react-virtuoso ^4.18.13；测试 vitest ^5.0.0 + @playwright/test ^1.63.0。
- **发布形态**：build\ 绿色目录（exe + 依赖可直接运行）+ 整目录 zip（build.bat / start.bat），NSIS 后置。
- **文档索引**：实施计划 `docs/setting-up-plan.md`（V1.2，唯一执行依据）、需求终稿 `docs/finale-analysis.md`、领域术语 `CONTEXT.md`、决策记录 `docs/adr/`、设计基线 `docs/design/`（tokens.css 为唯一 tokens 源）。

## TODO

- [x] Phase 3｜IPC 契约、Preload 桥、设置与 i18n 运行时（2026-09-10 完成并通过第三方评审：31→30 条 channel 全通 / 两协议 / settings / i18n 142 key / e2e 全链路）
- [x] Phase 2｜扫描与 Metadata 管道（2026-09-10 完成并通过第三方评审：30k 首扫 39.5s；F2-2 内嵌优先已强制 V1.6）
- [x] Phase 1｜数据层：SQLite + 迁移 + 仓库 + FTS（2026-09-10 完成）
- [ ] 等待「进入 Phase 4」启动指令｜应用 Shell 与浏览/搜索 UI（挂接 docs/design/）
- [ ] Phase 4｜应用 Shell 与浏览/搜索 UI（挂接 docs/design/）
- [ ] Phase 5｜播放器核心与队列
- [ ] Phase 6｜收藏、歌单、最近播放
- [ ] Phase 7｜设置页与 Library 管理
- [ ] Phase 8｜打包、性能验收与发布收尾（build.bat 完整链路、README 定稿）

## 暂未解决的问题

**Phase 5（播放器核心与队列）——Phase 6 前置清单（第三方收尾评审产出，2026-09-11，按序）**

Phase 5 已完成 T5.1~T5.7（queue 逐字冻结 / 三件套 / 播放栏 / 队列面板 / 接通 / e2e）。最终状态：**502 unit tests / typecheck 0 / e2e 16 passed**（playback-queue 连跑 3 轮无 flaky）；queue.ts 与计划 §3.5b SHA1 一致经收尾评审独立复验。上轮 Phase 5 前置清单收口：Detail 排序 dead affordance ✅（T4.11 sortable + 详情页 false）；songsCount ✅（T4.11 getStats）；card-play affordance 统一 → 见下「Albums 卡片播放钮」升级立案。

- **[T6.0 前置小包] `ensureVolumeRestored()` 接线**：音量/静音持久化**只写不读**（T5.3 建机制、无任务认领接线），每次启动回退 DEFAULT_VOLUME=0.8。→ App 挂载调用（AppShell 或 router loader）+ 启动恢复单测。
- **[T6.0 前置小包] audio error 事件链路空白**：AudioEventType 声明了 error 但全仓零订阅——播放损坏/解码失败文件实况 = 假计费（playCount+1 但无声）+ playing 乐观置位无回退 + 均衡器假播动画，仅手动 next 可解。→ store/service 订阅 error → 结算口径裁定（假计费是否回冲）→ UI 错误态（toast/自动跳下一首）→ 单测 + e2e。
- **[T6.0 前置小包] QueuePanel 关闭焦点回落**：计划验收标准明文「关闭后焦点回落触发按钮」——AppShell onClose 无 focus 管理，x 关闭后焦点落 body。→ 补 focus 管理 + 键盘走查留痕（计划 903 行验收项后半句）。
- **Albums 卡片播放钮副作用升级**：`playContext([])` 在 T5.3 I1 修复后从 no-op 变成**会停掉正在播音乐**。→ Phase 6 立案正式接通（先取专辑曲目再 playContext）。- **Liked 术语整改（T6 范围承接）**：用户裁定统一用「收藏」，设计稿 `Liked.html` / design-plan §4.6 的「喜欢的音乐」需改——**T6 开工前先解除 `docs/design/**` 只读约束**再执行（T4.3 备案，评审清单第 2 项，此前收录时遗漏现补回）。
- **playlistRepo 守卫（Phase 1 遗留承接）**：`reorder([])` 无守卫会清空歌单、`addTracks` 遇不存在 trackId 的 FK 报错不友好。→ **Phase 6 歌单 UI 接入时**补守卫与错误文案（原建议时机即 Phase 6，在案）。
- **folderRepo.normalizePath 边界**：UNC 主机段大小写未归一、根路径 `C:\` 归一为 `c:`、空串无校验。→ 原建议时机 Phase 3/4 消费时加固，已过而未做——**Phase 6 顺延承接**（扫描对账已上线，风险中低）。
- **计划 §3.4 FTS 触发器正文**：代码已按批准修正为标准 DELETE，计划正文仍为历史原文（'delete' 语法）——按 T4.10 起的口径**保留历史原文 + 执行备注引用**，不再单独排期（在案确认）。

- **audio error 测试缺口**（与上条同源）：单测 + e2e 双缺（解码失败/损坏文件路径）。
- **history:listRecent 无 e2e 断言**：playCount 经 getTrack 有断言，playedDuration/completed 落库值无端到端验证（service 侧 payload 已有单测锚定，风险中低）。→ 建议时机：Phase 6 e2e 扩展顺手补。
- **QueuePanel 随 position 高频重渲**：usePlayer() 全态订阅但只消费 queueView（每 250ms 重渲整面板）。→ selector 化（照 usePlayingTrackId 先例），建议时机：Phase 6 顺手。
- **advance() resolve 失败分支不 pause**（防御路径与 null 分支不一致，现实不可达）。→ Phase 6 顺手统一。
- **enqueue 重复曲目去重裁定**：面板如实呈现现状留痕在案。→ T5.6 右键菜单 toast 时顺带裁定（承接 T5.5 备注）。
- **SearchResults 紧凑表不接播放**：范围裁定确认在案（非 TrackList），无需动作。
- **volume/seek 边界用例**：clamp 防御在、专项边界用例缺。→ 建议时机：Phase 6/8 随对应修复补。
- **环境备注（评审实锤）**：vitest 5.0.0 在 Windows **小写盘符 cwd** 下全部测试文件报 `reading 'config'`（vitest#10692/#10843）——「测试必须以大写 D:\Dev\windy-concert 入口」约束的本质即此；诊断期 `npm ci`（lockfile 口径）无害。

**Phase 3（IPC / Preload / 设置 / i18n）——前置清单收口情况（2026-09-11 Phase 4 收尾更新）**

- **addFolder 不自动扫描**：调用方须显式 `library:scan()`。→ ✅ **按计划承接 T7.3**（渲染层 grep `addFolder|library:scan` 零命中无越界；libraryStore 已订阅 done 自动刷新；收尾评审确认合理承接，非遗忘）。
- IPC 常量与 payload 类型下沉 `shared/`。→ ✅ **已解决（T4.10，commit 89120b0）**：`src/shared/ipc.ts` 单一真源，preload 改指向 shared，channel 字符串 83 处逐一比对 0 差异；channels.ts 降级纯 re-export shim。
- `wireCoverPipeline` 调用顺序（wire 先于 createScanService）。→ ✅ **已确认（T4.4 组装，收尾评审复核 `main/index.ts:129-130` 正确）**。
- protocol handler net.fetch 失败分支（403/404/400 body）无用例。→ ✅ **已解决（T4.10）**：handler 提为可测函数（handleAudioRequest/handleCoverRequest 注入形态），新增 9 失败分支用例（越界 403/非法 400/取流失败 resolve 不炸进程）。
- `settings:set` renderer 高频调用节流。→ **Phase 5**（T5.4 音量滑条接 UI 时，debounce 500ms 已在计划 §3.5c）。
- 渲染层文案硬编码 grep 检查。→ ✅ **已解决（T4.6，2026-09-11）**：三层 grep（行级/属性级/JSX 文本节点）0 违例；t() 字面量 ⊆ zh-CN.json 守卫常驻。
- `scan:progress` 的 phase:'cover' 相位从不发射——封面就绪以 covers:ready 为准。→ 部分承接：渲染层未等待该相位 ✓；但 covers:ready 渲染层补渲未做，见上方 Phase 5 前置清单（Phase 7 处理）。

**Phase 2（扫描与 Metadata 管道）**

- `coverService` 的 albumId 去重状态跨扫描常驻。→ ✅ **已解决（Phase 3 前置 ①，commit 8d2f14e）**：full 模式真实现（无视三元组全部重解析）+ resetAlbumStates() + 单测；rescanAll handler 已接线。
- `scan.log` coversDropped 汇合口径。→ ✅ **已解决（Phase 3 前置 ②，commit 8d2f14e）**：定为合计口径——scanService deps 新增 coverDroppedExtra（T3 组装注入 cover.droppedCount），summary/log 单字段输出。
- `tracks.cover_id` 列当前不写（封面仅落 albums.cover_id），TrackRow.coverId 恒 null。→ **Phase 4 前置确认**：渲染层封面全部走 album.coverId；如需曲目级封面再启用写路径
- `wireCoverPipeline` mutate 模式。→ ✅ **已解决（Phase 3 前置 ③，commit 1aa2f69）**：改为返回注入 onCoverJob 的新 deps；Phase 4 组装顺序注意见 Phase 3 清单。
- worker batch 消息的 `done` 冗余字段。→ ✅ **已解决（Phase 3 前置，commit 8d2f14e）**：已删除。
- `gen-sample-library.mjs` dirCount 统计漏计艺术家目录。→ ✅ **已解决（Phase 3 前置，commit e1c445d）**：口径真实现（1 根 + 艺术家 + 专辑三段如实）。
- 计划 §3.4 正文 FTS 触发器仍为旧版 'delete' 语法（代码已按用户批准修正为标准 DELETE，执行备注留痕）。→ **建议时机：T5 文档收尾**统一同步（或保留为历史原文 + 执行备注引用）
- worker ParsedTrack 携带完整 picture bytes，单批峰值 20–400MB（增量场景量小）。→ **建议时机：M5 性能打点超预期时**（备选：PARSE_BATCH 降 100 / 同 album 置空 picture）
- F1-7 真独占句柄在 Node/libuv（Windows FILE_SHARE 默认全开）下不可造，以「目录冒充音频文件 + parseFiles 纯函数层 EISDIR」等效覆盖。→ 无需解决（等效覆盖已留痕，真独占场景留待实测）
- `listSongs` 的 mtime 浮点 vs INTEGER affinity 严格相等比较——当前同源 stat 精确往返无损。→ **建议时机：出现跨扫描 re-parse 抖动时**（比较/存储前取整）
- 环境事实：vitest #10692（小写盘符 cwd 全挂）与 WorkBuddy safe-delete shim（已在 vitest.config 无条件禁用 + afterEach delete-pending 重试）已规避。→ 无需解决（跨会话跑测试注意入口）

**Phase 1（数据层）**

- `getAlbumWithTracks` 的 disc_number NULL 排序依赖 SQLite 默认 NULLS-FIRST，与 `listAlbums` 的显式 NULL 垫底约定不一致（计划原文即 `ORDER BY disc_number, track_number`）。→ **建议时机：Phase 4**（专辑详情 UI 消费时统一 NULL 约定）
- `trackRepo.updateAfterParse` 的 prepared 语句未按列组合缓存，30k 规模热路径有编译开销。→ **建议时机：Phase 8 性能验收前**（量级无害，顺手缓存）
- `folderRepo.normalizePath` 边界：UNC 主机段大小写未归一、根路径 `C:\` 归一为 `c:`（语义偏移）、空串无校验；`lower()` 大小写折叠为 ASCII-only。→ **建议时机：Phase 2 收尾顺延**（扫描对账已上线，随 Phase 3/4 消费时加固）
- `playlistRepo.reorder([])` 无守卫会清空歌单；`addTracks` 遇不存在 trackId 的 FK 报错信息不友好。→ **建议时机：Phase 6**（歌单 UI 接入时补守卫与错误文案）
- 测试缺口（边角）：listSongs 分页/缺省 order、updateOutcome 缺省字段、folderRepo 重复路径/空串、coverRepo 非法 source 均无用例（findByFileIdentity 多命中与 listRecent 同秒已于 Phase 2 前置修复并补用例）。→ **建议时机：Phase 3/6 随对应修复同步补**
- `@types/better-sqlite3` ^9.6.0 落后运行时 4 个大版本（当前 API 无实际类型风险，预防性维护）。→ **建议时机：Phase 8**（发布前依赖体检时对齐）
- ✅ **已解决（Phase 2 前置落地，V1.3 升格项）**：findByFileIdentity 多命中语义、listSongs tiebreaker、listRecent MAX(id)——均已修复并补用例。
- ✅ **已解决**：T1.6 主会话自检替代——已由独立第三方评审（2026-09-10）补齐；计划文档矛盾（§4.2 / T1.6 措辞）——已由 grill 会话 V1.3 修正；folderRepo 规范化测试断言 2/4 形态——已随 T2.1 质量审查补完正文与 07 最小标签（V1.4）。

**Phase 0（脚手架）**

- `tests/e2e/launch.spec.ts` 有一处 `console.log` 调试残留。→ **建议时机：Phase 3**（e2e 桥与 IPC 契约落地时顺手清理）
- `tests/e2e/fixtures.ts` 同时暴露 `page` 与 `firstWindow`（指向同一窗口），且存在一处 `as Record<string, string>` 类型断言异味。→ **建议时机：Phase 3**（fixture 随 IPC 桥扩展时精简）
- `build.bat` 的 `zip` 分支未守卫 `build\` 目录存在性（计划既定设计）。→ **建议时机：T8.1**（计划排定的完整链路验证时处理）
- `src/main/index.ts` 沿用模板默认 `sandbox: false`。→ **建议时机：Phase 3**（IPC / 预加载逻辑引入时评估沙箱策略）
- 提交粒度：每任务为「功能 commit + 计划勾选 commit」两笔（计划文档纪律所致），非严格单 commit。→ **建议时机：无需解决**（流程性说明，保持现状；历史不做改写）
