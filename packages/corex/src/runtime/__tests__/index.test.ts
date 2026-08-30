import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, test, vi } from 'vite-plus/test';

import {
  type AgentMessage,
  type AgentSessionAddress,
  type AgentSessionStore,
  defineCiel,
  defineCue,
  definePlugin,
  definePercept,
  defineProjector,
  defineSignal,
  type PluginOptions,
} from '#src/index.ts';

import { assistantMessage, streamResult, testModel, testStream } from './helpers.ts';

const instant = { kind: 'instant', at: 1 } as const;
const cueDefinition = defineCue({
  name: 'observe',
  description: 'Observe the latest input',
  prompt: 'Observe the latest perception.',
});
const createPlugin = definePlugin((options: PluginOptions) => options);

function createCielOptions(stream: StreamFn = testStream) {
  return {
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false as const,
    stream,
  };
}

function createMemorySessionStore(): AgentSessionStore {
  const sessions = new Map<string, AgentMessage[]>();

  function key(address: AgentSessionAddress): string {
    return JSON.stringify([address.cielId, address.sessionId]);
  }

  async function load(address: AgentSessionAddress): Promise<readonly AgentMessage[]> {
    return [...(sessions.get(key(address)) ?? [])];
  }

  async function append(
    address: AgentSessionAddress,
    messages: readonly AgentMessage[],
  ): Promise<void> {
    sessions.set(key(address), [...(sessions.get(key(address)) ?? []), ...messages]);
  }

  return { append, load };
}

test('按模块声明顺序启动并逆序停止', async () => {
  const calls: string[] = [];
  const first = createPlugin({
    name: 'first',
    setup(ctx) {
      ctx.onStart(() => {
        calls.push('first:start');
      });
      ctx.onDispose(() => {
        calls.push('first:stop');
      });
    },
  });
  const second = createPlugin({
    name: 'second',
    setup(ctx) {
      ctx.onStart(() => {
        calls.push('second:start');
      });
      ctx.onDispose(() => {
        calls.push('second:stop');
      });
    },
  });
  const ciel = defineCiel({ ...createCielOptions(), plugins: [[first], second] });

  await ciel.start();
  expect(calls).toEqual(['first:start', 'second:start']);
  await ciel.stop();
  expect(calls).toEqual(['first:start', 'second:start', 'second:stop', 'first:stop']);
});

test('通用模块继承 Agent 配置并贡献 Tool、Projector 与生命周期', async () => {
  const calls: string[] = [];
  const execute = vi.fn(async () => ({
    content: [{ type: 'text' as const, text: 'remembered' }],
    details: { stored: true },
  }));
  const tool: AgentTool<any> = {
    name: 'memory_remember',
    label: 'Remember',
    description: 'Remember one fact.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
      additionalProperties: false,
    },
    execute,
  };
  const generated: AssistantMessage[] = [
    {
      ...assistantMessage('', 'toolUse'),
      content: [
        {
          type: 'toolCall',
          id: 'memory-call',
          name: tool.name,
          arguments: { content: 'stable fact' },
        },
      ],
    },
    assistantMessage('done'),
  ];
  const stream: StreamFn = () => streamResult(generated.shift()!);
  let inherited: unknown;
  let inheritedCielId: unknown;
  let projected: unknown;
  const memory = createPlugin({
    name: 'memory',
    setup(ctx) {
      inherited = ctx.agent;
      inheritedCielId = ctx.id;
      ctx.provide({
        tools: [tool],
        projectors: [
          defineProjector({
            name: 'memory',
            project: () => [{ type: 'text', text: 'long-term memory' }],
          }),
        ],
      });
      ctx.onStart(() => {
        calls.push('memory:start');
      });
      ctx.onDispose(() => {
        calls.push('memory:stop');
      });
    },
  });
  const ciel = defineCiel({
    ...createCielOptions(stream),
    plugins: [memory],
    prompt(frame) {
      projected = frame.context;
      return { role: 'user', content: 'think', timestamp: 1 };
    },
  });

  expect(inherited).toMatchObject({ model: testModel, stream });
  expect(inheritedCielId).toBe(ciel.id);
  expect(inherited).not.toHaveProperty('instructions');
  expect(inherited).not.toHaveProperty('tools');
  expect(inherited).not.toHaveProperty('prompt');

  await ciel.start();
  expect(calls).toEqual(['memory:start']);
  await ciel.think(cueDefinition.create(instant));
  expect(projected).toEqual({ memory: [{ type: 'text', text: 'long-term memory' }] });
  expect(execute).toHaveBeenCalledOnce();
  await ciel.stop();
  expect(calls).toEqual(['memory:start', 'memory:stop']);
});

