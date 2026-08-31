export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface AssetReference {
  readonly id: string;
  readonly mediaType: string;
  readonly name?: string;
  readonly size?: number;
}

export interface ProtocolErrorRecord {
  readonly message: string;
  readonly name: string;
  readonly stack?: string;
}

export type SerializedValue =
  | {
      readonly type: 'omitted';
      readonly reason: 'capture-disabled' | 'redacted' | 'unsupported';
    }
  | {
      readonly type: 'serialized';
      readonly encoding: 'json' | 'superjson' | 'text';
      readonly data: string;
      readonly preview?: string;
    }
  | {
      readonly type: 'serialization-error';
      readonly error: ProtocolErrorRecord;
    }
  | {
      readonly type: 'asset';
      readonly asset: AssetReference;
    };
