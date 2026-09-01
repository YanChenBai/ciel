import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { describe, expect, test, vi } from 'vite-plus/test';

import {
  type AgentMessage,
  type AgentSessionAddress,
  type AgentSessionStore,
  defineCiel,
  defineCue,
  definePercept,
  definePlugin,
  defineProjector,
  defineSensu,
  defineSignal,
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
    create() {
      return {
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
      };
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    extensions: [createLifecyclePlugin('first'), createLifecyclePlugin('second')],
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

test('Plugin 继承 Agent 配置并分别提供 Tool 与 Projector Extension', async () => {
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
  let inherited: unknown;
  let inheritedCielId: unknown;
  let projected: unknown;
  const createMemory = definePlugin(() => ({
    name: 'memory',
    create(context) {
      inherited = context.agent;
      inheritedCielId = context.cielId;
      return {
        tools: [tool],
        extensions: [
          defineProjector({
            name: 'memory',
            project: () => [{ type: 'text', text: 'long-term memory' }],
          }),
        ],
      };
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(stream),
    extensions: [createMemory()],
    tools: [hostTool],
    prompt(frame) {
      projected = frame.context;
      return { role: 'user', content: 'think', timestamp: 1 };
    },
  });

  expect(inherited).toMatchObject({ model: testModel, stream });
  expect(inheritedCielId).toBe(ciel.id);
  expect(inherited).not.toHaveProperty('instructions');
  expect(inherited).not.toHaveProperty('extensions');
  expect(inherited).not.toHaveProperty('tools');
  await ciel.start();
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
    create: () => ({ instructions }),
  }));
  const ciel = defineCiel({
    ...createCielOptions(stream),
    extensions: [createInstructions('Use memory.'), createInstructions('Use hearing.')],
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
    extensions: [],
    tools: [tool],
  });

  await ciel.start();
  await ciel.think(cueDefinition.create(instant));
  expect(execute).toHaveBeenCalledOnce();
  await ciel.stop();
});

test('拒绝重复 Extension 和冲突的 Tool 或 Projector', () => {
  const tool: AgentTool<any> = {
    name: 'duplicate',
    label: 'Duplicate',
    description: 'Duplicate tool.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => ({ content: [], details: {} }),
  };
  const extension = defineProjector({ name: 'same', project: () => [] });
  expect(() => defineCiel({ ...createCielOptions(), extensions: [extension, extension] })).toThrow(
    'Ciel extension "same" is installed more than once',
  );
  expect(() => defineCiel({ ...createCielOptions(), extensions: [], tools: [tool, tool] })).toThrow(
    'Agent tool "duplicate" is provided by both',
  );
  expect(() =>
    defineCiel({
      ...createCielOptions(),
      extensions: [
        defineProjector({ name: 'memory', project: () => [] }),
        defineProjector({ name: 'memory', project: () => [] }),
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
            cues: cueDefinition.create(current.temporal),
          });
        },
        close() {},
      };
    },
  }));
  const createSource = definePlugin(() => ({
    name: 'source',
    create() {
      return {
        async activate({ emitSignal }) {
          await emitSignal(signal.create(1, instant));
          await emitSignal(signal.create(2, instant));
        },
      };
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    extensions: [createBatchSensu(), createSource()],
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
  const createSource = definePlugin(() => ({
    name: 'source',
    create() {
      return {
        activate: ({ emitSignal }) => emitSignal(signal.create('final', instant)),
        deactivate() {
          calls.push('plugin:deactivate');
        },
        dispose() {
          calls.push('plugin:dispose');
        },
      };
    },
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    extensions: [createBufferedSensu(), createSource()],
  });

  await ciel.start();
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
  const createSource = definePlugin(() => ({
    name: 'close-error-source',
    create: () => ({
      activate: ({ emitSignal }) => emitSignal(signal.create('accepted', instant)),
    }),
  }));
  const ciel = defineCiel({
    ...createCielOptions(),
    extensions: [createFailingSensu(), createSource()],
  });

  await ciel.start();
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
  const ciel = defineCiel({ ...createCielOptions(stream), extensions: [] });
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
    sessionId: '2026-08-31',
    sessionStore,
    extensions: [],
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
    extensions: [],
  });
  await restored.start();
  expect(restored.messages).toEqual(persisted);
  await restored.stop();
});

describe('Projector Extension', () => {
  test('直接放入 extensions 后生成 Agent 上下文', async () => {
    const project = vi.fn(() => [{ type: 'text' as const, text: 'projected' }]);
    const projector = defineProjector({ name: 'recent', project });
    let projected: unknown;
    const ciel = defineCiel({
      ...createCielOptions(),
      extensions: [projector],
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
