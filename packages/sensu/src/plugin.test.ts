// @env node

import type { ASROptions, ASRResult } from '@ciels/asr';
import type { AnyFunction, InstrumentContext } from '@ciels/interceptor';
import type { Model } from '@earendil-works/pi-ai';
import { createEngramView, defineCiel, definePlugin } from 'corex';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vite-plus/test';

const asr = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  flush: vi.fn(),
  options: [] as Array<ASROptions | undefined>,
}));

vi.mock('@ciels/asr', () => ({
  ASR: class {
    private readonly listeners = new Map<string, (value: unknown) => void>();

    constructor(options?: ASROptions) {
      asr.options.push(options);
    }

    on(event: string, callback: (value: unknown) => void): () => void {
      this.listeners.set(event, callback);
      return () => this.listeners.delete(event);
    }

    write(segment: { startAt: Date }): void {
      const result: ASRResult = {
        content: '你好，夏尔。',
        speaker: 'Alice',
        confidence: 0.9,
        startAt: segment.startAt,
        endAt: new Date(segment.startAt.getTime() + 1_000),
      };
      this.listeners.get('result')?.(result);
    }

    flush = asr.flush;
    close = asr.close;
  },
}));

const { Hearing, SensuOperationName, Sight, defineEcho, definePhoton, sensuPlugin } =
  await import('./index.ts');

const testModel = {
  id: 'test',
  name: 'Test',
  api: 'openai-responses',
  provider: 'openai',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4_096,
} as Model<any>;

describe('sensuPlugin', () => {
  it('接入 Corex 并通过单个投影合并视觉和听觉上下文', async () => {
    const screen = definePhoton({ name: 'screen' });
    const microphone = defineEcho({ name: 'microphone' });
    const image = await sharp({
      create: { width: 64, height: 36, channels: 3, background: '#663399' },
    })
      .jpeg()
      .toBuffer();
    const sensu = sensuPlugin({
      name: 'sensu',
      vision: { signals: [screen], sampleInterval: 0 },
      hearing: {
        signals: [microphone],
        asr: { bufferSeconds: 30, speakerThreshold: 0.6, maxSpeakers: 4 },
      },
      projector: {
        maxVisionFrames: 4,
        visionPrompt: '观察画面变化。',
        hearingPrompt: '理解听到的内容。',
      },
    });
    const operations: Array<{
      readonly args: readonly unknown[];
      readonly context: InstrumentContext;
      output?: unknown;
    }> = [];
    const observer = definePlugin(() => ({
      name: 'observer',
      interceptors: [
        {
          intercept<T extends AnyFunction>(_target: T, context?: InstrumentContext) {
            if (
              !context ||
              (context.name !== SensuOperationName.ASRInput &&
                context.name !== SensuOperationName.ASROutput)
            ) {
              return undefined;
            }
            return next =>
              ((...args: Parameters<T>) => {
                const operation = { args, context, output: undefined as unknown };
                operations.push(operation);
                const result = next(...args);
                if (result instanceof Promise) {
                  return result.then(output => {
                    operation.output = output;
                    return output;
                  }) as ReturnType<T>;
                }
                operation.output = result;
                return result;
              }) as T;
          },
        },
      ],
    }))({});
    const source = definePlugin(() => ({
      name: 'source',
      setup(ctx) {
        ctx.onStart(async () => {
          await ctx.emitSignal(screen.create({ data: image }, { kind: 'instant', at: 1_000 }));
          await ctx.emitSignal(
            microphone.create(
              { data: Buffer.alloc(3_200) },
              { kind: 'interval', start: 1_000, end: 1_100 },
            ),
          );
        });
      },
    }))({});
    const ciel = defineCiel({
      instructions: 'You are Ciel.',
      model: testModel,
      sessionStore: false,
      plugins: [observer, sensu, source],
    });

    await ciel.start();
    await vi.waitFor(() => {
      expect(ciel.engram.entries(Sight)).toHaveLength(1);
      expect(ciel.engram.entries(Hearing)).toHaveLength(1);
    });

    expect(asr.options).toEqual([{ bufferSeconds: 30, speakerThreshold: 0.6, maxSpeakers: 4 }]);
    await vi.waitFor(() => expect(operations).toHaveLength(2));
    expect(operations).toEqual([
      {
        args: [{ data: Buffer.alloc(3_200), startAt: new Date(1_000) }],
        context: {
          name: SensuOperationName.ASRInput,
          metadata: {
            capability: 'hearing',
            pluginId: sensu.id,
            pluginName: sensu.name,
            signalDefinitionId: microphone.id,
            signalDefinitionName: microphone.name,
          },
        },
        output: undefined,
      },
      {
        args: [
          {
            content: '你好，夏尔。',
            speaker: 'Alice',
            confidence: 0.9,
            startAt: new Date(1_000),
            endAt: new Date(2_000),
          },
        ],
        context: {
          name: SensuOperationName.ASROutput,
          metadata: {
            capability: 'hearing',
            pluginId: sensu.id,
            pluginName: sensu.name,
            signalDefinitionId: microphone.id,
            signalDefinitionName: microphone.name,
          },
        },
        output: {
          origin: microphone,
          result: {
            content: '你好，夏尔。',
            speaker: 'Alice',
            confidence: 0.9,
            startAt: new Date(1_000),
            endAt: new Date(2_000),
          },
        },
      },
    ]);
    const projector = sensu.projectors?.[0];
    expect(projector).toBeDefined();
    const context = await projector!.project({ engram: createEngramView(ciel.engram.all()) });
    expect(context[0]).toMatchObject({ type: 'text' });
    expect(context[0]).toHaveProperty('text', expect.stringContaining('理解听到的内容。'));
    expect(context[0]).toHaveProperty('text', expect.stringContaining('[microphone] [Alice]'));
    expect(context[1]).toHaveProperty('text', expect.stringContaining('观察画面变化。'));
    const projectedImage = context[2];
    expect(projectedImage?.type).toBe('image');
    if (
      projectedImage?.type !== 'image' ||
      typeof projectedImage.data === 'string' ||
      projectedImage.data instanceof URL
    ) {
      throw new TypeError('Expected projected image bytes');
    }
    await expect(sharp(projectedImage.data).metadata()).resolves.toMatchObject({
      width: 1920,
      height: 1080,
    });

    await ciel.stop();
    expect(asr.flush).toHaveBeenCalledOnce();
    expect(asr.close).toHaveBeenCalledOnce();
  });

  it('拒绝空能力、重复 Signal 和无效投影容量', () => {
    const screen = definePhoton({ name: 'screen' });

    expect(() => sensuPlugin({ name: 'empty' })).toThrow(
      'Sensu requires at least one visual or auditory signal',
    );
    expect(() => sensuPlugin({ name: 'duplicate', vision: { signals: [screen, screen] } })).toThrow(
      'Sensu signal "screen" is declared more than once',
    );
    expect(() =>
      sensuPlugin({
        name: 'invalid-projector',
        vision: { signals: [screen] },
        projector: { maxVisionFrames: 10 },
      }),
    ).toThrow('projector.maxVisionFrames must be an integer between 1 and 9');
  });
});
