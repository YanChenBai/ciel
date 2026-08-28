import { ModuleType } from '#modules/types.ts';
import { createId } from '#shared/id.ts';

import type { DefineStimulusOptions, Stimulus } from './types.ts';

export type {
  AnyStimulus,
  DefineStimulusOptions,
  Stimulus,
  StimulusSetupContext,
} from './types.ts';

export function defineStimulus(options: DefineStimulusOptions): Stimulus {
  return {
    ...options,
    type: ModuleType.Stimulus,
    id: createId(),
  };
}
