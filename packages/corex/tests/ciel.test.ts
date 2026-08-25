import { expect, test } from 'vite-plus/test';

import {
  defineCiel,
  definePercept,
  defineSensu,
  defineSignal,
  defineStimulus,
} from '../src/index.ts';

const instant = { kind: 'instant', at: 1 } as const;

test('收集 Sensu 产出的单个、多个、异步和空结果', async () => {
  const signal = defineSignal<number>({ name: 'number', description: 'Number' });
  const percept = definePercept({ name: 'number', description: 'Number percept' });
  const stimulus = defineStimulus({
    name: 'numbers',
    description: 'Emits numbers',
    signals: [signal] as const,
    async setup(ctx) {
      for (const value of [1, 2, 3]) {
        await ctx.emitSignal(signal.create(value, instant));
      }
    },
  });
  const sensuDefinition = defineSensu<number>(input => ({
    name: 'number',
    description: 'Reads numbers',
    setup(ctx) {
      ctx.onSignal(input, async current => {
        const create = (suffix: string) =>
          percept.create({
            source: current,
            contents: [{ type: 'text', text: `${current.payload}${suffix}` }],
            temporal: current.temporal,
          });

        if (current.payload === 1) return create('');
        if (current.payload === 2) return [create('a'), create('b')];
        return undefined;
      });
    },
  }));
  const nucleus = { name: 'nucleus' };
  const ciel = defineCiel({
    stimulus: [stimulus],
    sensus: ([signals]) => [sensuDefinition(...signals)],
    nucleus,
  });

  expect(ciel.status).toBe('idle');
  expect(ciel.nucleus).toBe(nucleus);

  await ciel.start();

  expect(ciel.percepts.map(current => current.contents[0])).toEqual([
    { type: 'text', text: '1' },
    { type: 'text', text: '2a' },
    { type: 'text', text: '2b' },
  ]);
});

test('拒绝 Stimulus 发出未声明的 Signal', async () => {
  const declared = defineSignal<string>({ name: 'declared', description: 'Declared' });
  const undeclared = defineSignal<string>({ name: 'undeclared', description: 'Undeclared' });
  const stimulus = defineStimulus({
    name: 'invalid',
    description: 'Invalid stimulus',
    signals: [declared] as const,
    async setup(ctx) {
      await ctx.emitSignal(undeclared.create('invalid', instant));
    },
  });
  const ciel = defineCiel({ stimulus: [stimulus], sensus: () => [] });

  await expect(ciel.start()).rejects.toThrow(
    'Stimulus cannot emit an undeclared Signal definition',
  );
  expect(ciel.status).toBe('idle');
});

test('拒绝 Sensu 订阅未声明的 Signal', async () => {
  const declared = defineSignal<string>({ name: 'declared', description: 'Declared' });
  const undeclared = defineSignal<string>({ name: 'undeclared', description: 'Undeclared' });
  const stimulus = defineStimulus({
    name: 'valid',
    description: 'Valid stimulus',
    signals: [declared] as const,
    setup() {},
  });
  const sensuDefinition = defineSensu<string>(signal => ({
    name: 'invalid',
    description: 'Invalid sensu',
    setup(ctx) {
      ctx.onSignal(undeclared, () => undefined);
      ctx.onSignal(signal, () => undefined);
    },
  }));
  const ciel = defineCiel({
    stimulus: [stimulus],
    sensus: ([signals]) => [sensuDefinition(...signals)],
  });

  await expect(ciel.start()).rejects.toThrow(
    'Sensu cannot subscribe to an undeclared Signal definition',
  );
  expect(ciel.status).toBe('idle');
});

test('启动失败时清理已安装的作用域', async () => {
  const signal = defineSignal({ name: 'event', description: 'Event' });
  const calls: string[] = [];
  const stimulus = defineStimulus({
    name: 'failing',
    description: 'Fails during setup',
    signals: [signal] as const,
    setup(ctx) {
      ctx.onDispose(() => {
        calls.push('stimulus');
      });
      throw new Error('startup failed');
    },
  });
  const sensuDefinition = defineSensu(current => ({
    name: 'reader',
    description: 'Reader',
    setup(ctx) {
      ctx.onSignal(current, () => undefined);
      ctx.onDispose(() => {
        calls.push('sensu');
      });
    },
  }));
  const ciel = defineCiel({
    stimulus: [stimulus],
    sensus: ([signals]) => [sensuDefinition(...signals)],
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
    signals: [] as const,
    setup(ctx) {
      ctx.onDispose(() => {
        throw disposeError;
      });
    },
  });
  const ciel = defineCiel({ stimulus: [stimulus], sensus: () => [] });

  await ciel.start();
  await expect(ciel.stop()).rejects.toBe(disposeError);

  expect(ciel.status).toBe('idle');
});
