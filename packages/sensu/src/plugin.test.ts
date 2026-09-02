// @env node

import { type CielAgentOptions, defineCiel, definePlugin } from '@cieljs/core';
import type { AnyFunction, InstrumentContext } from '@cieljs/instrument';
import type { ASROptions, ASRResult } from '@ciels/asr';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from '@earendil-works/pi-ai';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vite-plus/test';

const asr = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  emitResult: true,
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
      this.listeners.get('speechstart')?.(segment.startAt);
      if (asr.emitResult) this.listeners.get('result')?.(result);
      this.listeners.get('speechend')?.(result.endAt);
    }

    flush = asr.flush;
    close = asr.close;
  },
}));

const { Hearing, SensuOperation, Sight, SpeechEnded, defineEcho, definePhoton, sensuPlugin } =
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

function testStream(messageText = 'ok'): ReturnType<NonNullable<CielAgentOptions['stream']>> {
  const message: AssistantMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: messageText }],
    api: testModel.api,
    provider: testModel.provider,
    model: testModel.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: { ...message, stopReason: 'pending' } });
    stream.push({ type: 'done', reason: 'stop', message });
  });
  return stream;
}

describe('sensuPlugin', () => {
  it('以流式 Sensu 接入 Corex，并在 speech-end 同时提交 Percept 与 Cue', async () => {
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
              (context.name !== SensuOperation.ASRInput.name &&
                context.name !== SensuOperation.ASROutput.name)
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
    }))();
    const stream: NonNullable<CielAgentOptions['stream']> = () => testStream();
    const ciel = defineCiel({
      instructions: 'You are Ciel.',
      model: testModel,
      sessionStore: false,
      stream,
      plugins: [observer, sensu],
    });

    await ciel.start();
    await ciel.dispatchSignal(screen.create({ data: image }, { kind: 'instant', at: 1_000 }));
    await ciel.dispatchSignal(
      microphone.create(
        { data: Buffer.alloc(3_200) },
        { kind: 'interval', start: 1_000, end: 1_100 },
      ),
    );
    await vi.waitFor(() => {
      expect(ciel.engram.entries(Sight)).toHaveLength(1);
      expect(ciel.engram.entries(Hearing)).toHaveLength(1);
      expect(ciel.messages).toHaveLength(2);
    });

    expect(asr.options).toEqual([{ bufferSeconds: 30, speakerThreshold: 0.6, maxSpeakers: 4 }]);
    await vi.waitFor(() => expect(operations).toHaveLength(2));
    expect(operations[0]).toMatchObject({
      args: [{ data: Buffer.alloc(3_200), startAt: new Date(1_000) }],
      context: {
        name: SensuOperation.ASRInput.name,
        metadata: {
          label: SensuOperation.ASRInput.label,
          pluginId: sensu.id,
          pluginName: sensu.name,
          sensuName: 'microphone.hearing',
          signalDefinitionId: microphone.id,
          signalDefinitionName: microphone.name,
          tag: SensuOperation.ASRInput.tag,
        },
      },
      output: undefined,
    });
    expect(operations[1]).toMatchObject({
      args: [
        {
          origin: microphone,
          startAt: new Date(1_000),
          endAt: new Date(2_000),
          result: {
            content: '你好，夏尔。',
            speaker: 'Alice',
          },
        },
      ],
      context: {
        name: SensuOperation.ASROutput.name,
        metadata: {
          label: SensuOperation.ASROutput.label,
          pluginId: sensu.id,
          pluginName: sensu.name,
          sensuName: 'microphone.hearing',
          signalDefinitionId: microphone.id,
          signalDefinitionName: microphone.name,
          tag: SensuOperation.ASROutput.tag,
        },
      },
      output: { cueCount: 1, entries: [expect.any(Object)] },
    });
    expect(ciel.engram.entries(Hearing)[0]?.value).toMatchObject({
      origin: microphone,
      contents: [{ type: 'text', text: '[Alice] 你好，夏尔。' }],
    });

    await ciel.stop();
    expect(asr.flush).toHaveBeenCalledOnce();
    expect(asr.close).toHaveBeenCalledOnce();
  });

  it('没有 ASR 文本时仍由 speech-end 发出 Cue', async () => {
    const microphone = defineEcho({ name: 'silent-speech' });
    const sensu = sensuPlugin({ name: 'sensu-cue', hearing: { signals: [microphone] } });
    const ciel = defineCiel({
      instructions: 'You are Ciel.',
      model: testModel,
      sessionStore: false,
      stream: () => testStream(),
      plugins: [sensu],
    });

    asr.emitResult = false;
    try {
      expect(SpeechEnded.coalesce).toBe(true);
      await ciel.start();
      await ciel.dispatchSignal(
        microphone.create(
          { data: Buffer.alloc(3_200) },
          { kind: 'interval', start: 3_000, end: 3_100 },
        ),
      );
      await vi.waitFor(() => expect(ciel.messages).toHaveLength(2));
      expect(ciel.engram.entries(Hearing)).toHaveLength(0);
    } finally {
      await ciel.stop();
      asr.emitResult = true;
    }
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
