// @env node

import { randomUUID } from 'node:crypto';

import { createDevtoolBridge } from '@ciels/devtool-bridge';
import type { DevtoolConsumerMessage } from '@ciels/devtool-protocol';
import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { StartOptions } from '../shared/types.ts';
import { fetchAreas } from './bilibili.ts';
import { createRuntimeTarget } from './devtool.ts';
import type { RuntimeController } from './runtime.ts';

export function registerIpc(window: BrowserWindow, controller: RuntimeController) {
  const handle = <T>(channel: string, action: (value: T) => unknown) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, value: T) => {
      assertSender(event, window);
      return action(value);
    });
  };

  handle(IPC.stateGet, () => controller.state());
  handle(IPC.areasList, () => fetchAreas());
  handle(IPC.accountLogin, () => controller.login(window));
  handle(IPC.accountLogout, () => controller.logout());
  handle<StartOptions>(IPC.runtimeStart, value => controller.start(assertStartOptions(value)));
  handle(IPC.runtimeStop, () => controller.stop());

  const bridge = createDevtoolBridge({
    createId: randomUUID,
    epoch: randomUUID(),
    target: createRuntimeTarget(controller),
  });

  const detach = bridge.attach({
    send(message) {
      if (!window.isDestroyed()) window.webContents.send(IPC.devtoolFromMain, message);
    },
    subscribe(listener) {
      const onMessage = (event: IpcMainEvent, value: unknown): void => {
        if (event.sender === window.webContents && isDevtoolMessage(value)) void listener(value);
      };
      ipcMain.on(IPC.devtoolToMain, onMessage);
      return () => {
        ipcMain.removeListener(IPC.devtoolToMain, onMessage);
      };
    },
  });

  const publish = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.stateChanged, controller.state());
    }
  };

  controller.on('state', publish);

  return () => {
    for (const channel of [
      IPC.stateGet,
      IPC.areasList,
      IPC.accountLogin,
      IPC.accountLogout,
      IPC.runtimeStart,
      IPC.runtimeStop,
    ])
      ipcMain.removeHandler(channel);
    controller.off('state', publish);
    void detach();
    void bridge.close();
  };
}

function assertSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender !== window.webContents) throw new Error('Untrusted IPC sender');
}

function assertStartOptions(value: StartOptions): StartOptions {
  if (!value || (value.mode !== 'standard' && value.mode !== 'autonomous'))
    throw new TypeError('Invalid start options');
  if (value.danmakuDelivery !== 'live' && value.danmakuDelivery !== 'simulate')
    throw new TypeError('Invalid danmaku delivery');
  const id = value.mode === 'standard' ? value.roomId : value.areaId;
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError('Invalid room or area id');
  return value;
}

function isDevtoolMessage(value: unknown): value is DevtoolConsumerMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    message.protocol === 'ciel.devtool' &&
    typeof message.id === 'string' &&
    (message.type === 'hello' || message.type === 'request')
  );
}
