import type { MemorySearchResult } from './types.ts';

/**
 * 序列化工具可见记录，不改变其存储表示
 */
export function serializeMemoryResults(results: readonly MemorySearchResult[]): string {
  return JSON.stringify(results);
}
