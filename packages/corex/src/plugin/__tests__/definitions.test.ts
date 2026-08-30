import { expect, test } from 'vite-plus/test';

import { definePlugin } from '#plugin/plugin.ts';

test('通过可配置工厂创建保留声明字段的独立 Plugin', () => {
  const setup = () => undefined;
  const createPlugin = definePlugin(
    (options: { name: string; description?: string; setup: () => void }) => options,
  );
  const plugins = [
    createPlugin({ name: 'memory', description: 'Memory plugin', setup }),
    createPlugin({ name: 'input', setup() {} }),
  ];
  const ids = plugins.map(plugin => plugin.id);

  expect(plugins[0]).toMatchObject({ name: 'memory', description: 'Memory plugin', setup });
  expect(plugins.map(plugin => plugin.setup)).toEqual(plugins.map(() => expect.any(Function)));
  expect(ids).toEqual(ids.map(() => expect.any(String)));
  expect(new Set(ids).size).toBe(ids.length);
});
