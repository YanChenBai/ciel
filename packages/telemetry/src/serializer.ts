import SuperJSON from 'superjson';

import type { Transformer } from './types.ts';

export type TelemetrySerializer = SuperJSON;

export function defineTransformer<T, Serialized>(transformer: Transformer<T, Serialized>) {
  return transformer;
}

export function createSerializer(transformers: readonly Transformer[] = []): TelemetrySerializer {
  const serializer = new SuperJSON();

  for (const transformer of transformers) {
    serializer.registerCustom(transformer, transformer.name);
  }

  return serializer;
}
