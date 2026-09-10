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

- **当前状态**：Phase 0 · 工程脚手架与基线已完成（2026-09-10），验收七条全绿（typecheck 0 错误 / 单测与 E2E 全绿 / dev 窗口代理信号 / bat 全 ASCII）。
- **技术栈**：Electron ^39.2.6 + electron-vite ^5.0.0（三进程：main / preload / renderer）+ React ^19.2.1 + TypeScript ^5.9.3；数据层 better-sqlite3 ^13.0.3（WAL）、music-metadata ^11.15.0、sharp ^0.35.4；状态 zustand ^5.0.15、路由 react-router-dom ^7.18.3、列表 react-virtuoso ^4.18.13；测试 vitest ^5.0.0 + @playwright/test ^1.63.0。
- **发布形态**：build\ 绿色目录（exe + 依赖可直接运行）+ 整目录 zip（build.bat / start.bat），NSIS 后置。
- **文档索引**：实施计划 `docs/setting-up-plan.md`（V1.2，唯一执行依据）、需求终稿 `docs/finale-analysis.md`、领域术语 `CONTEXT.md`、决策记录 `docs/adr/`、设计基线 `docs/design/`（tokens.css 为唯一 tokens 源）。

## TODO

- [ ] 等待 Phase 0 验收确认后启动 Phase 1｜数据层：SQLite + 迁移 + 仓库 + FTS
- [ ] Phase 2｜扫描与 Metadata 管道
- [ ] Phase 3｜IPC 契约、Preload 桥、设置与 i18n 运行时
- [ ] Phase 4｜应用 Shell 与浏览/搜索 UI（挂接 docs/design/）
- [ ] Phase 5｜播放器核心与队列
- [ ] Phase 6｜收藏、歌单、最近播放
- [ ] Phase 7｜设置页与 Library 管理
- [ ] Phase 8｜打包、性能验收与发布收尾（build.bat 完整链路、README 定稿）

## 暂未解决的问题

- `tests/e2e/launch.spec.ts` 有一处 `console.log` 调试残留，可清理。
- `tests/e2e/fixtures.ts` 同时暴露 `page` 与 `firstWindow`（指向同一窗口），且存在一处 `as Record<string, string>` 类型断言异味，可精简。
- `build.bat` 的 `zip` 分支未守卫 `build\` 目录存在性（计划既定设计，T8.1 完整链路验证时处理）。
- `src/main/index.ts` 沿用模板默认 `sandbox: false`，后续引入 IPC / 预加载逻辑时评估沙箱策略。
- 提交粒度：每任务为「功能 commit + 计划勾选 commit」两笔（计划文档纪律所致），非严格单 commit。
