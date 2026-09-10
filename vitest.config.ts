import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// T2.3：`?nodeWorker` 导入由 electron-vite workerPlugin 在 build/dev 时编译，纯 vitest 无法解析——
// 统一替换为桩模块（scanService 默认 workerFactory 在测试中不会被调用：测试一律注入伪 worker）。
const nodeWorkerStub = fileURLToPath(new URL('./tests/stubs/nodeWorkerStub.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\/scanner\.worker\?nodeWorker$/, replacement: nodeWorkerStub }]
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
