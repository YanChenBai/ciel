import { expect, test } from 'vite-plus/test';

import {
  defineCue,
  defineCiel,
  defineNoesis,
  definePercept,
  defineSensu,
  defineSignal,
  defineStimulus,
} from '#src/index.ts';

const temporal = {
  kind: 'instant',
  at: 1,
} as const;

test('将 Stimulus 的多个 Signal 路由到 Sensu', async () => {
  interface AudioPayload {
    readonly source: string;
  }

  const microphoneSignal = defineSignal<AudioPayload>({
    name: 'microphone',
    description: 'Microphone audio',
  });
  const systemAudioSignal = defineSignal<AudioPayload>({
    name: 'system-audio',
    description: 'System audio',
  });

  expect(microphoneSignal.id).not.toBe(systemAudioSignal.id);

  const audioPercept = definePercept({
    name: 'audio',
    description: 'Decoded audio',
  });
  const otherAudioPercept = definePercept({
    name: 'audio',
    description: 'Another decoded audio definition',
  });

  expect(audioPercept.id).not.toBe(otherAudioPercept.id);

  const audioStimulus = defineStimulus({
    name: 'audio-input',
    description: 'Captures microphone and system audio',
    async setup(ctx) {
      await ctx.emitSignal(microphoneSignal.create({ source: 'microphone' }, temporal));
      await ctx.emitSignal(systemAudioSignal.create({ source: 'system' }, temporal));
    },
  });
  const otherAudioStimulus = defineStimulus({
    name: 'other-audio-input',
    description: 'Another audio input',
    setup() {},
  });

  expect(audioStimulus.id).not.toBe(otherAudioStimulus.id);

  const received: string[] = [];
  const audioSensu = defineSensu({
    name: 'audio',
    description: 'Converts audio signals into percepts',
    setup(ctx) {
      for (const signal of [microphoneSignal, systemAudioSignal] as const) {
        ctx.onSignal(signal, async input => {
          received.push(input.payload.source);
          await ctx.emitPercept(
            audioPercept.create({
              source: input,
              contents: [{ type: 'text', text: input.payload.source }],
              temporal: input.temporal,
            }),
          );
        });
      }
    },
  });

  expect(audioSensu).toMatchObject({ type: 'sensu' });

  const ciel = defineCiel({
    modules: [audioStimulus, audioSensu],
  });

  await ciel.start();

  expect(received).toEqual(['microphone', 'system']);
  expect(ciel.engram.size).toBe(2);
  expect(ciel.status).toBe('running');

  await ciel.stop();
  expect(ciel.status).toBe('idle');
});

test('在 Percept 写入 Engram 后向 Noesis 派发 Cue 并随作用域自动释放', async () => {
  const messageSignal = defineSignal<string>({
    name: 'message',
    description: 'Message text',
  });
  const messagePercept = definePercept({
    name: 'message',
    description: 'Decoded message',
  });
  const speechEnd = defineCue<string>({
    name: 'speech-end',
    description: 'Speech processing completed',
  });
  const engramSizes: number[] = [];
  let cueCount = 0;

  const sensu = defineSensu({
    name: 'message',
    description: 'Converts messages into percepts',
    setup(ctx) {
      ctx.onSignal(messageSignal, async signal => {
        await ctx.emitPercept(
          messagePercept.create({
            source: signal,
            contents: [{ type: 'text', text: signal.payload }],
            temporal: signal.temporal,
          }),
        );
        await ctx.emitCue(speechEnd.create(signal.payload, signal.temporal));
      });
    },
  });
  const noesis = defineNoesis({
    name: 'thought',
    description: 'Responds to cognition cues',
    setup(ctx) {
      ctx.onCue(speechEnd, cue => {
        expect(cue.payload).toBe('hello');
        cueCount += 1;
        engramSizes.push(ctx.engram.size);
      });
    },
  });
  const stimulus = defineStimulus({
    name: 'message',
    description: 'Emits a message',
    async setup(ctx) {
      await ctx.emitSignal(messageSignal.create('hello', temporal));
    },
  });
  const ciel = defineCiel({ modules: [stimulus, sensu, noesis] });

  await ciel.start();
  expect(cueCount).toBe(1);
  expect(engramSizes).toEqual([1]);
  expect(ciel.engram.size).toBe(1);
  await ciel.stop();

  await ciel.start();
  expect(cueCount).toBe(2);
  expect(engramSizes).toEqual([1, 2]);
  expect(ciel.engram.size).toBe(2);
  await ciel.stop();
});

test('从 Ciel 外部手动派发 Cue', async () => {
  const manual = defineCue<{ readonly prompt: string }>({
    name: 'manual',
    description: 'A manually requested thought',
  });
  const received: string[] = [];
  const noesis = defineNoesis({
    name: 'manual-thought',
    description: 'Responds to manual cues',
    setup(ctx) {
      ctx.onCue(manual, cue => {
        received.push(cue.payload.prompt);
      });
    },
  });
  const ciel = defineCiel({ modules: [noesis] });

  await ciel.start();
  await ciel.emitCue(manual.create({ prompt: 'inspect current context' }, temporal));

  expect(received).toEqual(['inspect current context']);
  expect(ciel.engram.size).toBe(0);

  await ciel.stop();
});

test('按相反顺序释放插件作用域', async () => {
  const messageSignal = defineSignal<string>({
    name: 'message',
    description: 'Message text',
  });
  const disposed: string[] = [];

  const stimulus = defineStimulus({
    name: 'message-input',
    description: 'Captures messages',
    setup(ctx) {
      ctx.onDispose(() => {
        disposed.push('stimulus');
      });
    },
  });

  const messageSensu = defineSensu({
    name: 'message',
    description: 'Converts message signals into percepts',
    setup(ctx) {
      ctx.onSignal(messageSignal, () => undefined);
      ctx.onDispose(() => {
        disposed.push('sensu');
      });
    },
  });

  const ciel = defineCiel({
    modules: [stimulus, messageSensu],
  });

  await ciel.start();
  await ciel.stop();

  expect(disposed).toEqual(['stimulus', 'sensu']);
});
