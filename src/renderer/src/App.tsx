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
// T6.1：Liked 页样式（第二处获准渐变 .hero--liked + 排序下拉）。必须在 browse.css 之后——
// .hero--liked 需覆盖 .hero 的 min-height（同特异性，靠源码顺序取胜，见 liked.css 头注释）。
import './styles/liked.css'
// T6.2/T6.4：歌单页（Playlists 网格 + 拼贴封面 + 内联命名/确认条 + 详情页 Hero 拼贴）。
// 必须在 browse.css 之后——.playlist-card / .collage-cover 需在卡片与 .hero 基底之上生效。
import './styles/playlists.css'
// T4.5：搜索（SearchBox 下拉 + SearchResults 结果页 + 紧凑曲目表列格）。
// 必须在 tracklist.css 之后加载：.track-table--compact .track-row 与 .track-table .track-row
// 同特异性（0-2-0），靠后加载覆盖为 6 列格（见 search.css 文件头说明）。
import './styles/search.css'
// T6.5：Recent 页（最近播放轻量表）。必须在 tracklist.css 之后——.track-table--recent
// 的 6 列格与 .track-table .track-row 同特异性（0-2-0），靠后加载覆盖（见 recent.css 头注）。
import './styles/recent.css'
// T7.1：Settings 页（分区锚点导航 + 设置行 + 开关/进度槽基建）。独立作用域类名，
// 与上述文件无同特异性覆盖关系，加载顺序仅作归档（见 settings.css 头注）。
import './styles/settings.css'
// T5.6：轻量 toast（不可播提示等），全局引入（与 cover/tracklist 同层生效）。
import './styles/toast.css'
// T5.6：全局 toast 宿主（role="alert"，单例替换不堆叠），挂载于路由出口之外。
import { ToastHost } from './components/Toast'

function App(): React.JSX.Element {
  return (
    <>
      <RouterProvider router={router} />
      <ToastHost />
    </>
  )
}

export default App
