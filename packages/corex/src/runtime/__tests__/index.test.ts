import { expect, test } from 'vite-plus/test';

import {
  defineCiel,
  defineNoesis,
  definePercept,
  defineSensu,
  defineSignal,
  defineStimulus,
} from '#src/index.ts';

test('展开组合模块，按 Sensu、Noesis、Stimulus 顺序启动并逆序停止', async () => {
  const calls: string[] = [];
  let noesisEngram: unknown;

  const sensu = defineSensu({
    name: 'sensu',
    description: 'Sensu',
    setup(ctx) {
      calls.push('sensu:start');
      ctx.onDispose(() => {
        calls.push('sensu:stop');
      });
    },
  });
  const noesis = defineNoesis({
    name: 'noesis',
    description: 'Noesis',
    setup(ctx) {
      calls.push('noesis:start');
      noesisEngram = ctx.engram;
      ctx.onDispose(() => {
        calls.push('noesis:stop');
      });
    },
  });
  const stimulus = defineStimulus({
    name: 'stimulus',
    description: 'Stimulus',
    setup(ctx) {
      calls.push('stimulus:start');
      ctx.onDispose(() => {
        calls.push('stimulus:stop');
      });
    },
  });
  const ciel = defineCiel({ modules: [[stimulus, noesis], sensu] });

  await ciel.start();

  expect(noesisEngram).toBe(ciel.engram);
  expect(calls).toEqual(['sensu:start', 'noesis:start', 'stimulus:start']);

  await ciel.stop();

  expect(calls).toEqual([
    'sensu:start',
    'noesis:start',
    'stimulus:start',
    'stimulus:stop',
    'noesis:stop',
    'sensu:stop',
  ]);
});

const instant = { kind: 'instant', at: 1 } as const;

test('收集 Sensu 显式派发的 Percept', async () => {
  const signal = defineSignal<number>({ name: 'number', description: 'Number' });
  const percept = definePercept({ name: 'number', description: 'Number percept' });
  const stimulus = defineStimulus({
    name: 'numbers',
    description: 'Emits numbers',
    async setup(ctx) {
      for (const value of [1, 2, 3]) {
        await ctx.emitSignal(signal.create(value, instant));
      }
    },
  });
  const sensu = defineSensu({
    name: 'number',
    description: 'Reads numbers',
    setup(ctx) {
      ctx.onSignal(signal, async current => {
        if (current.payload > 2) {
          return;
        }

        await ctx.emitPercept(
          percept.create({
            source: current,
            contents: [{ type: 'text', text: String(current.payload) }],
            temporal: current.temporal,
          }),
        );
      });
    },
  });
  const ciel = defineCiel({
    modules: [stimulus, sensu],
  });

  expect(ciel.status).toBe('idle');
  expect(ciel.engram.all()).toEqual([]);

  await ciel.start();

  expect(ciel.engram.all().map(entry => entry.value.contents[0])).toEqual([
    { type: 'text', text: '1' },
    { type: 'text', text: '2' },
  ]);
});

test('启动失败时清理已安装的作用域', async () => {
  const signal = defineSignal({ name: 'event', description: 'Event' });
  const calls: string[] = [];
  const stimulus = defineStimulus({
    name: 'failing',
    description: 'Fails during setup',
    setup(ctx) {
      ctx.onDispose(() => {
        calls.push('stimulus');
      });
      throw new Error('startup failed');
    },
  });
  const sensu = defineSensu({
    name: 'reader',
    description: 'Reader',
    setup(ctx) {
      ctx.onSignal(signal, () => undefined);
      ctx.onDispose(() => {
        calls.push('sensu');
      });
    },
  });
  const ciel = defineCiel({
    modules: [stimulus, sensu],
  });

  await expect(ciel.start()).rejects.toThrow('startup failed');

  expect(calls).toEqual(['stimulus', 'sensu']);
  expect(ciel.status).toBe('idle');
});

test('停止清理失败后恢复为空闲状态', async () => {
  const disposeError = new Error('cleanup failed');
  const stimulus = defineStimulus({
    name: 'resource',
    description: 'Resource',
    setup(ctx) {
      ctx.onDispose(() => {
        throw disposeError;
      });
    },
  });
  const ciel = defineCiel({ modules: [stimulus] });

  await ciel.start();
  await expect(ciel.stop()).rejects.toBe(disposeError);

  expect(ciel.status).toBe('idle');
});
