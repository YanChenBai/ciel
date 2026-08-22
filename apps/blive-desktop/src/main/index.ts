// @env node

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { WebContents } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { BliveCommand, LiveViewBounds } from '../shared/types.ts';
import { LivePage } from './live-page.ts';
import type { RuntimeController } from './runtime-controller.ts';

let mainWindow: BrowserWindow | undefined;
let livePage: LivePage | undefined;
let controller: RuntimeController | undefined;

loadEnvironment();
configureRemoteDebugging();

async function createWindow(): Promise<void> {
  const { RuntimeController } = await import('./runtime-controller.ts');
  const window = new BrowserWindow({
    height: 900,
    minHeight: 640,
    minWidth: 1024,
    show: false,
    title: 'Ciel Blive',
    titleBarOverlay: {
      color: '#1c1d1e',
      height: 41,
      symbolColor: '#eeeeef',
    },
    titleBarStyle: 'hidden',
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, '../preload/index.js'),
      sandbox: false,
    },
  });
  mainWindow = window;
  window.setMenuBarVisibility(false);
  window.once('ready-to-show', () => window.show());
  livePage = new LivePage(window, join(import.meta.dirname, '../preload/live.js'));
  controller = new RuntimeController({ livePage, userDataPath: app.getPath('userData') });

  controller.on('state', state => {
    if (canSend(window)) window.webContents.send(IPC.event, { state, type: 'state' });
  });
  controller.on('vigilia', (event, snapshot) => {
    if (canSend(window)) window.webContents.send(IPC.event, { event, snapshot, type: 'vigilia' });
  });

  ipcMain.handle(IPC.bootstrap, event => {
    assertSender(event.sender, window);
    return controller?.state();
  });
  ipcMain.handle(IPC.command, async (event, command: BliveCommand) => {
    assertSender(event.sender, window);
    if (!controller) throw new Error('Blive runtime is unavailable');
    if (command.type === 'login') await controller.login(window);
    else if (command.type === 'start') await controller.start(command.options);
    else if (command.type === 'stop') await controller.stop();
    else if (command.type === 'send-danmaku') await controller.sendDanmaku(command.content);
  });
  ipcMain.on(IPC.liveBounds, (event, bounds: LiveViewBounds) => {
    if (event.sender !== window.webContents || !isBounds(bounds)) return;
    livePage?.setBounds(bounds);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
  window.webContents.setZoomFactor(1);
  await window.webContents.setVisualZoomLevelLimits(1, 1);
  if (process.env.ELECTRON_VITE_PLUS_SMOKE === '1') {
    const bridgeReady = await window.webContents.executeJavaScript('Boolean(window.blive)');
    if (!bridgeReady) throw new Error('Electron preload bridge is unavailable');
    console.log('EVP_SMOKE_READY');
  }
  void controller.initialize();
  window.on('closed', () => {
    mainWindow = undefined;
  });
}

void app
  .whenReady()
  .then(async () => {
    configureDataPath();
    await createWindow();
    app.on('activate', () => {
      if (!mainWindow) void createWindow();
    });
  })
  .catch(error => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    dialog.showErrorBox('Ciel Blive 启动失败', message);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', event => {
  if (!controller) return;
  event.preventDefault();
  const activeController = controller;
  controller = undefined;
  void activeController.close().finally(() => {
    livePage?.destroy();
    livePage = undefined;
    app.exit();
  });
});

function assertSender(sender: WebContents, window: BrowserWindow): void {
  if (sender !== window.webContents) throw new Error('Untrusted IPC sender');
}

function canSend(window: BrowserWindow): boolean {
  return !window.isDestroyed() && !window.webContents.isDestroyed();
}

function isBounds(value: unknown): value is LiveViewBounds {
  if (!value || typeof value !== 'object') return false;
  const bounds = value as Record<string, unknown>;
  return ['height', 'width', 'x', 'y'].every(
    key => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]),
  );
}

function loadEnvironment(): void {
  const candidates = [join(process.cwd(), '.env'), join(app.getAppPath(), '.env')];
  const path = candidates.find(
    (candidate, index) => existsSync(candidate) && candidates.indexOf(candidate) === index,
  );
  if (path) process.loadEnvFile(path);
}

function configureRemoteDebugging(): void {
  if (app.isPackaged || process.env.ELECTRON_VITE_PLUS_SMOKE === '1') return;
  const port = process.env.BLIVE_REMOTE_DEBUGGING_PORT?.trim() || '9333';
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', port);
}

function configureDataPath(): void {
  if (process.env.CIEL_DATA_DIR?.trim()) return;
  const workspacePath = resolve(app.getAppPath(), '..', '..', '.ciel-data');
  const userPath = join(app.getPath('userData'), '.ciel-data');
  process.env.CIEL_DATA_DIR = existsSync(join(workspacePath, 'models')) ? workspacePath : userPath;
}
