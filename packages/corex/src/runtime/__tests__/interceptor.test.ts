import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, test, vi } from 'vite-plus/test';

import {
  type AnyFunction,
  CielOperationCategoryAttribute,
  CielOperationName,
  defineCiel,
  defineCue,
  defineInterceptor,
  definePlugin,
  defineProjector,
  type InstrumentContext,
} from '#src/index.ts';

import { assistantMessage, streamResult, testModel } from './helpers.ts';

const cue = defineCue({ name: 'instrument', prompt: 'Run the instrumented agent.' });
const instant = { kind: 'instant', at: 1 } as const;

test('插装 Agent、Tool、Projector 与四阶段 Plugin 生命周期', async () => {
  const calls: InstrumentContext[] = [];
  const observer = defineInterceptor({
    name: 'agent-observer',
    interceptor: {
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (!context) throw new Error('Expected instrument context');
        return next =>
          ((...args: Parameters<T>) => {
            calls.push(context);
            return next(...args);
          }) as T;
      },
    },
  });
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
  const projector = defineProjector({
    name: 'memory',
    project: () => [{ type: 'text', text: 'projected memory' }],
  });
  const createCapability = definePlugin(() => ({
    name: 'capability',
    create() {
      return {
        extensions: [projector],
        tools: [tool],
        initialize() {},
        activate() {},
        deactivate() {},
        dispose() {},
      };
    },
  }));
  const capability = createCapability();
  const ciel = defineCiel({
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false,
    stream,
    extensions: [observer, capability],
  });

  await ciel.start();
  await ciel.think(cue.create(instant));
  await ciel.stop();

  expect(calls.map(context => context.name)).toEqual([
    CielOperationName.PluginCreate,
    CielOperationName.PluginInitialize,
    CielOperationName.PluginActivate,
    CielOperationName.AgentThink,
    CielOperationName.ProjectorProject,
    CielOperationName.AgentPrompt,
    CielOperationName.AgentGenerate,
    CielOperationName.AgentToolExecute,
    CielOperationName.AgentGenerate,
    CielOperationName.PluginDeactivate,
    CielOperationName.PluginDispose,
  ]);
  expect(calls.find(context => context.name === CielOperationName.AgentToolExecute)).toEqual({
    name: CielOperationName.AgentToolExecute,
    metadata: {
      pluginId: capability.id,
      pluginName: capability.name,
      [CielOperationCategoryAttribute]: 'tool',
      toolLabel: tool.label,
      toolName: tool.name,
    },
  });
});

test('Plugin 使用派生 instrument 合并身份与内部操作 metadata', () => {
  const calls: InstrumentContext[] = [];
  const observer = defineInterceptor({
    name: 'observer',
    interceptor: {
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (context?.name !== 'ciel.plugin.internal') return undefined;
        return next =>
          ((...args: Parameters<T>) => {
            calls.push(context);
            return next(...args);
          }) as T;
      },
    },
  });
  let run!: (value: number) => number;
  const createCapability = definePlugin(() => ({
    name: 'capability',
    create(context) {
      const internal = context.instrument.with({
        name: 'ciel.plugin.internal',
        metadata: { capability: 'test' },
      });
      run = internal((value: number) => value * 2, {
        name: 'ciel.plugin.internal',
        metadata: { pluginId: 'forged', operation: 'double' },
      });
      return {};
    },
  }));
  const capability = createCapability();
  defineCiel({
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false,
    extensions: [observer, capability],
  });

  expect(run(2)).toBe(4);
  expect(calls).toEqual([
    {
      name: 'ciel.plugin.internal',
      metadata: {
        operation: 'double',
        capability: 'test',
        pluginId: capability.id,
        pluginName: capability.name,
      },
    },
  ]);
});
