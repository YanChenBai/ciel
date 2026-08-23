// @env browser

import { contextBridge, ipcRenderer } from 'electron';

import type { BliveDesktopApi, BliveDesktopEvent } from '../shared/types.ts';

const IPC = {
  areas: 'blive:areas',
  bootstrap: 'blive:bootstrap',
  command: 'blive:command',
  event: 'blive:event',
  liveBounds: 'blive:live-bounds',
} as const;

const api: BliveDesktopApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  command: command => ipcRenderer.invoke(IPC.command, command),
  listAreas: () => ipcRenderer.invoke(IPC.areas),
  onEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, value: BliveDesktopEvent): void => {
      listener(value);
    };
    ipcRenderer.on(IPC.event, handler);
    return () => ipcRenderer.removeListener(IPC.event, handler);
  },
  setLiveBounds: bounds => ipcRenderer.send(IPC.liveBounds, bounds),
};

contextBridge.exposeInMainWorld('blive', api);
