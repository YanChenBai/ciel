// @env browser

import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { BliveIpcInvokeContract, BliveIpcSendContract } from '../shared/ipc.ts';
import type { BliveDesktopApi, BliveDesktopEvent } from '../shared/types.ts';

const api: BliveDesktopApi = {
  account: {
    login: () => invoke(IPC.accountLogin),
    logout: () => invoke(IPC.accountLogout),
  },
  areas: {
    list: () => invoke(IPC.areasList),
  },
  danmaku: {
    send: content => invoke(IPC.danmakuSend, content),
  },
  liveView: {
    setBounds: bounds => send(IPC.liveViewSetBounds, bounds),
  },
  runtime: {
    start: options => invoke(IPC.runtimeStart, options),
    stop: () => invoke(IPC.runtimeStop),
  },
  state: {
    get: () => invoke(IPC.stateGet),
    subscribe(listener) {
      const handler = (_event: Electron.IpcRendererEvent, value: BliveDesktopEvent): void => {
        listener(value);
      };
      ipcRenderer.on(IPC.stateEvent, handler);
      return () => ipcRenderer.removeListener(IPC.stateEvent, handler);
    },
  },
};

contextBridge.exposeInMainWorld('blive', api);

function invoke<Channel extends keyof BliveIpcInvokeContract>(
  channel: Channel,
  ...args: BliveIpcInvokeContract[Channel]['request'] extends undefined
    ? []
    : [BliveIpcInvokeContract[Channel]['request']]
): Promise<BliveIpcInvokeContract[Channel]['response']> {
  return ipcRenderer.invoke(channel, ...args);
}

function send<Channel extends keyof BliveIpcSendContract>(
  channel: Channel,
  value: BliveIpcSendContract[Channel],
): void {
  ipcRenderer.send(channel, value);
}
