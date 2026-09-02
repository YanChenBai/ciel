// @env node

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';

import { registerIpc } from './ipc.ts';
import { LiveRoomWindow } from './live-room-window.ts';
import { RuntimeController } from './runtime.ts';

let mainWindow: BrowserWindow | undefined;
let controller: RuntimeController | undefined;
let disposeIpc: (() => void) | undefined;

loadEnvironment();
configureUserDataPath();
configureRemoteDebugging();

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    height: 900,
    minHeight: 640,
    minWidth: 1024,
    show: false,
    title: 'Watch Blive',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1c1d1e', height: 42, symbolColor: '#eeeeef' },
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
  controller = new RuntimeController(app.getPath('userData'), new LiveRoomWindow(window));
  disposeIpc = registerIpc(window, controller);
  window.once('ready-to-show', () => window.show());
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  await controller.initialize();
  if (process.env.ELECTRON_VITE_PLUS_SMOKE === '1') {
    const layout = await window.webContents.executeJavaScript(`new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const setup = document.querySelector('[data-view="setup"]');
        const setupRect = setup?.getBoundingClientRect();
        const formRect = setup?.querySelector('form')?.getBoundingClientRect();
        resolve({
          bridge: Boolean(window.watchBlive),
          form: formRect ? { height: formRect.height, width: formRect.width } : undefined,
          setup: setupRect
            ? { height: setupRect.height, top: setupRect.top, width: setupRect.width }
            : undefined,
          titlebar: Boolean(document.querySelector('.titlebar')),
        });
      }));
    })`);
    const visible = (rect?: { height: number; top: number; width: number }): boolean =>
      Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top < window.getBounds().height);
    if (
      !layout.bridge ||
      !layout.titlebar ||
      !visible(layout.setup) ||
      !layout.form ||
      layout.form.width < 380 ||
      layout.form.width > 420
    ) {
      throw new Error(`Electron renderer layout is invalid: ${JSON.stringify(layout)}`);
    }
    console.log('EVP_SMOKE_READY');
  }
  window.on('closed', () => {
    disposeIpc?.();
    disposeIpc = undefined;
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
    dialog.showErrorBox(
      'Watch Blive 启动失败',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', event => {
  if (!controller) return;
  event.preventDefault();
  disposeIpc?.();
  disposeIpc = undefined;
  const active = controller;
  controller = undefined;
  const finish = (): void => {
    app.exit();
  };
  void active.close().then(finish, error => {
    console.error('[watch-blive:shutdown]', error);
    finish();
  });
});

function loadEnvironment(): void {
  const path = [join(process.cwd(), '.env'), join(app.getAppPath(), '.env')].find(existsSync);
  if (path) process.loadEnvFile(path);
}

function configureRemoteDebugging(): void {
  if (app.isPackaged || process.env.ELECTRON_VITE_PLUS_SMOKE === '1') return;
  const port = process.env.REMOTE_DEBUGGING_PORT?.trim() || '9334';
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', 'devtools://devtools');
}

function configureUserDataPath(): void {
  const path = process.env.WATCH_BLIVE_USER_DATA_DIR?.trim();
  if (path) app.setPath('userData', resolve(path));
}

function configureDataPath(): void {
  if (process.env.CIEL_DATA_DIR?.trim()) return;
  const workspaceRoot = resolve(app.getAppPath(), '..', '..');
  const workspace = [join(workspaceRoot, '.ciel'), join(workspaceRoot, '.ciel-data')].find(path =>
    existsSync(join(path, 'models')),
  );
  process.env.CIEL_DATA_DIR = workspace ?? join(app.getPath('userData'), '.ciel');
}
