import type { SentDanmaku } from '../shared/types.ts';
import { DANMAKU_HISTORY_LIMIT } from './constants.ts';

export class DanmakuHistory {
  private entries: SentDanmaku[] = [];

  list(roomId?: number, limit = DANMAKU_HISTORY_LIMIT): readonly SentDanmaku[] {
    const entries =
      roomId === undefined ? this.entries : this.entries.filter(x => x.roomId === roomId);
    return entries.slice(-limit);
  }

  hasRecentDuplicate(roomId: number, content: string): boolean {
    const normalized = normalize(content);
    return this.entries
      .filter(item => item.roomId === roomId)
      .some(item => normalize(item.content) === normalized);
  }

  append(entry: SentDanmaku): void {
    this.entries = [...this.entries, entry].slice(-DANMAKU_HISTORY_LIMIT);
  }
}

function normalize(value: string): string {
  return value.replaceAll(/\s+/gu, '').toLocaleLowerCase();
}
