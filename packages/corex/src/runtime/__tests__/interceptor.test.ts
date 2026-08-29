import { describe, expect, it } from 'vite-plus/test';

import {
  type AnyFunction,
  CielOperationName,
  defineCue,
  defineCiel,
  defineNoesis,
  defineInterceptor,
  definePercept,
  defineProjection,
  defineProjector,
  defineSensu,
  defineSignal,
  defineStimulus,
  type InstrumentContext,
} from '#src/index.ts';

describe('Ciel interceptor 集成', () => {
  it('作为模块拦截 setup,emit 和事件处理边界', async () => {
    const calls: InstrumentContext[] = [];
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs Ciel boundaries',
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (!context) {
          throw new Error('Expected instrument context');
        }

        return next =>
          ((...args: Parameters<T>) => {
            calls.push(context);
            return next(...args);
          }) as T;
      },
    });
    const signal = defineSignal<string>({ name: 'message', description: 'Message signal' });
    const percept = definePercept({ name: 'message', description: 'Message percept' });
    const cue = defineCue<string>({ name: 'message', description: 'Message cue' });
    const sensu = defineSensu({
      name: 'message',
      description: 'Handles messages',
      setup(ctx) {
        ctx.interpret(signal, function interpretSignal(current) {
          return {
            percepts: percept.create({
              source: current,
              contents: [{ type: 'text', text: current.payload }],
              temporal: current.temporal,
            }),
            cues: cue.create(current.temporal, current.payload),
          };
        });
      },
    });
    const noesis = defineNoesis({
      name: 'message',
      description: 'Handles message cues',
      setup(ctx) {
        ctx.onCue(cue, function handleCue() {});
      },
    });
    const stimulus = defineStimulus({
      name: 'message',
      description: 'Emits messages',
      async setup(ctx) {
        await ctx.emitSignal(
          signal.create('hello', {
            kind: 'instant',
            at: 1,
          }),
        );
      },
    });
    const ciel = defineCiel({ modules: [interceptor, stimulus, sensu, noesis] });

    try {
      await ciel.start();
      await ciel.stop();

      expect(calls).toEqual([
        {
          name: CielOperationName.SensuSetup,
          metadata: {
            moduleId: sensu.id,
            moduleName: sensu.name,
            moduleType: sensu.type,
          },
        },
        {
          name: CielOperationName.NoesisSetup,
          metadata: {
            moduleId: noesis.id,
            moduleName: noesis.name,
            moduleType: noesis.type,
          },
        },
        {
          name: CielOperationName.StimulusSetup,
          metadata: {
            moduleId: stimulus.id,
            moduleName: stimulus.name,
            moduleType: stimulus.type,
          },
        },
        {
          name: CielOperationName.SignalEmit,
          metadata: {
            moduleId: stimulus.id,
            moduleName: stimulus.name,
          },
        },
        {
          name: CielOperationName.SensuInterpret,
          metadata: {
            moduleId: sensu.id,
            moduleName: sensu.name,
            signalDefinitionId: signal.id,
            signalDefinitionName: signal.name,
          },
        },
        { name: CielOperationName.CueEmit },
        {
          name: CielOperationName.CueHandle,
          metadata: {
            cueDefinitionId: cue.id,
            cueDefinitionName: cue.name,
            moduleId: noesis.id,
            moduleName: noesis.name,
          },
        },
      ]);
    } finally {
      await ciel.stop();
    }
  });

  it('仅拦截所属 Ciel 实例外部派发的 Cue', async () => {
    const calls: InstrumentContext[] = [];
    const interceptor = defineInterceptor({
      name: 'logger',
      description: 'Logs Ciel boundaries',
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (!context) {
          throw new Error('Expected instrument context');
        }

        return next =>
          ((...args: Parameters<T>) => {
            calls.push(context);
            return next(...args);
          }) as T;
      },
    });
    const cue = defineCue<string>({ name: 'manual', description: 'Manual cue' });
    const instrumentedCiel = defineCiel({ modules: [interceptor] });
    const isolatedCiel = defineCiel({ modules: [] });

    try {
      await instrumentedCiel.start();
      await isolatedCiel.start();
      await instrumentedCiel.emitCue(cue.create({ kind: 'instant', at: 1 }, 'observed'));
      await isolatedCiel.emitCue(cue.create({ kind: 'instant', at: 2 }, 'isolated'));

      expect(calls).toEqual([{ name: CielOperationName.CueEmit }]);
    } finally {
      await instrumentedCiel.stop();
      await isolatedCiel.stop();
    }
  });

  it('为 Projector 边界提供静态 name 和 metadata', async () => {
    const calls: InstrumentContext[] = [];
    const interceptor = defineInterceptor({
      name: 'logger',
      intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
        if (!context) {
          throw new Error('Expected instrument context');
        }

        return next =>
          ((...args: Parameters<T>) => {
            calls.push(context);
            return next(...args);
          }) as T;
      },
    });
    const cue = defineCue<void>({ name: 'project' });
    const projector = defineProjector({
      name: 'empty',
      project() {
        return [];
      },
    });
    const projection = defineProjection({
      name: 'empty',
      projectors: { empty: projector },
    });
    const noesis = defineNoesis({
      name: 'project',
      projection,
      setup(ctx) {
        ctx.onCue(cue, async () => {
          await ctx.project([]);
        });
      },
    });
    const ciel = defineCiel({ modules: [interceptor, projection, noesis] });

    try {
      await ciel.start();
      await ciel.emitCue(cue.create({ kind: 'instant', at: 1 }));

      expect(calls).toEqual([
        {
          name: CielOperationName.NoesisSetup,
          metadata: {
            moduleId: noesis.id,
            moduleName: noesis.name,
            moduleType: noesis.type,
          },
        },
        { name: CielOperationName.CueEmit },
        {
          name: CielOperationName.CueHandle,
          metadata: {
            cueDefinitionId: cue.id,
            cueDefinitionName: cue.name,
            moduleId: noesis.id,
            moduleName: noesis.name,
          },
        },
        {
          name: CielOperationName.ProjectorProject,
          metadata: {
            projectionId: projection.id,
            projectionName: projection.name,
            projectorId: projector.id,
            projectorKey: 'empty',
            projectorName: projector.name,
          },
        },
      ]);
    } finally {
      await ciel.stop();
    }
  });
});
