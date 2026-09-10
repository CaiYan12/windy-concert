import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 测试进程禁用 WorkBuddy CLI 的 node-safe-delete shim（>50 项批量删除保护）——
// 扫描/封面测试的临时目录递归清理与后续 30k 样本库测试会触发该保护导致 ENOTEMPTY 假失败。
// 必须无条件赋值：shim 在进程 bootstrap 预加载时读取该开关（??= 会被外层会话预设值挡住），
// config 先于 worker 派生执行，worker 继承 '0' 即在测试 worker 内禁用。仅影响 vitest 进程链。
// （T2.6 实测留痕）
process.env.CODEBUDDY_SAFE_DELETE_ENABLED = '0'

// T2.3：`?nodeWorker` 导入由 electron-vite workerPlugin 在 build/dev 时编译，纯 vitest 无法解析——
// 统一替换为桩模块（scanService/coverService 默认 workerFactory 在测试中不会被调用：测试一律注入伪 worker）。
const nodeWorkerStub = fileURLToPath(new URL('./tests/stubs/nodeWorkerStub.ts', import.meta.url))

export default defineConfig({
  resolve: {
    // T2.4：追加 cover.worker 桩（与 scanner.worker 同一 `?nodeWorker` 接线方式）
    alias: [{ find: /^\.\/(scanner|cover)\.worker\?nodeWorker$/, replacement: nodeWorkerStub }]
  },
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.{test,spec}.{ts,tsx}']
        }
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          passWithNoTests: true
        }
      }
    ]
  }
})
