// @env node

import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';
import { ipcMain } from 'electron';
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import { IPC } from '../shared/ipc.ts';
import type {
  BliveDesktopEvent,
  BliveDesktopState,
  BliveStartOptions,
  LiveViewBounds,
} from '../shared/types.ts';
import { fetchLiveAreas } from './blive/catalog-api.ts';
import type { LivePage } from './live-page.ts';
import type { RuntimeController } from './runtime-controller.ts';

type IpcMainTransport = Pick<IpcMain, 'handle' | 'on' | 'removeHandler' | 'removeListener'>;

export interface RegisterBliveDesktopIpcOptions {
  readonly controller: RuntimeController;
  readonly livePage: LivePage;
  readonly window: BrowserWindow;
}

const startOptionsSchema = z.discriminatedUnion('mode', [
  z
    .object({
      areaUrl: z.string().trim().min(1),
      danmakuDelivery: z.enum(['live', 'simulate']),
      mode: z.literal('autonomous'),
    })
    .strict(),
  z
    .object({
      danmakuDelivery: z.enum(['live', 'simulate']),
      mode: z.literal('standard'),
      roomId: z.number().int().positive().safe(),
    })
    .strict(),
]);

const liveViewBoundsSchema = z
  .object({
    height: z.number().finite(),
    width: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

/** 注册 Renderer 可用的业务 API，并返回与当前窗口绑定的释放函数。 */
export function registerBliveDesktopIpc(
  options: RegisterBliveDesktopIpcOptions,
  transport: IpcMainTransport = ipcMain,
): () => void {
  const { controller, livePage, window } = options;

  transport.handle(IPC.stateGet, event => {
    assertSender(event, window);
    return controller.state();
  });
  transport.handle(IPC.areasList, event => {
    assertSender(event, window);
    return fetchLiveAreas();
  });
  transport.handle(IPC.accountLogin, event => {
    assertSender(event, window);
    return controller.login(window);
  });
  transport.handle(IPC.runtimeStart, (event, value: unknown) => {
    assertSender(event, window);
    return controller.start(startOptionsSchema.parse(value) as BliveStartOptions);
  });
  transport.handle(IPC.runtimeStop, event => {
    assertSender(event, window);
    return controller.stop();
  });
  transport.handle(IPC.danmakuSend, (event, value: unknown) => {
    assertSender(event, window);
    return controller.sendDanmaku(z.string().parse(value));
  });

  const handleLiveViewBounds = (event: IpcMainEvent, value: unknown): void => {
    if (event.sender !== window.webContents) return;
    const result = liveViewBoundsSchema.safeParse(value);
    if (result.success) livePage.setBounds(result.data satisfies LiveViewBounds);
  };
  transport.on(IPC.liveViewSetBounds, handleLiveViewBounds);

  const sendEvent = (event: BliveDesktopEvent): void => {
    if (canSend(window)) window.webContents.send(IPC.stateEvent, event);
  };
  const handleState = (state: BliveDesktopState): void => {
    sendEvent({ state, type: 'state' });
  };
  const handleVigilia = (event: AnyVigiliaEvent, snapshot: VigiliaSnapshot): void => {
    sendEvent({ event, snapshot, type: 'vigilia' });
  };
  controller.on('state', handleState);
  controller.on('vigilia', handleVigilia);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    transport.removeHandler(IPC.stateGet);
    transport.removeHandler(IPC.areasList);
    transport.removeHandler(IPC.accountLogin);
    transport.removeHandler(IPC.runtimeStart);
    transport.removeHandler(IPC.runtimeStop);
    transport.removeHandler(IPC.danmakuSend);
    transport.removeListener(IPC.liveViewSetBounds, handleLiveViewBounds);
    controller.off('state', handleState);
    controller.off('vigilia', handleVigilia);
  };
}

function assertSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (event.sender !== window.webContents) throw new Error('Untrusted IPC sender');
}

function canSend(window: BrowserWindow): boolean {
  return !window.isDestroyed() && !window.webContents.isDestroyed();
}
