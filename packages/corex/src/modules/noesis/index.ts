import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type { DefineNoesisOptions, Noesis, NoesisProjection } from './types.ts';

export type {
  AnyNoesis,
  DefineNoesisOptions,
  Noesis,
  NoesisProjection,
  NoesisProjectionResult,
  NoesisSetupContext,
} from './types.ts';

export function defineNoesis<TProjection extends NoesisProjection = undefined>(
  options: DefineNoesisOptions<TProjection>,
): Noesis<TProjection> {
  return {
    ...options,
    type: ModuleType.Noesis,
    id: createId(),
  };
}
