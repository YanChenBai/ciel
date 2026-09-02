import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, test, vi } from 'vite-plus/test';

import {
  type AnyFunction,
  type AgentMessage,
  type AgentSessionAddress,
  type AgentSessionStore,
  CielOperation,
  defineCiel,
  defineCue,
  definePercept,
  definePlugin,
  defineProjector,
  defineSensu,
  defineSignal,
  type InstrumentContext,
  referenceSignal,
} from '#src/index.ts';

import { assistantMessage, streamResult, testModel, testStream } from './helpers.ts';

const instant = { kind: 'instant', at: 1 } as const;
const cueDefinition = defineCue({
  name: 'observe',
  description: 'Observe the latest input',
  prompt: 'Observe the latest perception.',
});

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
  const key = (address: AgentSessionAddress) => JSON.stringify([address.cielId, address.sessionId]);
  return {
    async load(address) {
      return [...(sessions.get(key(address)) ?? [])];
    },
    async append(address, messages) {
      sessions.set(key(address), [...(sessions.get(key(address)) ?? []), ...messages]);
    },
  };
}

test('按四阶段生命周期启动、排空并逆序释放 Plugin', async () => {
  const calls: string[] = [];
  const createLifecyclePlugin = definePlugin((name: string) => ({
    name,
    initialize() {
      calls.push(`${name}:initialize`);
    },
    activate() {
      calls.push(`${name}:activate`);
    },
    deactivate() {
      calls.push(`${name}:deactivate`);
    },
    dispose() {
      calls.push(`${name}:dispose`);
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [createLifecyclePlugin('first'), createLifecyclePlugin('second')],
  });

  await ciel.start();
  expect(calls).toEqual([
    'first:initialize',
    'second:initialize',
    'first:activate',
    'second:activate',
  ]);
  await ciel.stop();
  expect(calls).toEqual([
    'first:initialize',
    'second:initialize',
    'first:activate',
    'second:activate',
    'second:deactivate',
    'first:deactivate',
    'second:dispose',
    'first:dispose',
  ]);
});

test('Plugin 激活时接收所属 Ciel 运行时', async () => {
  let activatedWith: unknown;
  const runtimePlugin = definePlugin(() => ({
    name: 'runtime-context',
    activate({ ciel }) {
      activatedWith = ciel;
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [runtimePlugin()],
  });

  await ciel.start();

  expect(activatedWith).toBe(ciel);
  await ciel.stop();
});

test('递归展开 PluginOption 并在 Sensu 创建前解析最终配置', async () => {
  const calls: string[] = [];
  const signal = defineSignal({ name: 'config-order' });
  const sensu = defineSensu(() => ({
    name: 'config-order',
    signal,
    create() {
      calls.push('sensu:create');
      return { write() {}, close() {} };
    },
  }))();
  const plugin = definePlugin(() => ({
    name: 'config-order',
    sensu: [sensu],
    configResolved(config) {
      calls.push(`config:${config.instructions}`);
    },
  }))();
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [false, [undefined, plugin]],
  });

  await ciel.start();
  expect(calls).toEqual(['config:You are Ciel.', 'sensu:create']);
  await ciel.stop();
});

test('仅在运行期间接受外部 Signal', async () => {
  const signal = defineSignal({ name: 'external-input' });
  const ciel = defineCiel(createCielOptions());
  const input = signal.create(undefined, instant);

  await expect(ciel.dispatchSignal(input)).rejects.toThrow('not running');
  await ciel.start();
  await expect(ciel.dispatchSignal(input)).resolves.toBeUndefined();
  await ciel.stop();
  await expect(ciel.dispatchSignal(input)).rejects.toThrow('not running');
});

test('Plugin 读取最终配置并分别提供 Tool 与 Projector', async () => {
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
  const hostTool: AgentTool<any> = {
    name: 'host_tool',
    label: 'Host tool',
    description: 'Only available to the main Agent.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ content: [], details: {} }),
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
  let resolved: unknown;
  let projected: unknown;
  const createMemory = definePlugin(() => ({
    name: 'memory',
    tools: [tool],
    projectors: [
      defineProjector({
        name: 'memory',
        project: () => [{ type: 'text', text: 'long-term memory' }],
      }),
    ],
    configResolved(config) {
      resolved = config;
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(stream),
    plugins: [createMemory()],
    tools: [hostTool],
    prompt(frame) {
      projected = frame.context;
      return { role: 'user', content: 'think', timestamp: 1 };
    },
  });

  await ciel.start();
  expect(resolved).toMatchObject({
    id: ciel.id,
    model: testModel,
    agent: { model: testModel, stream },
  });
  await ciel.think(cueDefinition.create(instant));
  expect(projected).toEqual({ memory: [{ type: 'text', text: 'long-term memory' }] });
  expect(execute).toHaveBeenCalledOnce();
  await ciel.stop();
});

test('Plugin 使用规则按声明顺序追加到主 Agent 系统提示词', async () => {
  let systemPrompt: string | undefined;
  const stream: StreamFn = (_model, context) => {
    systemPrompt = context.systemPrompt;
    return streamResult();
  };
  const createInstructions = definePlugin((instructions: string) => ({
    name: instructions,
    instructions,
  }));
  const ciel = defineCiel({
    ...createCielOptions(stream),
    plugins: [createInstructions('Use memory.'), createInstructions('Use hearing.')],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));

  expect(systemPrompt).toBe('You are Ciel.\n\nUse memory.\n\nUse hearing.');
  await ciel.stop();
});

test('顶层 tools 直接进入 Agent，不需要 Tool Extension', async () => {
  const execute = vi.fn(async () => ({ content: [], details: { direct: true } }));
  const tool: AgentTool<any> = {
    name: 'direct_tool',
    label: 'Direct tool',
    description: 'Provided directly by defineCiel.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute,
  };
  const generated: AssistantMessage[] = [
    {
      ...assistantMessage('', 'toolUse'),
      content: [{ type: 'toolCall', id: 'direct-call', name: tool.name, arguments: {} }],
    },
    assistantMessage('done'),
  ];
  const ciel = defineCiel({
    ...createCielOptions(() => streamResult(generated.shift()!)),
    plugins: [],
    tools: [tool],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));
  expect(execute).toHaveBeenCalledOnce();
  await ciel.stop();
});

test('拒绝重复 Plugin、Primitive 和冲突的 Tool 或 Projector', () => {
  const tool: AgentTool<any> = {
    name: 'duplicate',
    label: 'Duplicate',
    description: 'Duplicate tool.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ content: [], details: {} }),
  };
  const plugin = definePlugin(() => ({ name: 'same' }))();
  expect(() => defineCiel({ ...createCielOptions(), plugins: [plugin, plugin] })).toThrow(
    'Ciel plugin "same" is installed more than once',
  );
  expect(() => defineCiel({ ...createCielOptions(), plugins: [], tools: [tool, tool] })).toThrow(
    'Agent tool "duplicate" is provided by both',
  );
  expect(() =>
    defineCiel({
      ...createCielOptions(),
      plugins: [
        definePlugin(() => ({
          name: 'projectors',
          projectors: [
            defineProjector({ name: 'memory', project: () => [] }),
            defineProjector({ name: 'memory', project: () => [] }),
          ],
        }))(),
      ],
    }),
  ).toThrow('Agent projector "memory" is provided by both');
});

test('Sensu 以独立输入输出流聚合多个 Signal，并先写入 Percept 再触发 Cue', async () => {
  const signal = defineSignal<number>({ name: 'number' });
  const percept = definePercept({ name: 'numbers' });
  const frames: string[][] = [];
  const createBatchSensu = defineSensu(() => ({
    name: 'batch-numbers',
    signal,
    create({ output }) {
      const inputs: ReturnType<typeof signal.create>[] = [];
      return {
        async write(current) {
          inputs.push(current);
          if (inputs.length < 2) return;
          await output.write({
            percepts: percept.create({
              origin: signal,
              causes: inputs.map(input => referenceSignal(input)),
              contents: [{ type: 'text', text: inputs.map(input => input.payload).join(',') }],
              temporal: current.temporal,
            }),
            cues: cueDefinition.create({
              kind: 'instant',
              at: current.temporal.kind === 'instant' ? current.temporal.at : current.temporal.end,
            }),
          });
        },
        close() {},
      };
    },
  }));
  const perception = definePlugin(() => ({ name: 'numbers', sensu: [createBatchSensu()] }))();
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [perception],
    prompt(frame) {
      frames.push(
        frame.delta.flatMap(entry =>
          entry.value.contents.flatMap(content => (content.type === 'text' ? [content.text] : [])),
        ),
      );
      return { role: 'user', content: 'think', timestamp: 1 };
    },
  });

  await ciel.start();
  await ciel.dispatchSignal(signal.create(1, instant));
  await ciel.dispatchSignal(signal.create(2, instant));
  await vi.waitFor(() => expect(frames).toEqual([['1,2']]));
  expect(ciel.engram.size).toBe(1);
  expect(ciel.engram.all()[0]?.value.causes).toHaveLength(2);
  await ciel.stop();
});

test('停止时先停输入，再允许 Sensu close 刷新输出，最后释放 Plugin', async () => {
  const calls: string[] = [];
  const signal = defineSignal<string>({ name: 'buffered' });
  const percept = definePercept({ name: 'flushed' });
  let last: ReturnType<typeof signal.create> | undefined;
  const createBufferedSensu = defineSensu(() => ({
    name: 'buffered',
    signal,
    create({ output }) {
      return {
        write(current) {
          last = current;
        },
        async close() {
          calls.push('sensu:close');
          if (!last) return;
          await output.write({
            percepts: percept.create({
              origin: signal,
              causes: [referenceSignal(last)],
              contents: [{ type: 'text', text: last.payload }],
              temporal: last.temporal,
            }),
          });
        },
      };
    },
  }));
  const perception = definePlugin(() => ({
    name: 'buffered-perception',
    sensu: [createBufferedSensu()],
    deactivate() {
      calls.push('plugin:deactivate');
    },
    dispose() {
      calls.push('plugin:dispose');
    },
  }))();
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [perception],
  });

  await ciel.start();
  await ciel.dispatchSignal(signal.create('final', instant));
  await ciel.stop();
  expect(calls).toEqual(['plugin:deactivate', 'sensu:close', 'plugin:dispose']);
  expect(ciel.engram.all()[0]?.value.contents).toEqual([{ type: 'text', text: 'final' }]);
});

test('Sensu close 失败时仍排空已经接受的输出', async () => {
  const signal = defineSignal<string>({ name: 'close-error-input' });
  const percept = definePercept({ name: 'close-error-output' });
  let last: ReturnType<typeof signal.create> | undefined;
  const createFailingSensu = defineSensu(() => ({
    name: 'close-error',
    signal,
    create({ output }) {
      return {
        write(current) {
          last = current;
        },
        close() {
          if (last) {
            void output.write({
              percepts: percept.create({
                origin: signal,
                causes: [referenceSignal(last)],
                contents: [{ type: 'text', text: last.payload }],
                temporal: last.temporal,
              }),
            });
          }
          throw new Error('close failed');
        },
      };
    },
  }));
  const perception = definePlugin(() => ({
    name: 'close-error-perception',
    sensu: [createFailingSensu()],
  }))();
  const ciel = defineCiel({
    ...createCielOptions(),
    plugins: [perception],
  });

  await ciel.start();
  await ciel.dispatchSignal(signal.create('accepted', instant));
  await expect(ciel.stop()).rejects.toThrow('close failed');
  expect(ciel.engram.entries(percept)[0]?.value.contents).toEqual([
    { type: 'text', text: 'accepted' },
  ]);
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

test('按 CueDefinition id 合并尚未开始的 think 并保留最新 Cue', async () => {
  const releases: (() => void)[] = [];
  const cues: string[] = [];
  const operations: InstrumentContext[] = [];
  const observer = definePlugin(() => ({
    name: 'coalesce-observer',
    interceptors: [
      {
        intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
          if (
            context?.name !== CielOperation.CueSubmit.name &&
            context?.name !== CielOperation.AgentRun.name
          ) {
            return undefined;
          }
          return next =>
            ((...args: Parameters<T>) => {
              operations.push(context);
              return next(...args);
            }) as T;
        },
      },
    ],
  }))();
  const stream: StreamFn = async () => {
    await new Promise<void>(resolve => releases.push(resolve));
    return streamResult();
  };
  const coalesced = defineCue<string>({ name: 'coalesced', coalesce: true });
  const sameName = defineCue<string>({ name: 'coalesced', coalesce: true });
  const ciel = defineCiel({
    ...createCielOptions(stream),
    prompt(frame) {
      cues.push(frame.cue.payload);
      return { role: 'user', content: frame.cue.payload, timestamp: Date.now() };
    },
    plugins: [observer],
  });

  await ciel.start();
  const first = ciel.think(coalesced.create(instant, 'first'));
  await vi.waitFor(() => expect(releases).toHaveLength(1));

  const second = ciel.think(coalesced.create(instant, 'second'));
  const third = ciel.think(coalesced.create(instant, 'third'));
  const separate = ciel.think(sameName.create(instant, 'separate'));
  expect(second).toBe(third);
  expect(third).not.toBe(separate);

  releases.shift()!();
  await first;
  await vi.waitFor(() => expect(releases).toHaveLength(1));
  expect(cues).toEqual(['first', 'third']);

  releases.shift()!();
  await Promise.all([second, third]);
  await vi.waitFor(() => expect(releases).toHaveLength(1));
  expect(cues).toEqual(['first', 'third', 'separate']);

  releases.shift()!();
  await separate;
  expect(
    operations.filter(operation => operation.name === CielOperation.CueSubmit.name),
  ).toHaveLength(4);
  expect(
    operations.filter(operation => operation.name === CielOperation.AgentRun.name),
  ).toHaveLength(3);
  await ciel.stop();
});

test('使用 Ciel id 与 sessionId 隔离并恢复完整对话', async () => {
  const sessionStore = createMemorySessionStore();
  const first = defineCiel({
    ...createCielOptions(),
    id: 'ciel-main',
    sessionId: '2026-08-31',
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
    sessionId: '2026-08-31',
    sessionStore,
    plugins: [],
  });
  await restored.start();
  expect(restored.messages).toEqual(persisted);
  await restored.stop();
});

test('投影后的完整上下文达到阈值时压缩旧历史并保留最近对话', async () => {
  const modelContexts: Parameters<StreamFn>[1][] = [];
  const stream: StreamFn = (_model, context) => {
    if (context.systemPrompt?.startsWith('你是上下文压缩助手')) {
      return streamResult(assistantMessage('compressed history'));
    }

    modelContexts.push(context);
    return streamResult(assistantMessage('assistant response'));
  };
  const projector = defineProjector({
    name: 'large-projection',
    project: () => [{ type: 'text', text: 'x'.repeat(32) }],
  });
  const countTokens = vi.fn(({ context }: { context: Parameters<StreamFn>[1] }) => {
    return context.messages.length >= 5 ? 25 : 10;
  });
  const ciel = defineCiel({
    ...createCielOptions(stream),
    compaction: {
      thresholdTokens: 20,
      keepRecentTurns: 1,
      summaryMaxTokens: 20,
      countTokens,
    },
    plugins: [definePlugin(() => ({ name: 'large-context', projectors: [projector] }))()],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));

  expect(modelContexts).toHaveLength(3);
  expect(modelContexts[2]?.messages[0]).toMatchObject({
    role: 'user',
    content: expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('compressed history') }),
    ]),
  });
  expect(ciel.messages[0]).toMatchObject({
    role: 'compactionSummary',
    summary: 'compressed history',
  });
  expect(ciel.contextTokens).toBeGreaterThan(0);
  expect(countTokens).toHaveBeenCalled();
  await ciel.stop();
});

