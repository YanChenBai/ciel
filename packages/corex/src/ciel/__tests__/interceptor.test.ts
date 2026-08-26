import { describe, expect, it } from 'vite-plus/test';

import {
  type AnyFunction,
  defineCue,
  defineCiel,
  defineNoesis,
  defineInterceptor,
  definePercept,
  defineSensu,
  defineSignal,
  defineStimulus,
  useInterceptor,
} from '../../index.ts';

describe('Ciel interceptor 集成', () => {
  it('拦截 setup,emit 和事件处理边界,并在注销后停止拦截', async () => {
    const calls: string[] = [];
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>(target: T) {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push(target.name);
            return next(...args);
          }) as T;
      },
    });
    const disposeInterceptor = useInterceptor(interceptor);
    const signal = defineSignal<string>({ name: 'message', description: 'Message signal' });
    const percept = definePercept({ name: 'message', description: 'Message percept' });
    const cue = defineCue<string>({ name: 'message', description: 'Message cue' });
    const sensu = defineSensu({
      name: 'message',
      description: 'Handles messages',
      setup(ctx) {
        ctx.onSignal(signal, async function handleSignal(current) {
          await ctx.emitPercept(
            percept.create({
              source: current,
              contents: [{ type: 'text', text: current.payload }],
              temporal: current.temporal,
            }),
          );
          await ctx.emitCue(cue.create(current.payload, current.temporal));
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
    const ciel = defineCiel({ modules: [stimulus, sensu, noesis] });

    try {
      await ciel.start();
      await ciel.stop();

      expect(calls).toEqual([
        'setup',
        'setup',
        'setup',
        'emitSignal',
        'handleSignal',
        'emitPercept',
        'emitCue',
        'handleCue',
      ]);

      await disposeInterceptor();
      await ciel.start();
      await ciel.stop();

      expect(calls).toHaveLength(8);
    } finally {
      await ciel.stop();
      await disposeInterceptor();
    }
  });

  it('拦截 Ciel 外部派发的 Cue', async () => {
    const calls: string[] = [];
    const interceptor = defineInterceptor({
      intercept<T extends AnyFunction>(target: T) {
        return next =>
          ((...args: Parameters<T>) => {
            calls.push(target.name);
            return next(...args);
          }) as T;
      },
    });
    const disposeInterceptor = useInterceptor(interceptor);
    const cue = defineCue<string>({ name: 'manual', description: 'Manual cue' });
    const ciel = defineCiel({ modules: [] });

    try {
      await ciel.start();
      await ciel.emitCue(cue.create('hello', { kind: 'instant', at: 1 }));

      expect(calls).toEqual(['emitCue']);
    } finally {
      await ciel.stop();
      await disposeInterceptor();
    }
  });
});
