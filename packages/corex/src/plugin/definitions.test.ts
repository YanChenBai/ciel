import { expect, expectTypeOf, test } from 'vite-plus/test';

import { defineSignal } from '#model/index.ts';

import { definePlugin, defineProjector, defineSensu } from './index.ts';

test('definePlugin 支持无参数与有参数配置工厂', () => {
  const createEmpty = definePlugin(() => ({ name: 'empty' }));
  const createNamed = definePlugin((name: string) => ({ name }));

  expect(createEmpty()).toMatchObject({ name: 'empty', id: expect.any(String) });
  expect(createNamed('memory')).toMatchObject({ name: 'memory', id: expect.any(String) });
  expectTypeOf(createNamed).parameter(0).toEqualTypeOf<string>();
});

test('Sensu 与 Projector 是 Plugin 直接贡献的 Runtime primitive', () => {
  const signal = defineSignal({ name: 'input' });
  const createSensu = defineSensu((name: string) => ({
    name,
    signal,
    create: () => ({ write() {}, close() {} }),
  }));
  const sensu = createSensu('reader');
  const projector = defineProjector({ name: 'recent', project: () => [] });
  const plugin = definePlugin(() => ({
    name: 'perception',
    sensu: [sensu],
    projectors: [projector],
  }))();

  expect(plugin.sensu).toEqual([sensu]);
  expect(plugin.projectors).toEqual([projector]);
  expect(sensu).toMatchObject({ name: 'reader', signal, id: expect.any(String) });
  expect(projector).toMatchObject({ name: 'recent', id: expect.any(String) });
});
