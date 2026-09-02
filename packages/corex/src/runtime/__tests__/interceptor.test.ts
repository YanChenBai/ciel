import type { AgentTool, StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { expect, test, vi } from 'vite-plus/test';

import {
  type AnyFunction,
  CielOperation,
  defineCiel,
  defineCue,
  definePlugin,
  defineProjector,
  type InstrumentContext,
} from '#src/index.ts';

import { assistantMessage, streamResult, testModel } from './helpers.ts';

const cue = defineCue({ name: 'instrument', prompt: 'Run the instrumented agent.' });
const instant = { kind: 'instant', at: 1 } as const;
test('插装 Agent、Tool、Projector 与四阶段 Plugin 生命周期', async () => {
  const calls: InstrumentContext[] = [];
  const observer = definePlugin(() => ({
    name: 'agent-observer',
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
  }))();
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
    projectors: [projector],
    tools: [tool],
    initialize() {},
    activate() {},
    deactivate() {},
    dispose() {},
  }));
  const capability = createCapability();
  const ciel = defineCiel({
    instructions: 'You are Ciel.',
    model: testModel,
    sessionStore: false,
    stream,
    plugins: [observer, capability],
  });

  await ciel.start();
  await ciel.think(cue.create(instant));
  await ciel.stop();

  expect(calls.map(context => context.name)).toEqual([
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
    name: CielOperation.ToolExecute.name,
    metadata: {
      label: CielOperation.ToolExecute.label,
      pluginId: capability.id,
      pluginName: capability.name,
      tag: CielOperation.ToolExecute.tag,
      toolLabel: tool.label,
      toolName: tool.name,
    },
  });
  expect(calls.find(context => context.name === CielOperation.CueSubmit.name)).toEqual({
    name: CielOperation.CueSubmit.name,
    metadata: {
      cueAt: instant.at,
      cueDefinitionId: cue.id,
      cueDefinitionName: cue.name,
      label: CielOperation.CueSubmit.label,
      tag: CielOperation.CueSubmit.tag,
    },
  });
  expect(calls.find(context => context.name === CielOperation.AgentRun.name)).toEqual({
    name: CielOperation.AgentRun.name,
    metadata: {
      cueAt: instant.at,
      cueDefinitionId: cue.id,
      cueDefinitionName: cue.name,
      label: CielOperation.AgentRun.label,
      tag: CielOperation.AgentRun.tag,
    },
  });
});
