// @env node

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';

import { registerIpc } from './ipc.ts';
import { LiveView } from './live-view.ts';
import { RuntimeController } from './runtime.ts';

let mainWindow: BrowserWindow | undefined;
let liveView: LiveView | undefined;
let controller: RuntimeController | undefined;
let disposeIpc: (() => void) | undefined;

loadEnvironment();

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
  liveView = new LiveView(window);
  controller = new RuntimeController(liveView, app.getPath('userData'));
  disposeIpc = registerIpc(window, controller, liveView);
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  window.once('ready-to-show', () => window.show());
  await controller.initialize();
  if (process.env.ELECTRON_VITE_PLUS_SMOKE === '1') {
    const layout = await window.webContents.executeJavaScript(`new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const setup = document.querySelector('[data-view="setup"]');
        const setupRect = setup?.getBoundingClientRect();
        const devtoolButton = [...document.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Devtool'));
        devtoolButton?.click();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const devtool = document.querySelector('.embedded-devtool');
          const devtoolRect = devtool?.getBoundingClientRect();
          const targetHeader = document.querySelector('.embedded-devtool > .devtool > header');
          resolve({
            bridge: Boolean(window.watchBlive),
            devtool: devtoolRect
              ? { height: devtoolRect.height, top: devtoolRect.top, width: devtoolRect.width }
              : undefined,
            setup: setupRect
              ? { height: setupRect.height, top: setupRect.top, width: setupRect.width }
              : undefined,
            targetHeaderDisplay: targetHeader ? getComputedStyle(targetHeader).display : undefined,
            titlebar: Boolean(document.querySelector('.titlebar')),
          });
        }));
      }));
    })`);
    const visible = (rect?: { height: number; top: number; width: number }): boolean =>
      Boolean(rect && rect.width > 0 && rect.height > 0 && rect.top < window.getBounds().height);
    if (
      !layout.bridge ||
      !layout.titlebar ||
      !visible(layout.setup) ||
      !visible(layout.devtool) ||
      layout.targetHeaderDisplay !== 'none'
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
  void active.close().finally(() => {
    liveView?.destroy();
    liveView = undefined;
    app.exit();
  });
});

function loadEnvironment(): void {
  const path = [join(process.cwd(), '.env'), join(app.getAppPath(), '.env')].find(existsSync);
  if (path) process.loadEnvFile(path);
}

function configureDataPath(): void {
  if (process.env.CIEL_DATA_DIR?.trim()) return;
  const workspace = resolve(app.getAppPath(), '..', '..', '.ciel-data');
  process.env.CIEL_DATA_DIR = existsSync(join(workspace, 'models'))
    ? workspace
    : join(app.getPath('userData'), '.ciel-data');
}
