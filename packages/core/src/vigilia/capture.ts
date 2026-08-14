import type { VigiliaJsonValue } from './types.ts';

const MAX_DEPTH = 10;
const MAX_ITEMS = 100;
const MAX_STRING = 20_000;

/** Project runtime values into bounded JSON for an observability journal. */
export function captureVigiliaValue(value: unknown): VigiliaJsonValue {
  return capture(value, new WeakSet<object>(), 0, 'value');
}

function capture(
  value: unknown,
  ancestors: WeakSet<object>,
  depth: number,
  key: string,
): VigiliaJsonValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if ((key === 'data' || key === 'image') && looksLikeBinary(value)) {
      return `[binary content omitted; ${value.length} chars]`;
    }
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}\n…[${value.length - MAX_STRING} chars omitted]`
      : value;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined') return '[undefined]';
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name}; ${value.byteLength} bytes]`;
  }
  if (value instanceof ArrayBuffer) return `[ArrayBuffer; ${value.byteLength} bytes]`;
  if (depth >= MAX_DEPTH) return '[maximum depth reached]';
  if (ancestors.has(value)) return '[circular reference]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result = value
        .slice(0, MAX_ITEMS)
        .map(item => capture(item, ancestors, depth + 1, key));
      if (value.length > MAX_ITEMS) result.push(`[${value.length - MAX_ITEMS} items omitted]`);
      return result;
    }

    const result: Record<string, VigiliaJsonValue> = {};
    const entries = Object.entries(value).slice(0, MAX_ITEMS);
    for (const [childKey, child] of entries) {
      result[childKey] = capture(child, ancestors, depth + 1, childKey);
    }
    const count = Object.keys(value).length;
    if (count > MAX_ITEMS) result.$omitted = `${count - MAX_ITEMS} properties`;
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function looksLikeBinary(value: string): boolean {
  return (
    value.startsWith('data:image/') || (value.length > 2_000 && /^[A-Za-z0-9+/=\r\n]+$/.test(value))
  );
}
