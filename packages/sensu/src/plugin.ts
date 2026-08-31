import {
  definePlugin,
  defineSensu,
  type PluginCreateContext,
  type SensuCreateContext,
  type SensuOutput,
  type Signal,
} from 'corex';

import { Hearing, SpeechEnded } from './definitions.ts';
import { HearingRuntime } from './hearing/runtime.ts';
import { createSensuProjector } from './projector.ts';
import type {
  EchoDefinition,
  EchoPayload,
  HearingOptions,
  PhotonDefinition,
  PhotonPayload,
  SensuPluginOptions,
  SpeechSegment,
  VisionOptions,
} from './types.ts';
import { VisionRuntime } from './vision/runtime.ts';

interface VisionSensuOptions {
  readonly definition: PhotonDefinition;
  readonly vision: VisionOptions;
}

interface HearingSensuOptions {
  readonly definition: EchoDefinition;
  readonly hearing: HearingOptions;
  readonly onError?: (error: Error) => void;
}

function assertUniqueSignals(options: SensuPluginOptions): void {
  const ids = new Set<string>();
  for (const signal of [...(options.vision?.signals ?? []), ...(options.hearing?.signals ?? [])]) {
    if (ids.has(signal.id)) {
      throw new Error(`Sensu signal "${signal.name}" is declared more than once`);
    }
    ids.add(signal.id);
  }
  if (ids.size === 0) throw new Error('Sensu requires at least one visual or auditory signal');
}

async function writeSpeechSegment(output: SensuOutput, segment: SpeechSegment): Promise<unknown> {
  const temporal = {
    kind: 'interval',
    start: segment.startAt.getTime(),
    end: segment.endAt.getTime(),
  } as const;
  const result = segment.result;
  const percept = result
    ? Hearing.create({
        origin: segment.origin,
        temporal,
        confidence: result.confidence,
        contents: [
          {
            type: 'text',
            text: `${result.speaker ? `[${result.speaker}] ` : ''}${result.content}`,
          },
        ],
      })
    : undefined;

  return output.write({
    ...(percept ? { percepts: percept } : {}),
    cues: SpeechEnded.create(temporal, {
      origin: segment.origin,
      ...(result ? { result } : {}),
    }),
  });
}

const createVisionSensu = defineSensu((options: VisionSensuOptions) => ({
  name: `${options.definition.name}.vision`,
  description: `将 ${options.definition.name} 的变化画面转换为视觉感知。`,
  signal: options.definition,
  create({ output }: SensuCreateContext) {
    const runtime = new VisionRuntime(options.vision);
    return {
      async write(signal: Signal<PhotonPayload>) {
        const percept = await runtime.process(signal);
        if (percept) await output.write({ percepts: percept });
      },
      close: () => runtime.close(),
    };
  },
}));

const createHearingSensu = defineSensu((options: HearingSensuOptions) => ({
  name: `${options.definition.name}.hearing`,
  description: `将 ${options.definition.name} 的音频流转换为听觉感知与语音结束线索。`,
  signal: options.definition,
  create({ instrument, output }: SensuCreateContext) {
    const runtime = new HearingRuntime({
      asr: options.hearing.asr,
      instrument,
      origin: options.definition,
      onError: options.onError,
      onSegment: segment => writeSpeechSegment(output, segment),
    });
    return {
      write: (signal: Signal<EchoPayload>) => runtime.process(signal),
      close: () => runtime.close(),
    };
  },
}));

export const sensuPlugin = definePlugin((options: SensuPluginOptions) => {
  assertUniqueSignals(options);
  const projector = createSensuProjector(options.name, options.projector);

  return {
    name: options.name,
    description: options.description,
    create(_context: PluginCreateContext) {
      return {
        extensions: [
          projector,
          ...(options.vision?.signals.map(definition =>
            createVisionSensu({ definition, vision: options.vision! }),
          ) ?? []),
          ...(options.hearing?.signals.map(definition =>
            createHearingSensu({
              definition,
              hearing: options.hearing!,
              onError: error =>
                options.onError?.(error, { capability: 'hearing', signal: definition }),
            }),
          ) ?? []),
        ],
      };
    },
  };
});
