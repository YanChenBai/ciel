import { definePercept, defineSignal, type DefineSignalOptions } from 'corex';

import type { EchoDefinition, EchoPayload, PhotonDefinition, PhotonPayload } from './types.ts';

export const Sight = definePercept({
  name: 'sight',
  description: '经视觉采样与变化检测保留的画面。',
});

export const Hearing = definePercept({
  name: 'hearing',
  description: '经 VAD、ASR 与说话人识别形成的听觉文本。',
});

export function definePhoton(options: DefineSignalOptions): PhotonDefinition {
  return defineSignal<PhotonPayload>(options);
}

export function defineEcho(options: DefineSignalOptions): EchoDefinition {
  return defineSignal<EchoPayload>(options);
}
