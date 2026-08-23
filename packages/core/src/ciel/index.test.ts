// @env node

import path from 'node:path';

import { Output } from 'ai';
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';

import { Memory } from '#src/memory/index.ts';
import { Reading, Sight } from '#src/percepts/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import { Stimulus } from '#src/stimulus/index.ts';
import type { VigiliaOptions } from '#src/vigilia/index.ts';

const processorState = vi.hoisted(() => ({
  closes: 0,
  echoes: [] as unknown[],
  photons: [] as unknown[],
  sensusSignals: [] as (readonly unknown[])[],
  sightPath: undefined as string | undefined,
}));

vi.mock('#sensus', async () => {
  const { EventHost } = await import('@ciels/event');
  return {
    OculusComposer: class {
      compose(): never {
        throw new Error('OculusComposer is not exercised by Ciel tests');
      }
    },
    Sensus: class extends EventHost<{
      data(data: unknown): void;
      error(error: Error): void;
      speechend(at: Date): void;
      speechstart(at: Date): void;
    }> {
      constructor(options: { signals: readonly unknown[] }) {
        super();
        processorState.sensusSignals.push(options.signals);
      }

      async process(signal: unknown): Promise<void> {
        const value = signal as { type: string };
        if (value.type === 'echo') {
          processorState.echoes.push(signal);
          // 真实 Auris 会先输出 Hearing，再转发 ASR 的 VAD 结束时间。
          this.emit('speechstart', (signal as Echo).startAt);
          this.emit('speechend', (signal as Echo).endAt);
        } else if (value.type === 'photon') {
          const photon = signal as Photon;
          await Promise.resolve();
          processorState.photons.push(signal);
          if (processorState.sightPath) {
            this.emit(
              'data',
              new Sight({
                endAt: new Date(1),
                originSignal: photon.constructor as typeof Photon,
                path: processorState.sightPath,
                startAt: new Date(0),
              }),
            );
          }
        } else if (value.type === 'script') {
          const script = signal as Script;
          this.emit(
            'data',
            new Reading({
              content: script.content,
              timestamp: script.timestamp,
              originSignal: script.constructor as typeof Script,
            }),
          );
        }
      }

      close(): void {
        processorState.closes += 1;
      }
    },
  };
});

const { Ciel } = await import('./index.ts');

const memories: Memory[] = [];

function createEmbedder(): MockEmbeddingModelV3 {
  return new MockEmbeddingModelV3({
    doEmbed: async ({ values }) => ({
      embeddings: values.map(() => [1, 0]),
      warnings: [],
    }),
  });
}

async function createMemory(): Promise<Memory> {
  const memory = new Memory({
    path: ':memory:',
    embedder: createEmbedder(),
    model: createModel('经历摘要'),
  });
  memories.push(memory);
  return memory;
}

afterEach(async () => {
  processorState.closes = 0;
  processorState.echoes.length = 0;
  processorState.photons.length = 0;
  processorState.sensusSignals.length = 0;
  processorState.sightPath = undefined;
  await Promise.all(memories.splice(0).map(memory => memory.close()));
});

function createModel(text = '保持安静'): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

async function createCiel(
  stimulus: TestStimulus,
  vigilia?: VigiliaOptions,
): Promise<InstanceType<typeof Ciel>> {
  return new Ciel(stimulus, {
    nucleus: {
      context: { perceptWindow: Number.MAX_SAFE_INTEGER },
      memory: await createMemory(),
      model: createModel(),
    },
    ...(vigilia ? { vigilia } : {}),
  });
}

class TestEcho extends Echo.WithMeta({
  name: 'Test audio',
  description: 'Audio emitted by a test stimulus',
}) {}

class TestPhoton extends Photon.WithMeta({
  name: 'Test video',
  description: 'Video emitted by a test stimulus',
}) {}

class TestScript extends Script.WithMeta({
  name: 'Test text',
  description: 'Text emitted by a test stimulus',
}) {}

const testSignals = [TestEcho, TestPhoton, TestScript] as const;

class TestStimulus extends Stimulus<typeof testSignals> {
  static readonly meta = {
    name: 'Test scene',
    description: 'Scene emitted by a test stimulus',
  };

  readonly signals = testSignals;
  started = false;
  stopped = false;

