# AGENTS.md

## Skill Rule: 

We have compiled a set of "skills": folders of best practices for different forms of work. These encode hard-won trial-and-error about producing professional output. Several may apply to one task, so don't read just one. You need always be smart to use skills like:

- /grill-me on big changes sessions or any other you need to know.

- /design-flow on every ui/ux designing, changing or frontend processing. This is a leader skill, you need to dynamically check what position you are and load needing subskills matching the current status.

- /self-improvement when you make mistakes.

- /wayfinder on loose or unclear messages.

- /chinese-encoding on chinese language write-in or bash sessions.

- /obsidian-vault for local knowledge base, query firstly when needing knowledges.

- /context7-mcp or other needing MCP servers.

- /thesvg for needing brand icons.

- /pexels for needing actual no-copyright pictures.

- If it's the first time setting up the project be sure to use /setup-matt-pocock-skills and /using-superpowers to setup a skill-driven workflow, then strictly tighten the workflow with their skill series in this document.

  Read the skills, and involve the useful skills in your plan before you already know what to plan and to do.

---

## Coding Rule:

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Plan Mode Rule

### 1. Automatically triggers Plan Mode on

- Custom code solving a specific or foggy user problem

- Any long-form creative writing

- Structured reference content users will save or follow

- Modifying/iterating on an existing artifact; content that will be edited or reused

- A standalone text-heavy uploaded document >100 lines, or a plan or a handoff file mentioned by the user.

### 2. Plan File

When generating a plan, follow these instructions to sharpen a plan:

1. Get precise project info directly in project docs, git history, important codes, etc.
2. Run /grill-with-docs for a grilling session for more detailed info.
3. Turn the detailed task into different workable steps.

A finale plan should be detailed into phases and steps, A checkbox is needed for a step. When working for a plan, you need to update the status of each steps.

---

## Memory & Experience Rule

You have a persistent memory filesystem. You could reach your direct memories simply at "\.codex\memories" in Appdata

### 1. Project Memory is Needed

Except for your persist memory system, You could setup your specific project-based memory filesystem "\.codex\memories" on the project to make it enable to transfer messages between different agent sessions, kept for future-you, who re-reads these files at the start of every conversation. 

When a question concerns the user or their world — anything they may have told you before — check the memory listing before
answering from conversation memory alone: if any file's description could plausibly hold the answer, read it first. 

Always read before saying you DON'T have or know something.

You are ABLE to lead the user and the session to go with the relevant memories.

### 2. Memory Settings

- You are running in **chat**. Other running sessions may also write to the same filesystem, so you may see files you didn't create.
- When it's a begin of a session, you need to load project memories for knowing the work status we're. Memories are needed for primal context.
- For faster querying, the memory filesystem requires an index file.

### 3. Memory Querying

- When you've hit a wall, you can find the answers in your memories.
- When you notice you've been in similar tasks, you can query the memories to find similar experience.
- If the memory is `(empty)` or `<profile>` shows `(not yet written)`, you're starting from nothing. Just help the user and answer from the conversation.
- Index file will help you querying.
- You are able to query other agents' project memories by reaching their memory folder like .zcode/, .trae/, .workbuddy/, or .learning/, etc.

### 4. Memory Appending

- When user are stressing a point or you noticed some important messages, append that into your memories.

### 5. Outdated Memories

- Mission-completed tasks and dated over 60 days memories are considered outdated. When user are speaking of cleaning the memories, clear those outdated files.

---

## Git Rule

### 1. Commit Rule

- .git folder, README.md, AGENTS.md, .gitignore or other any git needing file are needing for a git commit.
- At most of the time, the .gitignore file is convincing and precise as long as it's updated. You can do the commit directly without file analysis.
- An closely updated README.md, AGENTS.md or other needing docs shall never be ignored in a commit.

### 2. Push Rule

- Normally when a commit passed real testing, a push should be ready to lead by you.
- Do not create branches unless the user mentions.
- Do not add GitHub contributors or co-founders unless the users mentions.
- Open-source publish uses MIT.

### 3. .gitignore Updating Rule

Agents memories(like .zcode/, .trae/, .workbuddy/, .claude/, .codex/), plugin files(like .mimosa/, playwright files), node modules or other files you think it's not necessary should be listed into a gitignore file.

The gitignore file should be updated when: 

- New functions updated, or previous functions changed or deleted.
- New essential library or dependency added.
- User mentioned.

---

## How to suggest

- You should call online and local search with keywords drawn from the task itself and suggest only results genuinely relevant to what the person is doing, because irrelevant suggestions teach the person to ignore the cards — if nothing fits well, you should suggest nothing.
- You should render at most one suggestion card per conversation total, unless the person asks for more, because repeated suggestions interrupt the conversation and feel pushy. If the person dismisses or doesn't engage with a card, you should not suggest again in that conversation.
- You should keep in mind that not all the users are fully professional, they may find them in a wall if your responses are involving with mass professional terminologies. You should explain the current problem or progress in an easy-to-understand, a way that even a freshman could understand. Sometimes a metaphor would be useful.
- Give me a simplified conclusion at the end if the responses are too long, the users' got limited time and patience.
- You have the responsibility to lead the user what to do next. You can guess the user's intention this time and give the proper way to continue our task.
- Your tone should be direct and precise, do not go around the bush.

