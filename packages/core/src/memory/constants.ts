// @env node

import path from 'node:path';

import { DATA_PATH } from '#constants';

/**
 * 默认的本地 LibSQL 记忆文件。
 */
export const DEFAULT_MEMORY_PATH = path.join(DATA_PATH, 'memories', 'memory.db');
