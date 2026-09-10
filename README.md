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

- **当前状态**：Phase 1 · 数据层（SQLite + 迁移 + 仓库 + FTS）已完成（2026-09-10），npm test 54 passed、typecheck 0 错误、七 repo 全覆盖、import 边界自检通过。Phase 0 · 工程脚手架与基线已完成（2026-09-10），验收七条全绿。
- **技术栈**：Electron ^39.2.6 + electron-vite ^5.0.0（三进程：main / preload / renderer）+ React ^19.2.1 + TypeScript ^5.9.3；数据层 better-sqlite3 ^13.0.3（WAL）、music-metadata ^11.15.0、sharp ^0.35.4；状态 zustand ^5.0.15、路由 react-router-dom ^7.18.3、列表 react-virtuoso ^4.18.13；测试 vitest ^5.0.0 + @playwright/test ^1.63.0。
- **发布形态**：build\ 绿色目录（exe + 依赖可直接运行）+ 整目录 zip（build.bat / start.bat），NSIS 后置。
- **文档索引**：实施计划 `docs/setting-up-plan.md`（V1.2，唯一执行依据）、需求终稿 `docs/finale-analysis.md`、领域术语 `CONTEXT.md`、决策记录 `docs/adr/`、设计基线 `docs/design/`（tokens.css 为唯一 tokens 源）。

## TODO

- [ ] 等待用户指令启动 Phase 2｜扫描与 Metadata 管道（worker 扫描、增量与 move 检测、封面管线）
- [x] Phase 1｜数据层：SQLite + 迁移 + 仓库 + FTS（2026-09-10 完成）
- [ ] Phase 3｜IPC 契约、Preload 桥、设置与 i18n 运行时
- [ ] Phase 4｜应用 Shell 与浏览/搜索 UI（挂接 docs/design/）
- [ ] Phase 5｜播放器核心与队列
- [ ] Phase 6｜收藏、歌单、最近播放
- [ ] Phase 7｜设置页与 Library 管理
- [ ] Phase 8｜打包、性能验收与发布收尾（build.bat 完整链路、README 定稿）

## 暂未解决的问题

**Phase 1（数据层）**

- `historyRepo.listRecent` 按计划原文用 `MAX(played_at)` 去重，秒级粒度下同曲同秒两次播放会产生重复行——**Phase 2 必修**（改 `MAX(id)` 或 played_at+id tiebreak）。
- `trackRepo.findByFileIdentity` 返回 `TrackRow | null`，多命中时静默取首行——无法表达 §3.5a adopt 所需「唯一命中」判定，Phase 2 开工先改多命中语义并补用例。
- `trackRepo.listSongs` 排序无 tiebreaker，重复键（如 playCount=0）下 offset 分页会跨页重复/丢行——Phase 2/4 消费前追加 `, tracks.id` 次级排序键并补分页用例。（第三方评审新增发现）
- 计划文档矛盾待修订：§4.2「AGENTS.md 只读」与阶段收尾约定「每阶段更新本文件 Project Status」（Phase 0 用户拍板）冲突——需计划所有者裁决如何修订正文；T1.6 任务文「七里命中七里香」措辞与 §3.5d trigram 3 字符下限矛盾，宜顺带修正。
- `getAlbumWithTracks` 的 disc_number NULL 排序依赖 SQLite 默认 NULLS-FIRST，与 `listAlbums` 的显式 NULL 垫底约定不一致（计划原文即 `ORDER BY disc_number, track_number`，Phase 4 消费时统一）。
- `trackRepo.updateAfterParse` 的 prepared 语句未按列组合缓存，30k 规模热路径有编译开销（Phase 8 性能验收前处理）。
- `folderRepo.normalizePath` 边界：UNC 主机段大小写未归一、根路径 `C:\` 归一为 `c:`（语义偏移）、空串无校验；`lower()` 大小写折叠为 ASCII-only，Phase 2 对账留意非 ASCII 带格字母。
- `playlistRepo.reorder([])` 无守卫会清空歌单；`addTracks` 遇不存在 trackId 的 FK 报错信息不友好。
- 测试缺口（边角）：listSongs 分页/缺省 order、findByFileIdentity 多命中、updateOutcome 缺省字段、folderRepo 重复路径/空串、coverRepo 非法 source、reorder([]) 语义均无用例。
- folderRepo 规范化测试断言 2/4 形态，可补幂等与无盘符路径断言。
- T1.6 子代理派发遇 429 频率限制，由主会话按 executing-plans 检查点流程接手完成，两阶段审查由主会话自检替代——**已由独立第三方评审（2026-09-10，reasoning 模型）补齐**，结论 Ready to merge: Yes，上述 Phase 2 开工清单为其产出。
- `@types/better-sqlite3` ^9.6.0 落后运行时 4 个大版本（当前 API 无实际类型风险，预防性维护）。

**Phase 0（脚手架）**

- `tests/e2e/launch.spec.ts` 有一处 `console.log` 调试残留，可清理。
- `tests/e2e/fixtures.ts` 同时暴露 `page` 与 `firstWindow`（指向同一窗口），且存在一处 `as Record<string, string>` 类型断言异味，可精简。
- `build.bat` 的 `zip` 分支未守卫 `build\` 目录存在性（计划既定设计，T8.1 完整链路验证时处理）。
- `src/main/index.ts` 沿用模板默认 `sandbox: false`，后续引入 IPC / 预加载逻辑时评估沙箱策略。
- 提交粒度：每任务为「功能 commit + 计划勾选 commit」两笔（计划文档纪律所致），非严格单 commit。