## Running Environment

Your agent and bash are running on:

### System & Device

- Windows 11 Home Chinese Version x64
- Device
- LENOVO Legion Y7000P IRX9
- Intel Core i7-14700HX
- 15.7 GB (16 GB) RAM
- NVIDIA GeForce RTX 4070 Laptop GPU
- Realtek 8852CE WiFi 6E

### Dev Tools

- Shell: PowerShell 7.6.5
- Legacy PowerShell: 5.1 also available
- Git: 2.48.1
- Node.js: 24.18.0
- npm: available through `npm.ps1`
- Filesystem access: unrestricted in the current environment
- Network access: enabled





---

# Project Info:

**!IMPORTANT: Above are fixed and read-only finale context, you MUST follow these rules strictly, you CANNOT write, delete or add new words when updating or initializing AGENTS.md. Part below accepts and encourages you for updating when getting know different project info or status, detecting outdated messages needing for update, saving memories or updating experiences etc.**



## windy-concert

update the project config and agent rules here

## Project Status（每阶段收尾时更新）
- 2026-09-12：**Phase 6（收藏、歌单、最近播放，T6.0~T6.6）已完成并通过第三方收尾评审（结论 PASS_WITH_NOTES）**。交付：T6.0 前置小包（音量恢复接线/audio error 链路/QueuePanel 焦点回落——Phase 5 收尾评审三项系统性缺口一次清完）；T6.1 收藏（favoritesStore 切片/Liked 页第二处获准渐变/术语整改 33 处零视觉改动）；T6.2-T6.4 歌单三件套（CRUD+拖拽重排+CollageCover，含 repo 守卫补齐与 CSP data: 追加）；T6.5 Recent 页（formatRelative UTC 解析+本地渲染）；T6.6 e2e favorites-playlists 三段（**F6-3 升级为完整应用重启持久化**）。**656 unit tests / typecheck 0 / e2e 22 passed 两轮零 flaky**。**Phase 7 前置清单已收录 README**（addFolder 显式扫描/folderRepo 边界加固/settings 持久化口径/QueuePanel selector 化等 8 项）。下一步等用户指令进入 Phase 7（设置页与 Library 管理）。
- 2026-09-11：**Phase 5（播放器核心与队列，T5.1~T5.7）已完成并通过第三方收尾评审（结论 PASS_WITH_NOTES）**。交付：PlayQueue 逐字冻结（SHA1 同 §3.5b 独立复验）+ 19 单测锚定 F5；AudioEngine/playbackService/playerStore 三件套（§3.5c 计费时序：loadTrack 即计/同曲守卫/手动切歌先结算/暂停零 IPC）；播放栏 F4-3 十二要素（Equalizer 唯一持续动画）；队列面板三段（store 层平行插队列表，queue 冻结不动）；T5.6 接通（playerBridge 零改调用方 + Toast 基建）；e2e playback-queue 5 用例（连跑 3 轮无 flaky，playCount 1→2 经 reload 会话重置路径）。**502 unit tests / typecheck 0 / e2e 16 passed**。**Phase 6 前置清单已收录 README**（T6.0 前置小包三项：ensureVolumeRestored 接线 / audio error 链路 / QueuePanel 焦点回落 + Albums 卡片副作用升级等 12 项）。下一步等用户指令进入 Phase 6（歌单管理）。

