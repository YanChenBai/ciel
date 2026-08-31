// @env browser

import type { DevtoolProviderMessage } from '@ciels/devtool-protocol';
import { contextBridge, ipcRenderer } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { AppState, StartOptions, ViewBounds, WatchBliveApi } from '../shared/types.ts';

const api: WatchBliveApi = {
  account: {
    login: () => ipcRenderer.invoke(IPC.accountLogin),
    logout: () => ipcRenderer.invoke(IPC.accountLogout),
  },
  areas: { list: () => ipcRenderer.invoke(IPC.areasList) },
  devtool: {
    send: message => ipcRenderer.send(IPC.devtoolToMain, message),
    subscribe(listener) {
      const handle = (_event: Electron.IpcRendererEvent, message: DevtoolProviderMessage) =>
        listener(message);
      ipcRenderer.on(IPC.devtoolFromMain, handle);
      return () => ipcRenderer.removeListener(IPC.devtoolFromMain, handle);
    },
  },
  liveView: {
    setBounds: (bounds: ViewBounds) => ipcRenderer.send(IPC.liveBounds, bounds),
    setVisible: visible => ipcRenderer.send(IPC.liveVisible, visible),
  },
  runtime: {
    start: (options: StartOptions) => ipcRenderer.invoke(IPC.runtimeStart, options),
    stop: () => ipcRenderer.invoke(IPC.runtimeStop),
  },
  state: {
    get: () => ipcRenderer.invoke(IPC.stateGet),
    subscribe(listener) {
      const handle = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
      ipcRenderer.on(IPC.stateChanged, handle);
      return () => ipcRenderer.removeListener(IPC.stateChanged, handle);
    },
  },
};

contextBridge.exposeInMainWorld('watchBlive', api);
