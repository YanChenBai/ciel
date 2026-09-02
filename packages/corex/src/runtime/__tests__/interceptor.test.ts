import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, test, vi } from 'vite-plus/test';

import {
  type AnyFunction,
  CielOperation,
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
const InternalOperationTag = {
  Plugin: 'PLUGIN',
} as const;
const InternalOperation = {
  Run: {
    name: 'ciel.plugin.internal',
    label: 'Plugin Internal',
    tag: InternalOperationTag.Plugin,
  },
} as const;

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
    CielOperation.PluginCreate.name,
    CielOperation.PluginInitialize.name,
    CielOperation.PluginActivate.name,
    CielOperation.CueSubmit.name,
    CielOperation.AgentRun.name,
    CielOperation.ProjectorProject.name,
    CielOperation.AgentPrompt.name,
    CielOperation.ModelGenerate.name,
    CielOperation.ToolExecute.name,
    CielOperation.ModelGenerate.name,
    CielOperation.PluginDeactivate.name,
    CielOperation.PluginDispose.name,
  ]);
  expect(calls.find(context => context.name === CielOperation.ToolExecute.name)).toEqual({
    ...CielOperation.ToolExecute,
    metadata: {
      pluginId: capability.id,
      pluginName: capability.name,
      toolLabel: tool.label,
      toolName: tool.name,
    },
  });
  expect(calls.find(context => context.name === CielOperation.CueSubmit.name)).toEqual({
    ...CielOperation.CueSubmit,
    metadata: {
      cueAt: instant.at,
      cueDefinitionId: cue.id,
      cueDefinitionName: cue.name,
    },
  });
  expect(calls.find(context => context.name === CielOperation.AgentRun.name)).toEqual({
    ...CielOperation.AgentRun,
    metadata: {
      cueAt: instant.at,
      cueDefinitionId: cue.id,
      cueDefinitionName: cue.name,
    },
  });
});

test('Plugin 使用派生 instrument 合并身份与内部操作 metadata', () => {
  const calls: InstrumentContext[] = [];
  const observer = defineInterceptor({
    name: 'observer',
    interceptor: {
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (context?.name !== InternalOperation.Run.name) return undefined;
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
        ...InternalOperation.Run,
        metadata: { capability: 'test' },
      });
      run = internal((value: number) => value * 2, {
        ...InternalOperation.Run,
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
      ...InternalOperation.Run,
      metadata: {
        operation: 'double',
        capability: 'test',
        pluginId: capability.id,
        pluginName: capability.name,
      },
    },
  ]);
});
