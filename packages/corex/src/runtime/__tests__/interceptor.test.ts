import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, test, vi } from 'vite-plus/test';

import {
  type AnyFunction,
  CielOperationName,
  defineCiel,
  defineCue,
  definePlugin,
  defineProjector,
  type InstrumentContext,
} from '#src/index.ts';

import { assistantMessage, streamResult, testModel } from './helpers.ts';

const cue = defineCue({ name: 'instrument', prompt: 'Run the instrumented agent.' });
const instant = { kind: 'instant', at: 1 } as const;

test('插装 Agent prompt、每次模型生成、Plugin Tool 和 Projector 执行', async () => {
  const calls: InstrumentContext[] = [];
  const defineInterceptor = definePlugin((options: { readonly name: string }) => ({
    ...options,
    interceptors: [
      {
        intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
          if (!context) throw new Error('Expected instrument context');
          return next =>
            ((...args: Parameters<T>) => {
              calls.push(context);
              return next(...args);
            }) as T;
        },
      },
    ],
  }));
  const interceptor = defineInterceptor({
    name: 'agent-observer',
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
  const toolPlugin = definePlugin((tools: readonly AgentTool<any>[]) => ({
    name: 'tools',
    tools,
  }))([tool]);
  const projector = defineProjector({
    name: 'memory',
    project: () => [{ type: 'text', text: 'projected memory' }],
  });
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
  const onAgentEvent = vi.fn();
  const ciel = defineCiel({
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false,
    stream,
    onAgentEvent,
    plugins: [interceptor, toolPlugin, projector],
  });

  await ciel.start();
  await ciel.think(cue.create(instant));
  await ciel.stop();

  expect(calls).toEqual([
    { name: CielOperationName.AgentThink },
    {
      name: CielOperationName.ProjectorProject,
      metadata: {
        pluginId: projector.id,
        pluginName: projector.name,
        projectorKey: projector.name,
        projectorName: projector.name,
      },
    },
    { name: CielOperationName.AgentPrompt },
    { name: CielOperationName.AgentGenerate },
    {
      name: CielOperationName.AgentToolExecute,
      metadata: {
        pluginId: toolPlugin.id,
        pluginName: toolPlugin.name,
        toolLabel: tool.label,
        toolName: tool.name,
      },
    },
    { name: CielOperationName.AgentGenerate },
  ]);
  expect(execute).toHaveBeenCalledWith(
    'memory-call',
    { content: 'stable fact' },
    undefined,
    expect.any(Function),
  );
  expect(onAgentEvent).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'tool_execution_end', toolName: tool.name }),
  );
});

test('Plugin 通过共享 instrumenter 插装内部操作并获得自身 metadata', async () => {
  const calls: InstrumentContext[] = [];
  const observer = definePlugin(() => ({
    name: 'observer',
    interceptors: [
      {
        intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
          if (context?.name !== 'ciel.plugin.internal') return undefined;
          return next =>
            ((...args: Parameters<T>) => {
              calls.push(context);
              return next(...args);
            }) as T;
        },
      },
    ],
  }))({});
  let run!: (value: number) => number;
  const capability = definePlugin(() => ({
    name: 'capability',
    setup(ctx) {
      run = ctx.instrument((value: number) => value * 2, {
        name: 'ciel.plugin.internal',
        metadata: { capability: 'test' },
      });
    },
  }))({});
  const ciel = defineCiel({
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false,
    plugins: [observer, capability],
  });

  expect(() => run(2)).toThrow(
    'Ciel plugin "capability" cannot run instruments while Ciel is not running',
  );
  await ciel.start();
  expect(run(2)).toBe(4);
  expect(calls).toEqual([
    {
      name: 'ciel.plugin.internal',
      metadata: {
        capability: 'test',
        pluginId: capability.id,
        pluginName: capability.name,
      },
    },
  ]);
  await ciel.stop();
  expect(() => run(2)).toThrow(
    'Ciel plugin "capability" cannot run instruments while Ciel is not running',
  );
});
