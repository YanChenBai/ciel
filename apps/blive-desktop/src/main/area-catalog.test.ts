// @env node

import { describe, expect, it } from 'vite-plus/test';

import { parseAreaUrl } from './area-catalog.ts';

describe('parseAreaUrl', () => {
  it('parses parent and child area ids from a Bilibili area URL', () => {
    expect(
      parseAreaUrl('https://live.bilibili.com/p/eden/area-tags?parentAreaId=9&areaId=371'),
    ).toEqual({ areaId: 371, parentAreaId: 9 });
  });

  it('supports the parent area all option', () => {
    expect(
      parseAreaUrl('https://live.bilibili.com/p/eden/area-tags?parentAreaId=9&areaId=0'),
    ).toEqual({ areaId: 0, parentAreaId: 9 });
  });

  it('rejects unrelated URLs and missing ids', () => {
    expect(() => parseAreaUrl('https://live.bilibili.com/123')).toThrow();
    expect(() =>
      parseAreaUrl('https://live.bilibili.com/p/eden/area-tags?parentAreaId=9'),
    ).toThrow();
    expect(() =>
      parseAreaUrl('https://example.com/p/eden/area-tags?parentAreaId=9&areaId=0'),
    ).toThrow();
  });
});
