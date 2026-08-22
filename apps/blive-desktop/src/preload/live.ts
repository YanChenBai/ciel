// @env browser

import { ipcRenderer } from 'electron';

import type { LivePageEvent } from '../shared/types.ts';

const PAGE_EVENT_CHANNEL = 'blive:page-event';

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin) return;
  const value = event.data as { event?: LivePageEvent; source?: string };
  if (value?.source !== 'ciel-blive-page' || !value.event) return;
  ipcRenderer.send(PAGE_EVENT_CHANNEL, value.event);
});