test('拒绝重复 Plugin 和冲突的 Agent 贡献', () => {
  const tool: AgentTool<any> = {
    name: 'duplicate',
    label: 'Duplicate',
    description: 'Duplicate tool.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ content: [], details: {} }),
  };
  const plugin = createPlugin({
    name: 'provider',
    setup(ctx) {
      ctx.provide({ tools: [tool] });
    },
  });

  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [plugin, plugin],
    }),
  ).toThrow('Ciel plugin "provider" is installed more than once');
  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [plugin, createPlugin({ name: 'second-provider', tools: [tool] })],
    }),
  ).toThrow(
    'Agent tool "duplicate" is provided by both plugin "provider" and plugin "second-provider"',
  );

  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [createPlugin({ name: 'duplicate-provider', tools: [tool, tool] })],
    }),
  ).toThrow(
    'Agent tool "duplicate" is provided by both plugin "duplicate-provider" and plugin "duplicate-provider"',
  );

  const firstProjector = defineProjector({ name: 'memory', project: () => [] });
  const secondProjector = defineProjector({ name: 'memory', project: () => [] });
  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [firstProjector, secondProjector],
    }),
  ).toThrow('Agent projector "memory" is provided by both plugin "memory" and plugin "memory"');
});

test('模块 setup 必须同步且完成后不能继续注册能力', () => {
  const asyncPlugin = createPlugin({
    name: 'async-plugin',
    async setup() {},
  });
  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [asyncPlugin],
    }),
  ).toThrow(
    'Ciel plugin "async-plugin" setup must be synchronous; register async work with onStart()',
  );

  let register!: () => void;
  const latePlugin = createPlugin({
    name: 'late-plugin',
    setup(ctx) {
      register = () => ctx.provide({ tools: [] });
    },
  });
  defineCiel({
    ...createCielOptions(),
    plugins: [latePlugin],
  });

  expect(register).toThrow('Ciel plugin "late-plugin" cannot register capabilities after setup');
});

test('emitSignal 只在 Ciel 运行期间可用', async () => {
  const signal = defineSignal({ name: 'lifecycle-event' });
  let emit!: () => Promise<void>;
  const plugin = createPlugin({
    name: 'source',
    setup(ctx) {
      emit = () => ctx.emitSignal(signal.create(undefined, instant));
    },
  });
  const ciel = defineCiel({ ...createCielOptions(), plugins: [plugin] });

  await expect(emit()).rejects.toThrow(
    'Ciel plugin "source" cannot emit while Ciel is not running',
  );
  await ciel.start();
  await expect(emit()).resolves.toBeUndefined();
  await ciel.stop();
  await expect(emit()).rejects.toThrow(
    'Ciel plugin "source" cannot emit while Ciel is not running',
  );
});

test('模块解释 Signal 后写入 Percept 并异步触发 Agent', async () => {
  const signal = defineSignal<number>({ name: 'number' });
  const percept = definePercept({ name: 'number' });
  const frames: number[][] = [];
  const sensu = createPlugin({
    name: 'reader',
    setup(ctx) {
      ctx.sensu(signal, current => ({
        percepts: percept.create({
          source: current,
          contents: [{ type: 'text', text: String(current.payload) }],
          temporal: current.temporal,
        }),
        cues: cueDefinition.create(current.temporal),
      }));
    },
  });
  const stimulus = createPlugin({
    name: 'source',
    setup(ctx) {
      ctx.onStart(() => ctx.emitSignal(signal.create(42, instant)));
    },
  });
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [stimulus, sensu],
    prompt(frame) {
      frames.push(frame.delta.map(entry => entry.value.source.payload as number));
      return { role: 'user', content: 'think', timestamp: 1 };
    },
  });

  await ciel.start();
  await vi.waitFor(() => expect(frames).toEqual([[42]]));
  expect(ciel.engram.size).toBe(1);
  await ciel.stop();
});

