// T4.1 应用路由（hash 路由）——
//
// 为什么必须是 hash 路由（createHashRouter）而非 BrowserRouter：
//   Electron 生产环境 renderer 由 main 进程 loadFile() 以 `file://` 协议加载（见 src/main/index.ts），
//   history 路由在 file:// 下没有 http 服务端可做 SPA fallback，任何深链/刷新都会落到不存在的
//   文件路径（如 file:///D:/.../out/renderer/albums）而白屏；hash 路由把路径放在 location.hash，
//   浏览器始终只请求同一个 index.html，深链、刷新、前进后退均可用，且不需要改主进程协议注册。
//
// 路由结构：单层 AppShell 布局路由 + 11 条页面子路由。
//   · '/'（空 hash）与未知路径均 replace 重定向到落地页 Songs（F3-1），保证无死链；
//   · 页面本体 T4.1 一律为 PagePlaceholder（T4.4 起逐个替换为真实页面）。
import { Navigate, createHashRouter, type RouteObject } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { PagePlaceholder } from './pages/PagePlaceholder'
import { DEFAULT_ROUTE_PATH, ROUTE_DEFS } from './routes'

const pageRoutes: RouteObject[] = ROUTE_DEFS.map((def) => ({
  // 子路由用相对路径（去掉前导 '/'）；参数段 ':id' 原样保留。
  path: def.path.replace(/^\//, ''),
  element: <PagePlaceholder />
}))

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> },
      ...pageRoutes,
      { path: '*', element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> }
    ]
  }
])
