// @env browser

import { ipcRenderer } from 'electron';

import { IPC } from '../shared/ipc.ts';
import type { LivePageEvent } from '../shared/types.ts';

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const value = event.data as { event?: LivePageEvent; source?: string };
  if (value?.source !== 'ciel-blive-page' || !value.event) return;
  ipcRenderer.send(IPC.pageEvent, value.event);
});
