import { describe, expect, it } from 'vite-plus/test';

import { BILIBILI_EMOJI_TAGS } from './constants.ts';

describe('BILIBILI_EMOJI_TAGS', () => {
  it('contains the complete unique tag set', () => {
    expect(BILIBILI_EMOJI_TAGS).toHaveLength(82);
    expect(new Set(BILIBILI_EMOJI_TAGS)).toHaveProperty('size', BILIBILI_EMOJI_TAGS.length);
    expect(BILIBILI_EMOJI_TAGS).toEqual(
      expect.arrayContaining(['[手机]', '[捂脸2]', '[doge2]', '[三星堆]', '[鬼魂]']),
    );
  });
});
