import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { app, shell, BrowserWindow, dialog, protocol, net } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { openDatabase } from './database/connection';
import { createAlbumRepo } from './database/repositories/albumRepo';
import { createArtistRepo } from './database/repositories/artistRepo';
import { createCoverRepo } from './database/repositories/coverRepo';
import { createFolderRepo } from './database/repositories/folderRepo';
import { createHistoryRepo } from './database/repositories/historyRepo';
import { createPlaylistRepo } from './database/repositories/playlistRepo';
import { createTrackRepo } from './database/repositories/trackRepo';
import { createCoverService, wireCoverPipeline } from './library/coverService';
import { createScanService } from './library/scanService';
import { createSettingsStore } from './settings/settingsStore';
import { IPC } from './ipc/channels';
import { registerIpcHandlers } from './ipc';
import { createFolderCache, handleAudioRequest, handleCoverRequest } from './library/protocols';

// WC_USER_DATA 钩子保留：测试/便携化可注入 userData 目录（T0 脚手架约定，留痕）。
if (process.env.WC_USER_DATA) app.setPath('userData', process.env.WC_USER_DATA);

// T3.2 自定义协议特权声明（§3.5f）：registerSchemesAsPrivileged 必须在 app ready 前调用——
//   本语句位于模块顶层、app.whenReady() 之前（Electron 官方约束：ready 后调用抛错，位置自查留痕）。
//   stream: true 允许 <audio>/<img> 流式消费；supportFetchAPI: true 允许渲染层 fetch 该 scheme。
protocol.registerSchemesAsPrivileged([
  { scheme: 'wc-file', privileges: { stream: true, supportFetchAPI: true } },
  { scheme: 'wc-cover', privileges: { stream: true, supportFetchAPI: true } },
]);

// 主窗口惰性引用：scan/cover 事件 send 在窗口创建后才有效（未创建时静默丢弃）。
let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });
  mainWindow = win;

  // 关闭时清引用：macOS 关窗不退出（activate 可重建）场景下防悬挂引用
  // 触发 "Object has been destroyed"（send 侧 mainWindow?. 惰性取用依赖此清理，留痕）。
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // ---- 数据库与各项服务装配（T3.1 接线；移除脚手架 ping 测试）----
  const userData = app.getPath('userData');
  const db = openDatabase(join(userData, 'library.db'));

  const settingsStore = createSettingsStore({ settingsDir: userData });
  const coversDir = join(userData, 'covers');

  const folderRepo = createFolderRepo(db);
  const trackRepo = createTrackRepo(db);
  const albumRepo = createAlbumRepo(db);
  const artistRepo = createArtistRepo(db);
  const playlistRepo = createPlaylistRepo(db);
  const historyRepo = createHistoryRepo(db);
  const coverRepo = createCoverRepo(db);

  // 启用中的音乐目录（scanService 的 getFolders 数据源）。
  // 评审修复加固：folderRepo 存储侧已归一，此处 map path.normalize 双保险统一 win32 分隔符，
  //   防止后续 wc-file 前缀校验因混合 '\\'/'/' 分隔符误判（留痕）。
  const getFolders = (): string[] =>
    folderRepo.list().filter((f) => f.enabled).map((f) => normalize(f.path));

  // T3.2 启用目录缓存（wc-file 前缀校验数据源）：协议 handler 高频调用，避免逐请求查库；
  // 目录变更（add/remove/setEnabled）由 ipc 侧 onFoldersChanged 回调失效（留痕）。
  const folderCache = createFolderCache(getFolders);

  // 封面服务：onCoverReady → webContents.send('covers:ready')（事件方向 event→r）。
  const coverService = createCoverService({
    db,
    coversDir,
    onCoverReady: (p) => {
      mainWindow?.webContents.send(IPC.CHANNELS.COVERS_READY, p);
    },
  });

  // 扫描服务：评审新形态——wireCoverPipeline 返回注入 onCoverJob 的新 deps（不改写入参）。
  // onProgress → webContents.send('scan:progress')；coverDroppedExtra 汇合封面队列侧丢弃计数。
  const scanService = createScanService(
    wireCoverPipeline(
      {
        db,
        getFolders,
        coverDroppedExtra: () => coverService.droppedCount,
        onProgress: (p) => {
          mainWindow?.webContents.send(IPC.CHANNELS.SCAN_PROGRESS, p);
        },
      },
      coverService,
    ),
  );

  // 注册全部 IPC handler（deps 显式注入；dialog 默认 electron dialog）。
  registerIpcHandlers({
    db,
    trackRepo,
    albumRepo,
    artistRepo,
    playlistRepo,
    historyRepo,
    folderRepo,
    coverRepo,
    scanService,
    coverService,
    settingsStore,
    getFolders,
    onFoldersChanged: () => folderCache.invalidate(),
    getMainWindow,
    dialog,
  });

  createWindow();

  // ---- T3.2 自定义协议注册（§3.5f；ready 后 protocol.handle 接线）----
  // T4.10 留痕：handler 主体已提取至 library/protocols.ts（handleAudioRequest /
  //   handleCoverRequest，T4.10 失败分支单测直驱）；此处仅薄封装接线——net.fetch /
  //   existsSync 注入，folderCache / coversDir 闭包供给，行为与原内联实现逐字一致。
  // wc-file：resolveAudioRequest 前缀校验（folderCache 供启用目录集合，目录变更经 ipc 侧失效）
  //   → 命中放行 net.fetch(pathToFileURL) 返回流；越界 403（错误说明写入 body）；取流失败 404。
  protocol.handle('wc-file', (request) =>
    handleAudioRequest(request.url, folderCache.get(), (input) => net.fetch(input)),
  );

  // wc-cover：resolveCoverRequest 校验 UUID + 尺寸白名单 → existsSync 检查 → net.fetch 返回流
  //   （非法请求 400；文件缺失 / 取流失败 404 兜底）。
  protocol.handle('wc-cover', (request) =>
    handleCoverRequest(request.url, coversDir, (input) => net.fetch(input), existsSync),
  );

  // 启动扫描（按设置 autoScanOnStartup；存在启用目录才后台触发，不阻塞窗口显示）。
  scanService.startupScan(settingsStore.get().autoScanOnStartup);

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