test('模型返回上下文溢出时只压缩并重试一次', async () => {
  let mainRequests = 0;
  const stream: StreamFn = (_model, context) => {
    if (context.systemPrompt?.startsWith('你是上下文压缩助手')) {
      return streamResult(assistantMessage('overflow recovery summary'));
    }

    mainRequests++;
    if (mainRequests === 3) {
      return streamResult(assistantMessage('maximum context length is 100 tokens', 'error'));
    }

    return streamResult(assistantMessage('assistant response'));
  };
  const ciel = defineCiel({
    ...createCielOptions(stream),
    compaction: {
      thresholdTokens: 90_000,
      keepRecentTurns: 1,
    },
    plugins: [],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));

  expect(mainRequests).toBe(4);
  expect(ciel.messages[0]).toMatchObject({
    role: 'compactionSummary',
    summary: 'overflow recovery summary',
  });
  expect(ciel.messages).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ stopReason: 'error' })]),
  );
  await ciel.stop();
});

test('工具执行后的溢出恢复从 tool result 继续且不重复执行工具', async () => {
  const execute = vi.fn(async () => ({
    content: [{ type: 'text' as const, text: 'tool output' }],
    details: {},
  }));
  const tool: AgentTool<any> = {
    name: 'side_effect',
    label: 'Side effect',
    description: 'Execute once.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute,
  };
  let mainRequests = 0;
  const stream: StreamFn = (_model, context) => {
    if (context.systemPrompt?.startsWith('你是上下文压缩助手')) {
      return streamResult(assistantMessage('tool recovery summary'));
    }

    mainRequests++;
    if (mainRequests === 3) {
      return streamResult({
        ...assistantMessage('', 'toolUse'),
        content: [{ type: 'toolCall', id: 'once', name: tool.name, arguments: {} }],
      });
    }
    if (mainRequests === 4) {
      return streamResult(assistantMessage('maximum context length is 100 tokens', 'error'));
    }

    return streamResult(assistantMessage('assistant response'));
  };
  const ciel = defineCiel({
    ...createCielOptions(stream),
    compaction: { thresholdTokens: 90_000, keepRecentTurns: 1 },
    plugins: [],
    tools: [tool],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));
  await ciel.think(cueDefinition.create(instant));

  expect(mainRequests).toBe(5);
  expect(execute).toHaveBeenCalledOnce();
  await ciel.stop();
});

describe('Projector', () => {
  test('由 Plugin 贡献后生成 Agent 上下文', async () => {
    const project = vi.fn(() => [{ type: 'text' as const, text: 'projected' }]);
    const projector = defineProjector({ name: 'recent', project });
    let projected: unknown;
    const ciel = defineCiel({
      ...createCielOptions(),
      plugins: [definePlugin(() => ({ name: 'recent-context', projectors: [projector] }))()],
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
