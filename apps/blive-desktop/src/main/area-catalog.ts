// @env node

import { BrowserWindow, session } from 'electron';

import type { LiveRoomCandidate } from '../shared/types.ts';

const LIVE_ROOM_URL_PATTERN = /^https:\/\/live\.bilibili\.com\/(?:blanc\/)?(\d+)(?:[/?#].*)?$/u;

export interface LiveRoomPage {
  readonly candidates: readonly LiveRoomCandidate[];
  readonly hasMore: boolean;
  readonly page: number;
}

export class AreaCatalog {
  private areaUrl?: string;
  private batch = 0;
  private readonly pages = new Map<number, LiveRoomPage>();
  private readonly seenRoomIds = new Set<number>();
  private window?: BrowserWindow;

  async list(areaUrl: string, page: number, limit: number): Promise<LiveRoomPage> {
    assertAreaUrl(areaUrl);
    if (page === 1 || areaUrl !== this.areaUrl) await this.reset(areaUrl);
    const cached = this.pages.get(page);
    if (cached) return cached;
    if (page !== this.batch + 1) {
      throw new Error(`请按顺序加载分区页，下一页是 ${this.batch + 1}`);
    }

    const window = await this.getWindow();
    const candidates = new Map<number, LiveRoomCandidate>();
    let stagnant = 0;
    for (let attempt = 0; attempt < 16 && candidates.size < limit; attempt += 1) {
      const observedBefore = this.seenRoomIds.size;
      for (const item of await extractCandidates(window)) {
        const match = LIVE_ROOM_URL_PATTERN.exec(item.href);
        const roomId = Number(match?.[1]);
        if (!Number.isSafeInteger(roomId) || this.seenRoomIds.has(roomId)) continue;
        this.seenRoomIds.add(roomId);
        const title = (item.imageAlt || item.text).slice(0, 80).trim();
        if (!title) continue;
        candidates.set(roomId, {
          anchor: item.imageAlt || '未知主播',
          roomId,
          title,
        });
        if (candidates.size >= limit) break;
      }

      stagnant = this.seenRoomIds.size === observedBefore ? stagnant + 1 : 0;
      if (stagnant >= 4 || candidates.size >= limit) break;
      await scrollToPageEnd(window);
      await delay(900);
    }

    this.batch = page;
    const result: LiveRoomPage = {
      candidates: [...candidates.values()],
      hasMore: stagnant < 4,
      page,
    };
    this.pages.set(page, result);
    return result;
  }

  close(): void {
    this.window?.destroy();
    this.window = undefined;
    this.areaUrl = undefined;
    this.batch = 0;
    this.pages.clear();
    this.seenRoomIds.clear();
  }

  private async reset(areaUrl: string): Promise<void> {
    this.close();
    this.areaUrl = areaUrl;
    const window = await this.getWindow();
    await window.loadURL(areaUrl);
    await window.webContents.executeJavaScript('window.scrollTo(0, 0)', true);
    await delay(800);
  }

  private async getWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: session.defaultSession,
      },
    });
    window.setMenuBarVisibility(false);
    this.window = window;
    return window;
  }
}

async function extractCandidates(
  window: BrowserWindow,
): Promise<Array<{ href: string; imageAlt: string; text: string }>> {
  return window.webContents.executeJavaScript(
    `([...document.querySelectorAll('a[href]')]).map(anchor => {
      const card = anchor.closest('[class*="room"], [class*="card"], [class*="item"], li') ?? anchor;
      const image = card.querySelector('img');
      return {
        href: anchor.href,
        imageAlt: image?.alt?.trim() ?? '',
        text: (card.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      };
    })`,
    true,
  );
}

async function scrollToPageEnd(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `window.scrollTo({ top: document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight, behavior: 'auto' })`,
    true,
  );
}

function assertAreaUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'live.bilibili.com') {
    throw new Error('areaUrl must be an https://live.bilibili.com URL');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
