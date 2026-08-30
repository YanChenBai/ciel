import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vite-plus/test';

import { createAgentSessionStore } from './session.ts';

test('JSONL session store 跨实例恢复消息并按 Ciel id 隔离', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'corex-session-'));
  const primary = { cielId: 'ciel-main', sessionId: '2026-08-30' };
  const isolated = { cielId: 'another-ciel', sessionId: '2026-08-30' };
  const message = { role: 'user' as const, content: 'hello', timestamp: 1 };

  try {
    const writer = createAgentSessionStore({ cwd: directory });
    await writer.append(primary, [message]);

    const reader = createAgentSessionStore({ cwd: directory });
    await expect(reader.load(primary)).resolves.toEqual([message]);
    await expect(reader.load(isolated)).resolves.toEqual([]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
