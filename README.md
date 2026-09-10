# Windy Concert

本地优先的 Windows 桌面音乐播放器（Electron + TypeScript + SQLite）。Local First：无流媒体、无账号、无云同步、无遥测。

## 开发命令

```
npm run dev      # 开发模式启动
npm run build    # 生产构建
```

（命令清单随 Phase 8 完善。）

## 环境提示

- 本机用户环境变量存在 `NODE_TLS_REJECT_UNAUTHORIZED=0`，npm 安装期会输出 TLS 证书警告，属预期现象。
