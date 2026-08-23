// @env node

import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { BliveDesktopState } from '../shared/types.ts';

type InvokeHandler = (event: { readonly sender: unknown }, value?: unknown) => unknown;
type SendHandler = (event: { readonly sender: unknown }, value?: unknown) => void;

const electron = vi.hoisted(() => {
  const handlers = new Map<string, InvokeHandler>();
  const listeners = new Map<string, SendHandler>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: InvokeHandler) => handlers.set(channel, handler)),
      on: vi.fn((channel: string, handler: SendHandler) => listeners.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
      removeListener: vi.fn((channel: string, handler: SendHandler) => {
        if (listeners.get(channel) === handler) listeners.delete(channel);
      }),
    },
    listeners,
  };
});

const api = vi.hoisted(() => ({
  fetchLiveAreas: vi.fn(() => Promise.resolve([{ areas: [], id: 1, name: '娱乐' }])),
}));

vi.mock('electron', () => ({ ipcMain: electron.ipcMain }));
vi.mock('./blive/catalog-api.ts', () => api);

const { IPC } = await import('../shared/ipc.ts');
const { registerBliveDesktopIpc } = await import('./ipc.ts');

beforeEach(() => {
  electron.handlers.clear();
  electron.listeners.clear();
  vi.clearAllMocks();
});

describe('registerBliveDesktopIpc', () => {
  it('公开独立业务方法、校验输入并在释放时移除全部绑定', async () => {
    const state = { connected: true } as BliveDesktopState;
    const controller = Object.assign(new EventEmitter(), {
      login: vi.fn(() => Promise.resolve()),
      logout: vi.fn(() => Promise.resolve()),
      sendDanmaku: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => Promise.resolve()),
      state: vi.fn(() => state),
      stop: vi.fn(() => Promise.resolve()),
    });
    const webContents = {
      isDestroyed: vi.fn(() => false),
      send: vi.fn(),
    };
    const window = {
      isDestroyed: vi.fn(() => false),
      webContents,
    };
    const livePage = { setBounds: vi.fn() };
    const dispose = registerBliveDesktopIpc({
      controller: controller as never,
      livePage: livePage as never,
      window: window as never,
    });
    const trustedEvent = { sender: webContents };

    expect(electron.handlers.get(IPC.stateGet)?.(trustedEvent)).toBe(state);
    await electron.handlers.get(IPC.accountLogin)?.(trustedEvent);
    await electron.handlers.get(IPC.accountLogout)?.(trustedEvent);
    await electron.handlers.get(IPC.runtimeStart)?.(trustedEvent, {
      danmakuDelivery: 'simulate',
      mode: 'standard',
      roomId: 123,
    });
    await electron.handlers.get(IPC.danmakuSend)?.(trustedEvent, '你好');
    expect(controller.login).toHaveBeenCalledWith(window);
    expect(controller.logout).toHaveBeenCalledOnce();
    expect(controller.start).toHaveBeenCalledWith({
      danmakuDelivery: 'simulate',
      mode: 'standard',
      roomId: 123,
    });
    expect(controller.sendDanmaku).toHaveBeenCalledWith('你好');

    expect(() =>
      electron.handlers.get(IPC.runtimeStart)?.(trustedEvent, {
        danmakuDelivery: 'simulate',
        mode: 'standard',
        roomId: 0,
      }),
    ).toThrow();
    expect(() => electron.handlers.get(IPC.stateGet)?.({ sender: {} })).toThrow(
      'Untrusted IPC sender',
    );

    electron.listeners.get(IPC.liveViewSetBounds)?.(trustedEvent, {
      height: 200,
      width: 300,
      x: 10,
      y: 20,
    });
    expect(livePage.setBounds).toHaveBeenCalledWith({ height: 200, width: 300, x: 10, y: 20 });
    electron.listeners.get(IPC.liveViewSetBounds)?.(
      { sender: {} },
      {
        height: 1,
        width: 1,
        x: 0,
        y: 0,
      },
    );
    expect(livePage.setBounds).toHaveBeenCalledTimes(1);

    controller.emit('state', state);
    expect(webContents.send).toHaveBeenCalledWith(IPC.stateEvent, { state, type: 'state' });

    dispose();
    dispose();
    expect(electron.handlers.size).toBe(0);
    expect(electron.listeners.size).toBe(0);
    expect(controller.listenerCount('state')).toBe(0);
    expect(controller.listenerCount('vigilia')).toBe(0);
    expect(electron.ipcMain.removeHandler).toHaveBeenCalledTimes(7);
    expect(electron.ipcMain.removeListener).toHaveBeenCalledOnce();
  });
});
