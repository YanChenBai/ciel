import path from 'node:path';

export const DATA_DIR = '.ciel-data' as const;

export const DATA_PATH = process.env.CIEL_DATA_DIR ?? path.resolve(process.cwd(), DATA_DIR);
