import { describe, expect, it } from 'vite-plus/test';

import { DANMAKU_HISTORY_LIMIT } from './constants.ts';
import { DanmakuHistory } from './danmaku-history.ts';

describe('DanmakuHistory', () => {
  it('keeps a fixed-size in-memory history', () => {
    const history = new DanmakuHistory();
    for (let index = 0; index < DANMAKU_HISTORY_LIMIT + 5; index += 1) {
      history.append({ content: `message-${index}`, roomId: 1, sentAt: index });
    }

    expect(history.list()).toHaveLength(DANMAKU_HISTORY_LIMIT);
    expect(history.list()[0]?.content).toBe('message-5');
  });

  it('detects normalized duplicates only within the same room', () => {
    const history = new DanmakuHistory();
    history.append({ content: '可以的 [OK]', roomId: 1, sentAt: 1 });

    expect(history.hasRecentDuplicate(1, '可以的[ok]')).toBe(true);
    expect(history.hasRecentDuplicate(2, '可以的[ok]')).toBe(false);
  });

  it('rejects duplicates anywhere in the retained history without time throttling', () => {
    const history = new DanmakuHistory();
    history.append({ content: '第一条', roomId: 1, sentAt: 1 });
    for (let index = 0; index < 30; index += 1) {
      history.append({ content: `后续-${index}`, roomId: 1, sentAt: index + 2 });
    }

    expect(history.hasRecentDuplicate(1, '第一条')).toBe(true);
    expect(history.hasRecentDuplicate(1, '新的现场回应')).toBe(false);
  });
});
