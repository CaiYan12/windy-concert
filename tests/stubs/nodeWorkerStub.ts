// vitest 专用桩：`?nodeWorker` 导入仅在 electron-vite build/dev 流水线中可解析（workerPlugin），
// 纯 vitest 环境无法解析——vitest.config.ts 通过 alias 将 scanner.worker / cover.worker 的
// '?nodeWorker' 导入指向本文件。
// 测试必须注入 workerFactory（T2.6 可测性接缝）；此默认实现被调用即失败。
export default function nodeWorkerStubFactory(): never {
  throw new Error(
    '默认 workerFactory 不应在测试中调用：请注入 workerFactory（in-process 伪 worker）',
  );
}
