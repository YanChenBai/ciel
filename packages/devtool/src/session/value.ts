import type { SerializedValue } from '@ciels/devtool-protocol';

export function deserializeValue(value: SerializedValue): unknown {
  if (value.type === 'omitted') {
    return value.reason === 'pending' ? '等待完成' : `未捕获：${value.reason}`;
  }
  if (value.type === 'serialization-error') return value.error;
  if (value.type === 'asset') return value.asset;
  if (value.encoding === 'text') return value.data;
  try {
    return JSON.parse(value.data) as unknown;
  } catch {
    return value.data;
  }
}

export function valueText(value: SerializedValue): string {
  return readableText(deserializeValue(value));
}

export function prettyValue(value: SerializedValue): string {
  const parsed = deserializeValue(value);
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
}

function readableText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value ?? '');
  if (Array.isArray(value)) return value.map(readableText).filter(Boolean).join('\n');
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return value.name;
  const record = value as Record<string, unknown>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  return JSON.stringify(value, null, 2);
}
