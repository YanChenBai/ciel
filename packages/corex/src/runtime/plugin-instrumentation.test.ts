import {
  createInstrumenter,
  type AnyFunction,
  type InstrumentContext,
  type Interceptor,
} from '@ciels/interceptor';
import { expect, test } from 'vite-plus/test';

import { definePlugin } from '#plugin/plugin.ts';

import { bindPluginInstrument } from './plugin-instrumentation.ts';

test('统一注入真实 Plugin 身份并保留操作自身 metadata', () => {
  const contexts: InstrumentContext[] = [];
  const interceptor: Interceptor = {
    intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
      if (context) contexts.push(context);
      return undefined;
    },
  };
  const plugin = definePlugin(() => ({ name: 'vision' }))({});
  const target = (value: number) => value * 2;
  const instrument = bindPluginInstrument(createInstrumenter([interceptor]), plugin);
  const run = instrument(target, {
    name: 'ciel.plugin.operation',
    metadata: {
      capability: 'test',
      pluginId: 'spoofed-id',
      pluginName: 'spoofed-name',
    },
  });

  expect(run(2)).toBe(4);
  expect(contexts).toEqual([
    {
      name: 'ciel.plugin.operation',
      metadata: {
        capability: 'test',
        pluginId: plugin.id,
        pluginName: plugin.name,
      },
    },
  ]);
});