test('同一个 Ciel 的 think 严格串行', async () => {
  const releases: (() => void)[] = [];
  let active = 0;
  let maximum = 0;
  const stream: StreamFn = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise<void>(resolve => releases.push(resolve));
    active -= 1;
    return streamResult();
  };
  const ciel = defineCiel({ ...createCielOptions(stream), plugins: [] });
  await ciel.start();

  const first = ciel.think(cueDefinition.create(instant));
  const second = ciel.think(cueDefinition.create(instant));
  await vi.waitFor(() => expect(releases).toHaveLength(1));
  releases.shift()!();
  await first;
  await vi.waitFor(() => expect(releases).toHaveLength(1));
  releases.shift()!();
  await second;

  expect(maximum).toBe(1);
  await ciel.stop();
});

test('使用 Ciel id 与 sessionId 隔离并恢复完整对话', async () => {
  const sessionStore = createMemorySessionStore();
  const first = defineCiel({
    ...createCielOptions(),
    id: 'ciel-main',
    sessionId: '2026-08-30',
    sessionStore,
    plugins: [],
  });
  await first.start();
  await first.think(cueDefinition.create(instant));
  const persisted = first.messages;
  await first.stop();

  const restored = defineCiel({
    ...createCielOptions(),
    id: 'ciel-main',
    sessionId: '2026-08-30',
    sessionStore,
    plugins: [],
  });
  await restored.start();
  expect(restored.messages).toEqual(persisted);
  await restored.stop();

  const isolated = defineCiel({
    ...createCielOptions(),
    id: 'another-ciel',
    sessionId: '2026-08-30',
    sessionStore,
    plugins: [],
  });
  await isolated.start();
  expect(isolated.messages).toEqual([]);
  await isolated.stop();
});

test('未提供 id 和 sessionId 时生成非空标识', () => {
  const ciel = defineCiel({ ...createCielOptions(), plugins: [] });

  expect(ciel.id).not.toBe('');
  expect(ciel.sessionId).not.toBe('');
});

test('默认提示词只注入显式 Cue.prompt，不注入 Cue metadata 或 payload', async () => {
  let serializedContext = '';
  const stream: StreamFn = (_model, context) => {
    serializedContext = JSON.stringify(context.messages);
    return streamResult();
  };
  const privateCue = defineCue<{ secret: string }>({
    name: 'private-control-cue',
    description: 'must not reach the model',
    prompt: 'Handle the current situation.',
  });
  const ciel = defineCiel({ ...createCielOptions(stream), plugins: [] });
  await ciel.start();

  await ciel.think(privateCue.create(instant, { secret: 'hidden-payload' }));

  expect(serializedContext).toContain('Handle the current situation.');
  expect(serializedContext).not.toContain('private-control-cue');
  expect(serializedContext).not.toContain('must not reach the model');
  expect(serializedContext).not.toContain('hidden-payload');
  await ciel.stop();
});

test('失败的思考不提交 Engram checkout', async () => {
  const signal = defineSignal({ name: 'event' });
  const percept = definePercept({ name: 'event' });
  const deltas: number[] = [];
  let attempt = 0;
  const stream: StreamFn = () =>
    streamResult(attempt++ === 0 ? assistantMessage('failed', 'error') : assistantMessage());
  const ciel = defineCiel({
    ...createCielOptions(stream),
    plugins: [],
    prompt(frame) {
      deltas.push(frame.delta.length);
      return { role: 'user', content: 'retry', timestamp: 1 };
    },
  });
  ciel.engram.append(
    percept.create({ source: signal.create(undefined, instant), contents: [], temporal: instant }),
  );
  await ciel.start();

  await expect(ciel.think(cueDefinition.create(instant))).rejects.toThrow('failed');
  await ciel.think(cueDefinition.create(instant));

  expect(deltas).toEqual([1, 1]);
  await ciel.stop();
});

describe('Projector Plugin', () => {
  test('直接放入 plugins 后生成 Agent 上下文', async () => {
    const project = vi.fn(() => [{ type: 'text' as const, text: 'projected' }]);
    const projector = defineProjector({ name: 'recent', project });
    let projected: unknown;
    const ciel = defineCiel({
      ...createCielOptions(),
      plugins: [projector],
      prompt(frame) {
        projected = frame.context;
        return { role: 'user', content: 'think', timestamp: 1 };
      },
    });
    await ciel.start();
    await ciel.think(cueDefinition.create(instant));

    expect(projected).toEqual({ recent: [{ type: 'text', text: 'projected' }] });
    expect(project).toHaveBeenCalledOnce();
    await ciel.stop();
  });
});
