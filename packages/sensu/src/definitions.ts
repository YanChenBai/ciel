import { defineCue, definePercept, defineSignal, type DefineSignalOptions } from 'corex';

import type {
  EchoDefinition,
  EchoPayload,
  PhotonDefinition,
  PhotonPayload,
  SpeechEndedPayload,
} from './types.ts';

export const Sight = definePercept({
  name: 'sight',
  description: '经视觉采样与变化检测保留的画面。',
});

export const Hearing = definePercept({
  name: 'hearing',
  description: '经 VAD、ASR 与说话人识别形成的听觉文本。',
});

export const SpeechEnded = defineCue<SpeechEndedPayload>({
  name: 'speech-ended',
  description: 'VAD 检测到一段语音结束。',
  prompt: '一段语音刚刚结束，请结合最新听觉上下文作出判断。',
});

export function definePhoton(options: DefineSignalOptions): PhotonDefinition {
  return defineSignal<PhotonPayload>(options);
}

export function defineEcho(options: DefineSignalOptions): EchoDefinition {
  return defineSignal<EchoPayload>(options);
}
