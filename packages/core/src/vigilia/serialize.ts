import { toError } from '@ciels/event';

import type { VigiliaError, VigiliaJsonValue } from './types.ts';

/**
 * 将事件载荷严格复制为不可变 JSON。
 * 与 captureVigiliaValue 不同，这里会拒绝非法值，而不是将其概括为占位文本。
 */
export function snapshotJson(value: unknown): VigiliaJsonValue {
  return copyJson(value, new WeakSet<object>(), '$');
}

export function serializeError(input: unknown): VigiliaError {
  const error = toError(input);
  return Object.freeze({
    message: error.message,
    name: error.name,
    ...(error.stack ? { stack: error.stack } : {}),
  });
}

function copyJson(value: unknown, ancestors: WeakSet<object>, path: string): VigiliaJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(`${path} must contain only finite JSON numbers`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} contains a non-JSON ${typeof value} value`);
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: VigiliaJsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index))
          throw new TypeError(`${path} must not contain array holes`);
        result.push(copyJson(value[index], ancestors, `${path}[${index}]`));
      }
      return Object.freeze(result);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain JSON objects`);
    }
    const result: Record<string, VigiliaJsonValue> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable) continue;
      if (!('value' in descriptor)) throw new TypeError(`${path}.${key} must not be an accessor`);
      result[key] = copyJson(descriptor.value, ancestors, `${path}.${key}`);
    }
    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}
