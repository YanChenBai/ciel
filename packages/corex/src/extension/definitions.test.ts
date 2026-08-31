import { expect, test } from 'vite-plus/test';

import { defineSignal } from '#model';

import { definePlugin, defineProjector, defineSensu } from './index.ts';

test('definePlugin 支持无参数与有参数配置工厂', () => {
  const createEmpty = definePlugin(() => ({
    name: 'empty',
    create: () => ({}),
  }));
  const createNamed = definePlugin((name: string) => ({
    name,
    create: () => ({}),
  }));

  expect(createEmpty()).toMatchObject({ kind: 'plugin', name: 'empty', id: expect.any(String) });
  expect(createNamed('memory')).toMatchObject({
    kind: 'plugin',
    name: 'memory',
    id: expect.any(String),
  });
});

test('defineSensu 与 definePlugin 使用相同配置工厂形状', () => {
  const signal = defineSignal({ name: 'input' });
  const createSensu = defineSensu((name: string) => ({
    name,
    signal,
    create: () => ({ write() {}, close() {} }),
  }));
  const sensu = createSensu('reader');

  expect(sensu).toMatchObject({
    kind: 'sensu',
    name: 'reader',
    signal,
    id: expect.any(String),
  });
});

test('Projector 是独立 Extension 而不是 Plugin', () => {
  const projector = defineProjector({ name: 'recent', project: () => [] });
  expect(projector).toMatchObject({
    kind: 'projector',
    name: 'recent',
    id: expect.any(String),
  });
});
