# 0001. 技术栈：Electron + TypeScript + SQLite，Windows 优先

日期：2026-09-09
状态：已接受

## 背景

Windy Concert 定位为"大众为主、兼顾发烧友"的桌面本地音乐播放器。组会初版需求报告（primalreport.md）未指定技术栈，修订需求文档前必须锁定，因为它直接约束音频格式承诺、性能预算与开发节奏。

## 决策

- 框架：Electron + TypeScript（渲染进程 + 主进程）
- 音乐库存储：SQLite（单文件、零运维、内置 FTS 全文搜索）
- 音频播放：Chromium 媒体管道为主；Chromium 不支持的格式（APE、DSF 等）通过 FFmpeg 转码或外挂解码兜底
- 平台：MVP 仅发布 Windows，但禁止写入平台死锁代码，保留扩展到 macOS/Linux 的可能

## 理由

1. 与团队当前正在进行的 Electron 学习路线重合，学习成本与项目产出合一。
2. SQLite 对"本地音乐库"场景是成熟解：MusicBee、foobar2000 类产品均以本地单文件库为主流形态。
3. 大众用户主要在 Windows；发烧友场景的 Hi-Res 指标（采样率/位深）在 MVP 以"展示"为目标，不承诺 bit-perfect 独占输出（留到 1.0 的 Exclusive Mode）。

## 后果

- 正面：开发速度高、UI 现代化成本低、生态（tag 读取、打包、自动更新）成熟。
- 负面：内存占用高于原生方案；APE 等小众格式依赖 FFmpeg 兜底；bit-perfect 音频路径在 Electron 内受限，1.0 阶段如需独占模式可能要评估原生音频模块。
- 未选择 Qt/C++：性能与音频栈更强，但开发速度慢、UI 现代化成本高，与团队学习路线不符。
- 未选择 Tauri：体积优势明显，但音频/媒体生态不如 Electron 成熟，且需要 Rust 能力。
