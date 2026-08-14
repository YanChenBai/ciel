import path from 'node:path';

import { DATA_PATH } from '#constants';

export const DEFAULT_MEMORY_PATH = path.join(DATA_PATH, 'memory.db');
export const DEFAULT_RECENT_MEMORY_DAYS = 2;
export const DEFAULT_MEMORY_RECALL_LIMIT = 5;
export const DEFAULT_MEMORY_RESOURCE_ID = 'ciel';
export const MEMORY_KIND_METADATA = 'ciel_memory_kind';
