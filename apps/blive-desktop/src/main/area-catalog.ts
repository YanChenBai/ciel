// @env node

import type { LiveRoomCandidate } from '../shared/types.ts';
import { fetchLiveRoomsByArea } from './blive/catalog-api.ts';

export interface LiveRoomPage {
  readonly candidates: readonly LiveRoomCandidate[];
  readonly hasMore: boolean;
  readonly page: number;
}

export class AreaCatalog {
  private areaUrl?: string;
  private batch = 0;
  private readonly pages = new Map<number, LiveRoomPage>();

  async list(areaUrl: string, page: number, limit: number): Promise<LiveRoomPage> {
    const area = parseAreaUrl(areaUrl);
    if (page === 1 || areaUrl !== this.areaUrl) this.reset(areaUrl);
    const cached = this.pages.get(page);
    if (cached) return cached;
    if (page !== this.batch + 1) {
      throw new Error(`请按顺序加载分区页，下一页是 ${this.batch + 1}`);
    }

    const result = await fetchLiveRoomsByArea(area.parentAreaId, area.areaId, page, limit);

    this.batch = page;
    const liveRoomPage: LiveRoomPage = {
      candidates: result.candidates,
      hasMore: result.hasMore,
      page,
    };
    this.pages.set(page, liveRoomPage);
    return liveRoomPage;
  }

  close(): void {
    this.areaUrl = undefined;
    this.batch = 0;
    this.pages.clear();
  }

  private reset(areaUrl: string): void {
    this.close();
    this.areaUrl = areaUrl;
  }
}

export function parseAreaUrl(value: string): { areaId: number; parentAreaId: number } {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'live.bilibili.com' ||
    url.pathname !== '/p/eden/area-tags'
  ) {
    throw new Error('areaUrl must be an https://live.bilibili.com URL');
  }
  if (!url.searchParams.has('parentAreaId') || !url.searchParams.has('areaId')) {
    throw new Error('areaUrl must contain parentAreaId and areaId');
  }
  const parentAreaId = Number(url.searchParams.get('parentAreaId'));
  const areaId = Number(url.searchParams.get('areaId'));
  if (!Number.isSafeInteger(parentAreaId) || parentAreaId <= 0) {
    throw new Error('areaUrl must contain a positive parentAreaId');
  }
  if (!Number.isSafeInteger(areaId) || areaId < 0) {
    throw new Error('areaUrl must contain a non-negative areaId');
  }
  return { areaId, parentAreaId };
}
