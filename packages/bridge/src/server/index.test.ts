// @env node

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Vigilia } from '@ciels/core';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { CielBridge } from './index.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { force: true, recursive: true })),
  );
});

describe('CielBridge assets', () => {
  it('reads an encoded relative image API path and rejects absolute paths and traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'ciel-bridge-'));
    temporaryDirectories.push(root);
    await writeFile(path.join(root, 'mosaic.jpg'), Buffer.from('image'));
    const bridge = new CielBridge({ vigilia: new Vigilia({ assetRoot: root }) });

    const response = await bridge.app.handle(new Request('http://localhost/assets/mosaic.jpg'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('image');

    const rootedPath = path.resolve(root, 'mosaic.jpg').replaceAll('\\', '/');
    const rooted = await bridge.app.handle(
      new Request(`http://localhost/assets/${encodeURIComponent(rootedPath)}`),
    );
    expect(rooted.status).toBe(404);

    const traversal = await bridge.app.handle(
      new Request('http://localhost/assets/%2e%2e/secret.jpg'),
    );
    expect(traversal.status).toBe(404);
    await bridge.stop();
  });
});