  async start(): Promise<void> {
    this.started = true;
    await this.send(
      new TestEcho({
        data: Buffer.alloc(2),
        startAt: new Date(0),
        endAt: new Date(1),
      }),
    );
    await this.send(new TestPhoton({ data: Buffer.alloc(0), timestamp: new Date(0) }));
    await this.send(new TestScript({ content: 'hello', timestamp: new Date(0) }));
  }

  stop(): void {
    this.stopped = true;
  }
}

describe('Ciel', () => {
  it('通过 think 执行可观测的独立结构化思考', async () => {
    const memory = await createMemory();
    const model = createModel('{"roomId":123,"reason":"值得先观察"}');
    const ciel = new Ciel(new TestStimulus(), {
      nucleus: { memory, model, system: ['房内默认互动指令'] },
      vigilia: { capture: { result: true } },
    });
    const thoughts: unknown[] = [];
    ciel.on('thought', output => thoughts.push(output));

    const result = await ciel.think({
      name: 'select-live-room',
      output: Output.object({
        schema: z.object({ reason: z.string(), roomId: z.number().int().positive() }),
      }),
      prompt: '从候选中选择一个直播间。',
      system: ['只能选择真实候选。'],
    });

    expect(result).toEqual({ reason: '值得先观察', roomId: 123 });
    expect(thoughts).toEqual([]);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('只能选择真实候选');
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).not.toContain('房内默认互动指令');
    const events = ciel.vigilia.events({ limit: 100 });
    expect(events.find(event => event.type === 'nucleus.think.started')?.data).toMatchObject({
      name: 'select-live-room',
      trigger: 'requested',
    });
    expect(events.find(event => event.type === 'nucleus.think.completed')?.data).toMatchObject({
      name: 'select-live-room',
      output: { reason: '值得先观察', roomId: 123 },
      trigger: 'requested',
    });
  });

  it('stores captured Sight paths relative to the Vigilia asset root', async () => {
    const assetRoot = path.resolve('.ciel-data');
    processorState.sightPath = path.join(assetRoot, 'sights', 'frame.jpg');
    const ciel = await createCiel(new TestStimulus(), {
      assetRoot,
      capturePerceptContent: true,
    });

    await ciel.start();
    await ciel.stop();

    const sight = ciel.vigilia
      .events({ limit: 100 })
      .find(
        (event): event is Extract<typeof event, { type: 'percept.appended' }> =>
          event.type === 'percept.appended' && event.data.perceptType === 'sight',
      );
    expect(sight?.data.content).toEqual({ path: 'sights/frame.jpg', type: 'image' });
  });

  it('discovers signals and routes emitted instances to automatic processors', async () => {
    const stimulus = new TestStimulus();
    const readings: Reading[] = [];
    const ciel = await createCiel(stimulus);
    ciel.on('data', percept => {
      if (percept.type === 'reading') {
        readings.push(percept);
      }
    });

    await ciel.start();

    expect(stimulus.started).toBe(true);
    expect(processorState.sensusSignals).toEqual([testSignals]);
    expect(processorState.echoes[0]).toBeInstanceOf(TestEcho);
    expect(processorState.photons[0]).toBeInstanceOf(TestPhoton);
    expect(readings[0]).toMatchObject({
      content: 'hello',
      originSignal: TestScript,
    });
    expect((await ciel.getContext()).data.map(record => record.percept)).toEqual(readings);
    await ciel.stop();
    expect(stimulus.stopped).toBe(true);
    expect(processorState.closes).toBe(1);
  });

  it('records replayable runtime facts through Vigilia', async () => {
    const ciel = await createCiel(new TestStimulus());

    await ciel.start();
    await vi.waitFor(() => expect(ciel.vigilia.snapshot().totals.thoughts).toBe(1));
    await ciel.stop();

    const events = ciel.vigilia.events({ limit: 100 });
    expect(events.map(event => event.type)).toEqual(
      expect.arrayContaining([
        'ciel.state.changed',
        'signal.processing.started',
        'signal.processing.completed',
        'percept.appended',
        'nucleus.think.started',
        'nucleus.think.completed',
      ]),
    );
    expect(events.map(event => event.sequence)).toEqual(events.map((_, index) => index + 1));
    const operationNames = events.flatMap(event =>
      event.type === 'operation.started' ||
      event.type === 'operation.completed' ||
      event.type === 'operation.failed'
        ? [event.data.name]
        : [],
    );
    expect(operationNames.every(name => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))).toBe(true);
    expect(operationNames).toEqual(
      expect.arrayContaining(['generate', 'choose-response-or-tools']),
    );
    expect(events.find(event => event.type === 'percept.appended')?.data).toMatchObject({
      endAt: 0,
      startAt: 0,
    });
    expect(ciel.vigilia.snapshot()).toMatchObject({
      activeOperations: [],
      state: 'idle',
      totals: { percepts: 1, signals: 3, thoughts: 1 },
    });
    expect(JSON.stringify(events)).not.toContain('Buffer');

    const thinkStarted = events.find(event => event.type === 'nucleus.think.started');
    expect(thinkStarted?.data.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const child = events.find(
      event =>
        event.type === 'operation.started' &&
        event.data.parentOperationId === thinkStarted?.data.operationId,
    );
    expect(child?.type === 'operation.started' ? child.data.operationId : undefined).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('可关闭高频 Signal，同时保留 ASR、上下文、结果与记忆详情', async () => {
    const ciel = new Ciel(new TestStimulus(), {
      nucleus: {
        context: { perceptWindow: Number.MAX_SAFE_INTEGER },
        memory: await createMemory(),
        model: createModel('思考结果'),
      },
      vigilia: {
        capture: { context: true, memory: true, result: true },
        signals: false,
      },
    });

    await ciel.start();
    await vi.waitFor(() => expect(ciel.vigilia.snapshot().totals.thoughts).toBe(1));
    await ciel.stop();

    const events = ciel.vigilia.events({ limit: 500 });
    expect(events.some(event => event.type.startsWith('signal.processing.'))).toBe(false);
    expect(
      events.some(
        event =>
          event.type === 'operation.completed' &&
          event.data.category === 'sensory' &&
          event.data.name === 'asr',
      ),
    ).toBe(true);
    expect(
      events.some(
        event =>
          event.type === 'operation.completed' &&
          event.data.category === 'context' &&
          event.data.name === 'build-model-request' &&
          event.data.detail !== undefined,
      ),
    ).toBe(true);
    expect(
      events.some(
        event => event.type === 'nucleus.think.completed' && event.data.output === '思考结果',
      ),
    ).toBe(true);
    expect(
      events.some(event => event.type === 'memory.archive.completed' && event.data.summary),
    ).toBe(true);
  });

  it('creates an isolated Sensus for its stimulus', async () => {
    processorState.sensusSignals.length = 0;
    const first = await createCiel(new TestStimulus());
    const second = await createCiel(new TestStimulus());

    await first.start();
    await second.start();

    expect(processorState.sensusSignals).toEqual([testSignals, testSignals]);
    await first.stop();
    await second.stop();
  });

  it('registers its stimulus in the Nucleus context', async () => {
    const stimulus = new TestStimulus();
    const ciel = new Ciel(stimulus, {
      nucleus: {
        context: { perceptWindow: Number.MAX_SAFE_INTEGER },
        memory: await createMemory(),
        model: createModel(),
      },
    });

    await ciel.start();
    const context = await ciel.getContext();
    expect(context.definitions.filter(definition => definition.kind === 'stimulus')).toHaveLength(
      1,
    );
    expect(context.data).toHaveLength(1);
    expect(context.data[0]?.stimulus).toBe(stimulus);
    await ciel.stop();
  });

  it('owns one Nucleus and forwards its thoughts', async () => {
    const stimulus = new TestStimulus();
    const model = createModel();
    const ciel = new Ciel(stimulus, {
      nucleus: {
        agent: '测试中的行为定义',
        context: { perceptWindow: Number.MAX_SAFE_INTEGER },
        identity: '名字：测试夏尔',
        memory: await createMemory(),
        model,
        soul: '测试中的内在定义',
      },
    });
    const thoughts: unknown[] = [];
    ciel.on('thought', output => {
      thoughts.push(output);
    });

    await ciel.start();
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));

    expect(thoughts).toContain('保持安静');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('测试中的内在定义');
    expect(prompt).toContain('名字：测试夏尔');
    expect(prompt).toContain('测试中的行为定义');

    await ciel.stop();
  });
});
