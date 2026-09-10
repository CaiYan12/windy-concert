/// <reference types="vite/client" />

// T3.3 —— window.api 全局类型接线（留痕）：
//   直接从 preload 的 `export type Api = typeof api` 推导（import('...') 仅类型层引用，
//   不产生运行时依赖）。模板的 src/preload/index.d.ts 已合并至此——同目录存在 index.ts
//   时 TS 会将同名 .d.ts 去重跳过，导致其 declare global 失效，故收口在本文件。
//   tsconfig.web.json 的 include 已补 src/preload/index.ts 及其类型依赖（最小闭包）。
import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: import('../../preload/index').Api
  }
}
