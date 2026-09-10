import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // T2.2：scanner.worker 附加入口编译进 out/main（src/main/index.ts 暂不引用，T2.3 接线 ?nodeWorker）
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'scanner.worker': resolve('src/main/library/scanner.worker.ts') // T2.3 改 ?nodeWorker 接线后须删除此 input 条目，避免双份打包
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
