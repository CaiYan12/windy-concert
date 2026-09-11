// T4.1：应用根组件 = 路由出口。壳层与页面均由 router.tsx 的路由表承载
// （AppShell 布局路由 + 11 条页面子路由），根组件本身不再持有任何 UI 结构。
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
// 壳层样式：tokens.css → assets/main.css（含 base.css）之后加载，覆盖其中残留的模板全局排版。
import './styles/shell.css'
// T4.3 组件样式：Cover（含 PlayerBar 复用的 .cover 基类）与 TrackList（表格/行/右键菜单）。
// 在根组件全局引入而非组件内引入——.cover 是壳层原语（PlayerBar T4.1 已用），全局加载不依赖组件树。
import './styles/cover.css'
import './styles/tracklist.css'
// T4.4：浏览页（Songs/Albums/Artists/详情）布局样式，全局引入（与 cover/tracklist 同层生效）。
import './styles/browse.css'
// T4.5：搜索（SearchBox 下拉 + SearchResults 结果页 + 紧凑曲目表列格）。
// 必须在 tracklist.css 之后加载：.track-table--compact .track-row 与 .track-table .track-row
// 同特异性（0-2-0），靠后加载覆盖为 6 列格（见 search.css 文件头说明）。
import './styles/search.css'

function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}

export default App