- 2026-09-11：**Phase 4（应用 Shell 与浏览/搜索 UI，T4.0~T4.10）已完成并通过第三方收尾评审（结论 PASS_WITH_NOTES）**。交付：Icon/tokens 设计资产接入、AppShell 五组件 + hash 路由、libraryStore、TrackList/Cover（三轮评审闭环）、五浏览页（封面通路改 albums.cover_id 回填，锚定测试有牙）、SearchBox/SearchResults（两阶段评审闭环，debounce/键盘可达/IME 守卫）、i18n 三层 grep 0 违例、E2E 全链路 + 11 路由矩阵 + F3-1 无死链；收尾评审新增 T4.9 Songs 翻页（用户裁定补 UI）与 T4.10 遗忘前置收口（IPC 下沉 shared + 协议失败分支 9 用例）均已闭环。**最终 345 unit tests / typecheck 0 / e2e 11 passed**。**Phase 5 前置清单已收录 README**（Detail 排序 dead affordance→T5.6、songsCount 通道→Phase 5、Albums/Artists 虚拟化→T8 前、covers:ready 补渲→Phase 7、electron-builder 重写→T8、card-play affordance 统一→T5.6）。下一步等用户指令进入 Phase 5（播放器核心与队列）。
- 2026-09-10：Phase 3（IPC 契约、Preload 桥、设置与 i18n 运行时，T3.1~T3.6 + 前置项）已完成并通过第三方独立评审（结论 With fixes → 分页钳制/数组拒绝/getFolders 归一已修复，160 tests + 2 e2e 全绿）。**评审产出 Phase 4 前置清单已收录 README**（addFolder 后须显式 scan、IPC 常量下沉 shared、wireCoverPipeline 组装顺序、protocol 失败分支用例、文案硬编码检查）。Phase 3 代码与状态文档已提交入库。下一步等用户指令进入 Phase 4（应用 Shell 与浏览/搜索 UI）。
- 2026-09-10：Phase 2（扫描与 Metadata 管道，T2.1~T2.7 + V1.3 升格项前置落地）已完成并通过第三方独立评审（结论 With fixes → I-1 封面来源优先级 embedded>folder 已强制修复，计划 V1.6 调和 §3.5e 与 F2-2 矛盾；30k 首扫 39.5s ≤5min）。
- 2026-09-10：Phase 1（数据层：SQLite + 迁移 + 仓库 + FTS，T1.1~T1.6）已完成，验收全绿；Phase 0（工程脚手架与基线，T0.1~T0.5）已完成，§5 验收七条全绿；远端 github.com/CaiYan12/windy-concert（public），分支 main。
- 计划修订史：V1.3（grill 会话：AGENTS 边界 / T1.6 措辞 / Phase 2 开工清单升格正文）；V1.4（T2.1 fixture ape→wma，ffmpeg 9.0 无 ape 编码器实测）；V1.5（§3.5a markMissing 前置到分类之前——单次移动重扫保 UUID，用户裁定）；V1.6（F2-2 封面 embedded>folder 强制，Phase 2 评审 I-1）；V1.7（Phase 3 验收文案澄清 addFolder 不自动扫描 + channel 计数勘误 30 条）。另有执行期已批准修正：§3.4 FTS 触发器 'delete' 命令→标准 DELETE FROM（普通 fts5 表，commit 1def31f）；trigram 3 字符下限为 §3.5d LIKE 回退的设计依据。
- 版本决策（用户拍板「模板基线+新增最新」）：electron ^39.2.6 / electron-vite ^5.0.0 / react ^19.2.1 / typescript ^5.9.3 / electron-builder ^26.0.12 不动；新增 better-sqlite3 ^13.0.3 / music-metadata ^11.15.0 / sharp ^0.35.4 / zustand ^5.0.15 / react-router-dom ^7.18.3 / react-virtuoso ^4.18.13 / vitest ^5.0.0 / @playwright/test ^1.63.0 / jsdom ^30.0.1；devDep @types/better-sqlite3 ^9.6.0（类型包授权）。
- 本机环境事实：`npm config set allow-scripts` 被 npm 10.9.7 键校验拒绝，改白名单须直接编辑 ~/.npmrc（现含 codebase-memory-mcp,@anthropic-ai/claude-code,electron,better-sqlite3,sharp）；WorkBuddy CLI 沙箱内复跑 `npm run test:e2e` 需前缀 `CODEBUDDY_SAFE_DELETE_ENABLED=0`（用户本机不受影响）；vitest #10692 小写盘符 cwd 全挂——测试一律以大写 `D:\Dev\windy-concert` 入口；safe-delete shim 在进程 bootstrap 读开关，vitest.config.ts 内无条件赋值 `process.env.CODEBUDDY_SAFE_DELETE_ENABLED='0'` 才能在测试 worker 内禁用（??= 会被外层预设值挡住）；music-metadata 11.15.0 对截断 mp3 容错不抛错（F1-7 判据 = 抛错 OR !hasAudio OR 无 duration）；ffmpeg 9.0 无 ape 编码器；create-electron@1.0.30 无 --help（`--template react-ts --skip` 经源码实证）。
- 阶段收尾约定（用户拍板 2026-09-10，含自动评审惯例）：每阶段完成后**自动执行**四步——① 派发独立第三方评审子代理（requesting-code-review，三维度：计划符合性/代码质量/测试覆盖，不采信自述、实证为准）；② 向用户报告「下一阶段前应当处理的问题」（Critical/Important 即时修复或裁定，其余入 README 遗留段标时机）；③ 更新三处状态文档（工作区记忆 .workbuddy/memory/、本文件 Project Status、README.md；遗留问题写入「暂未解决的问题」段）；④ 统一 commit + push。**状态更新与评审修复在评审完成前暂不提交（提交门控）**。仓库可见性已于 2026-09-10 转 public。
- subagent 模型约定（用户拍板 2026-09-10 本期有效）：subagent 统一用 GLM 5.3 Flash（Agent 调用省略 model 参数继承父会话）；遇 429 速率限制直接打断询问用户换何种模型（GLM 5.3 为已批准备选），禁止自动切换。

## Agent skills

### Issue tracker

Issues live in GitHub Issues (private repo `CaiYan12/windy-concert`, via `gh` CLI); external PRs are NOT a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at repo root + `docs/adr/` (0001~0003). See `docs/agents/domain.md`.
