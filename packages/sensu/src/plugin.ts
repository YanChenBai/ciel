import { definePlugin, defineSignal, type Signal, type SignalDefinition } from 'corex';

import { Hearing } from './definitions.ts';
import { HearingRuntime } from './hearing/runtime.ts';
import { createSensuProjector } from './projector.ts';
import type { EchoPayload, SensuPluginOptions, SpeechResultPayload } from './types.ts';
import { VisionRuntime } from './vision/runtime.ts';

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

export const sensuPlugin = definePlugin((options: SensuPluginOptions) => {
  assertUniqueSignals(options);
  const projector = createSensuProjector(options.name, options.projector);

  return {
    name: options.name,
    description: options.description,
    projectors: [projector],

    setup(ctx) {
      for (const definition of options.vision?.signals ?? []) {
        const runtime = new VisionRuntime(options.vision);
        ctx.sensu(definition, async signal => {
          const percept = await runtime.process(signal);
          return percept ? { percepts: percept } : undefined;
        });
      }

      const hearing = (options.hearing?.signals ?? []).map(origin => {
        const speech: SignalDefinition<SpeechResultPayload> = defineSignal({
          name: `${origin.name}.speech`,
          description: `由 ${origin.name} 的 VAD 与 ASR 结果形成的内部语音信号。`,
        });
        let runtime: HearingRuntime | undefined;

        ctx.sensu(origin, (signal: Signal<EchoPayload>) => {
          if (!runtime) throw new Error(`Hearing for "${origin.name}" is not running`);
          runtime.process(signal);
        });
        ctx.sensu(speech, signal => ({
          percepts: Hearing.create({
            source: signal,
            temporal: signal.temporal,
            confidence: signal.payload.result.confidence,
            contents: [{ type: 'text', text: signal.payload.result.content }],
          }),
        }));

        return {
          start() {
            runtime = new HearingRuntime({
              asr: options.hearing?.asr,
              emitSignal: ctx.emitSignal,
              instrument: ctx.instrument,
              origin,
              speech,
              onError: error => options.onError?.(error, { capability: 'hearing', signal: origin }),
            });
          },
          async close() {
            const active = runtime;
            runtime = undefined;
            await active?.close();
          },
        };
      });

      ctx.onStart(() => {
        for (const runtime of hearing) runtime.start();
      });
      ctx.onDispose(async () => {
        const results = await Promise.allSettled(
          hearing.toReversed().map(runtime => runtime.close()),
        );
        const errors = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map(result => result.reason);
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, 'Failed to close Sensu hearing');
      });
    },
  };
});
