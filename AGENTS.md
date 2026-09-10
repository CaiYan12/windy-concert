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

- 2026-09-10：Phase 1（数据层：SQLite + 迁移 + 仓库 + FTS，T1.1~T1.6）已完成，验收全绿（npm test 54 passed，数据层用例 53；typecheck 0 错误；七 repo 全覆盖；import 边界自检通过）。下一步等用户指令进入 Phase 2（扫描与 Metadata 管道）。
- 2026-09-10：Phase 0（工程脚手架与基线，T0.1~T0.5）已完成，§5 验收七条全绿；远端 github.com/CaiYan12/windy-concert（public），分支 main。
- 计划缺陷修正记录：§3.4 DDL 的 FTS 触发器对普通 fts5 表误用 contentless 'delete' 命令（实测 SQL logic error），经用户批准改为标准 `DELETE FROM tracks_fts WHERE rowid=old.rowid`（commit 1def31f，计划正文保持原文、执行备注留痕）。同类事实：trigram 分词器有 3 字符下限（2 字符中文 MATCH 0 行），§3.5d 的 <3 字符 LIKE 回退即为此设计。
- 版本决策（用户拍板「模板基线+新增最新」）：electron ^39.2.6 / electron-vite ^5.0.0 / react ^19.2.1 / typescript ^5.9.3 / electron-builder ^26.0.12 不动；新增 better-sqlite3 ^13.0.3 / music-metadata ^11.15.0 / sharp ^0.35.4 / zustand ^5.0.15 / react-router-dom ^7.18.3 / react-virtuoso ^4.18.13 / vitest ^5.0.0 / @playwright/test ^1.63.0 / jsdom ^30.0.1；devDep @types/better-sqlite3 ^9.6.0（类型包授权）。
- 本机环境事实：`npm config set allow-scripts` 被 npm 10.9.7 键校验拒绝，改白名单须直接编辑 ~/.npmrc（现含 codebase-memory-mcp,@anthropic-ai/claude-code,electron,better-sqlite3,sharp）；WorkBuddy CLI 沙箱内复跑 `npm run test:e2e` 需前缀 `CODEBUDDY_SAFE_DELETE_ENABLED=0`（用户本机不受影响）；create-electron@1.0.30 无 --help，非交互参数 `--template react-ts --skip` 经包源码实证；子代理派发遇 429 频率限制时按计划「执行者须知」降级 executing-plans（本会话执行+检查点），执行备注留痕。
- 阶段收尾约定（用户拍板 2026-09-10）：每阶段完成后更新三处——工作区记忆（.workbuddy/memory/）、本文件 Project Status、README.md；遗留问题与建议写入 README「暂未解决的问题」段；**状态更新后暂不 commit/push，待用户提议代码审查完毕后再统一提交**（阶段间小改动不受此限）。仓库可见性已于 2026-09-10 转 public。
- subagent 模型约定（用户拍板 2026-09-10 本期有效）：subagent 统一用 GLM 5.3 Flash（Agent 调用省略 model 参数继承父会话）；遇 429 速率限制直接打断询问用户换何种模型，禁止自动切换。

## Agent skills

### Issue tracker

Issues live in GitHub Issues (private repo `CaiYan12/windy-concert`, via `gh` CLI); external PRs are NOT a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` at repo root + `docs/adr/` (0001~0003). See `docs/agents/domain.md`.
