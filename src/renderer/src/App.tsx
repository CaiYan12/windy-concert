// T4.1：应用根组件 = 路由出口。壳层与页面均由 router.tsx 的路由表承载
// （AppShell 布局路由 + 11 条页面子路由），根组件本身不再持有任何 UI 结构。
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
// 壳层样式：tokens.css → assets/main.css（含 base.css）之后加载，覆盖其中残留的模板全局排版。
import './styles/shell.css'

function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}

export default App
