import type { MemoryResourceSegment } from './types.ts';

/**
 * 将多个业务维度组合成无歧义的资源 ID，避免调用方自行拼接分隔符产生碰撞。
 */
export function createMemoryResourceId(
  ...segments: readonly [MemoryResourceSegment, ...MemoryResourceSegment[]]
): string {
  return segments.map(normalizeSegment).join(':');
}

export function normalizeMemoryResourceId(resourceId: string): string {
  const normalized = resourceId.trim();
  if (!normalized) throw new TypeError('memory.resourceId must not be empty');
  return normalized;
}

/** Mastra 的 thread 与 message ID 是全局主键，内部 ID 必须继续带上资源命名空间。 */
export function createScopedMemoryId(resourceId: string, id: string): string {
  return `${encodeURIComponent(resourceId)}:${id}`;
}

function normalizeSegment(segment: MemoryResourceSegment, index: number): string {
  if (typeof segment === 'number' && !Number.isSafeInteger(segment)) {
    throw new TypeError(`memory resource segment ${index} must be a safe integer`);
  }
  const normalized = String(segment).trim();
  if (!normalized) throw new TypeError(`memory resource segment ${index} must not be empty`);
  try {
    return encodeURIComponent(normalized);
  } catch {
    throw new TypeError(`memory resource segment ${index} is not valid Unicode`);
  }
}
