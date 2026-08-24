import SuperJSON from 'superjson';

import type { Transformer } from './types.ts';

export function defineTransformer<T, Serialized>(transformer: Transformer<T, Serialized>) {
  return transformer;
}

export interface CreateSerializerOptions {
  transformers?: readonly Transformer[];
}

export function createSerializer(options: CreateSerializerOptions = {}) {
  const instance = new SuperJSON();

  for (const transformer of options.transformers ?? []) {
    instance.registerCustom(transformer, transformer.name);
  }

  return instance;
}
