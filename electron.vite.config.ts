import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // T2.3：scanner.worker 改由 scanService 内 `?nodeWorker` 导入编译（electron-vite workerPlugin
        // 自动 emit 独立 chunk），删除原附加入口条目以避免双份打包。
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()]
  }
})
