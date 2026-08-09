import path from 'node:path';

import { DATA_PATH } from './path.ts';

export const DEFAULT_OCULUS_OUTPUT_DIR =
  process.env.CIEL_OCULUS_OUTPUT_DIR ?? path.join(DATA_PATH, 'sights');
