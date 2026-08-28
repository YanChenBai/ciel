import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type { DefineSensuOptions, Sensu } from './types.ts';

export type {
  DefineSensuOptions,
  Sensu,
  SensuInterpret,
  SensuInterpretation,
  SensuInterpreter,
  SensuSetupContext,
} from './types.ts';

export function defineSensu(options: DefineSensuOptions): Sensu {
  return {
    ...options,
    type: ModuleType.Sensu,
    id: createId(),
  };
}
