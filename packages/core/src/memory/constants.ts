import path from 'node:path';

import { DATA_PATH } from '#constants';

export const DEFAULT_MEMORY_PATH = path.join(DATA_PATH, 'memory.db');
export const DEFAULT_RECENT_MEMORY_DAYS = 2;
export const DEFAULT_MEMORY_RECALL_LIMIT = 5;
export const MEMORY_KIND_METADATA = 'ciel_memory_kind';
export const MEMORY_SCOPE_ID_METADATA = 'ciel_memory_scope_id';
export const MEMORY_SCOPE_LABEL_METADATA = 'ciel_memory_scope_label';
