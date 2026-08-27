import { describe, expect, expectTypeOf, it } from 'vite-plus/test';

import { defineCue } from '../cue/index.ts';
import { defineNoesis } from '../noesis/index.ts';
import { definePercept } from '../percept/index.ts';
import { defineProjection } from '../projection/index.ts';
import { defineProjector } from '../projector/index.ts';
import { defineSensu } from '../sensu/index.ts';
import { defineSignal } from '../signal/index.ts';
import { defineStimulus } from '../stimulus/index.ts';
import { defineCiel } from './index.ts';

const temporal = { kind: 'instant', at: 1 } as const;

describe('Ciel Projection', () => {
  it('收集顶层 Projection 并返回按 key 命名的投影结果', async () => {
    const inputSignal = defineSignal<string>({ name: 'input' });
    const speechPercept = definePercept({ name: 'speech' });
    const visionPercept = definePercept({ name: 'vision' });
    const thinkingCue = defineCue<void>({ name: 'thinking' });
    const projected: Array<{ readonly speech: readonly string[]; readonly vision: number }> = [];

    const speechProjector = defineProjector({
      name: 'speech',
      project({ engram }) {
        return engram
          .entries(speechPercept)
          .flatMap(entry =>
            entry.value.contents.flatMap(content =>
              content.type === 'text' ? [content.text] : [],
            ),
          );
      },
    });
    const visionProjector = defineProjector({
      name: 'vision',
      async project({ engram }) {
        await Promise.resolve();
        return engram.entries(visionPercept).length;
      },
    });
    const agentProjection = defineProjection({
      name: 'agent-context',
      projectors: {
        speech: speechProjector,
        vision: visionProjector,
      },
    });
    const sensu = defineSensu({
      name: 'input',
      setup(ctx) {
        ctx.onSignal(inputSignal, async signal => {
          await ctx.emitPercept(
            speechPercept.create({
              source: signal,
              contents: [{ type: 'text', text: signal.payload }],
              temporal: signal.temporal,
            }),
          );
          await ctx.emitPercept(
            visionPercept.create({
              source: signal,
              contents: [{ type: 'image', data: 'frame' }],
              temporal: signal.temporal,
            }),
          );
          await ctx.emitCue(thinkingCue.create(undefined, signal.temporal));
        });
      },
    });
    const agent = defineNoesis({
      name: 'agent',
      projection: agentProjection,
      setup(ctx) {
        ctx.onCue(thinkingCue, async () => {
          const context = await ctx.project(ctx.engram.recent());
          expectTypeOf(context.speech).toEqualTypeOf<string[]>();
          expectTypeOf(context.vision).toEqualTypeOf<number>();
          projected.push(context);
        });
      },
    });
    const stimulus = defineStimulus({
      name: 'input',
      async setup(ctx) {
        await ctx.emitSignal(inputSignal.create('hello', temporal));
      },
    });
    const ciel = defineCiel({
      modules: [agentProjection, agent, sensu, stimulus],
    });

    await ciel.start();

    expect(projected).toEqual([{ speech: ['hello'], vision: 1 }]);
    await ciel.stop();
  });

  it('拒绝使用未在当前 Ciel 注册的 Projection', async () => {
    const projection = defineProjection({
      name: 'missing-context',
      projectors: {},
    });
    const noesis = defineNoesis({
      name: 'agent',
      projection,
      setup() {},
    });
    const ciel = defineCiel({ modules: [noesis] });

    await expect(ciel.start()).rejects.toThrow(
      'Projection "missing-context" is not registered in this Ciel',
    );
    expect(ciel.status).toBe('idle');
  });
});
