// T3.3：electron-vite 模板自检 UI（logo/版本展示/ping 按钮）已随 window.electron
// 暴露的移除而清理，Phase 4 将整体替换为正式 UI；此处仅保留最小根元素。
function App(): React.JSX.Element {
  return <div id="app-root" />
}

export default App
