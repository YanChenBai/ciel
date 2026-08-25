import { expect, test } from 'vite-plus/test';

import {
  defineCiel,
  definePercept,
  defineSensu,
  defineSignal,
  defineStimulus,
} from '../src/index.ts';

const temporal = {
  kind: 'instant',
  at: 1,
} as const;

test('将 Stimulus 的多个已声明 Signal 路由到 Sensu', async () => {
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

  expect(microphoneSignal.symbol).not.toBe(systemAudioSignal.symbol);

  const audioPercept = definePercept({
    name: 'audio',
    description: 'Decoded audio',
  });
  const otherAudioPercept = definePercept({
    name: 'audio',
    description: 'Another decoded audio definition',
  });

  expect(audioPercept.symbol).not.toBe(otherAudioPercept.symbol);

  const audioStimulus = defineStimulus({
    name: 'audio-input',
    description: 'Captures microphone and system audio',
    signals: [microphoneSignal, systemAudioSignal] as const,
    async setup(ctx) {
      await ctx.emitSignal(microphoneSignal.create({ source: 'microphone' }, temporal));
      await ctx.emitSignal(systemAudioSignal.create({ source: 'system' }, temporal));
    },
  });
  const otherAudioStimulus = defineStimulus({
    name: 'other-audio-input',
    description: 'Another audio input',
    signals: [microphoneSignal] as const,
    setup() {},
  });

  expect(audioStimulus.symbol).not.toBe(otherAudioStimulus.symbol);

  const received: string[] = [];
  const audioSensu = defineSensu<AudioPayload>((...signals) => ({
    name: 'audio',
    description: 'Converts audio signals into percepts',
    setup(ctx) {
      for (const signal of signals) {
        ctx.onSignal(signal, input => {
          received.push(input.payload.source);
          return audioPercept.create({
            source: input,
            contents: [{ type: 'text', text: input.payload.source }],
            temporal: input.temporal,
          });
        });
      }
    },
  }));

  expect(audioSensu(microphoneSignal).symbol).not.toBe(audioSensu(microphoneSignal).symbol);

  const ciel = defineCiel({
    stimulus: [audioStimulus],
    sensus: ([signals]) => [audioSensu(...signals)],
    nucleus: {},
  });

  await ciel.start();

  expect(received).toEqual(['microphone', 'system']);
  expect(ciel.percepts).toHaveLength(2);
  expect(ciel.status).toBe('running');

  await ciel.stop();
  expect(ciel.status).toBe('idle');
});

test('支持具名 Stimulus Signal 并按相反顺序释放作用域', async () => {
  const messageSignal = defineSignal<string>({
    name: 'message',
    description: 'Message text',
  });
  const disposed: string[] = [];

  const stimulus = defineStimulus({
    name: 'message-input',
    description: 'Captures messages',
    signals: {
      message: messageSignal,
    },
    setup(ctx) {
      ctx.onDispose(() => {
        disposed.push('stimulus');
      });
    },
  });

  const messageSensu = defineSensu<string>(signal => ({
    name: 'message',
    description: 'Converts message signals into percepts',
    setup(ctx) {
      ctx.onSignal(signal, () => undefined);
      ctx.onDispose(() => {
        disposed.push('sensu');
      });
    },
  }));

  const ciel = defineCiel({
    stimulus: [stimulus],
    sensus: ([signals]) => [messageSensu(signals.message)],
  });

  await ciel.start();
  await ciel.stop();

  expect(disposed).toEqual(['stimulus', 'sensu']);
});
