import type { SensuOutput, SensuOutputReceipt, SensuProcessor, SensuResult } from '#extension';
import type { Engram } from '#model/engram/index.ts';
import type { AnySignal, SignalHandler } from '#model/signal/index.ts';

import type { SignalBus } from './event-bus/index.ts';
import type { ResolvedSensu } from './extensions.ts';
import { cielOperation, CielOperationName } from './instrumentation.ts';
import type { Think } from './types.ts';

function normalizeMany<T>(value: T | readonly T[] | undefined): readonly T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value as T];
}

interface OutputRuntime {
  readonly output: SensuOutput;
  close(): void;
  drain(): Promise<void>;
}

function createOutputRuntime(
  sensu: ResolvedSensu,
  services: { readonly engram: Engram; readonly think: Think },
): OutputRuntime {
  let open = true;
  // Serialize commits so independently produced outputs retain submission order
  let queue = Promise.resolve();
  const commit = sensu.instrument.with(cielOperation(CielOperationName.SensuOutput))(
    async (result: SensuResult): Promise<SensuOutputReceipt> => {
      const percepts = normalizeMany(result.percepts);
      const cues = normalizeMany(result.cues);
      if (percepts.length === 0 && cues.length === 0) {
        throw new TypeError(`Sensu "${sensu.extension.name}" cannot write an empty result`);
      }

      // A Cue must never observe its own batch before the Percepts are committed
      const entries = services.engram.append(...percepts);
      for (const cue of cues) void services.think(cue).catch(() => undefined);
      return { entries, cueCount: cues.length };
    },
  );

  return {
    output: {
      write(result) {
        if (!open) {
          return Promise.reject(new Error(`Sensu "${sensu.extension.name}" output is closed`));
        }
        const written = queue.then(() => commit(result));
        queue = written.then(
          () => undefined,
          () => undefined,
        );
        return written;
      },
    },
    close() {
      open = false;
    },
    drain() {
      return queue;
    },
  };
}

export interface SensuRuntime {
  close(): Promise<void>;
}

export async function installSensu(
  sensu: ResolvedSensu,
  services: {
    readonly engram: Engram;
    readonly signalBus: SignalBus;
    readonly think: Think;
  },
): Promise<SensuRuntime> {
  // Input and output are separate instrumented boundaries by design
  const output = createOutputRuntime(sensu, services);
  const create = sensu.instrument.with(cielOperation(CielOperationName.SensuCreate))(
    sensu.extension.create,
  );
  const processor: SensuProcessor = await create({
    instrument: sensu.instrument,
    output: output.output,
  });
  const write = sensu.instrument.with(cielOperation(CielOperationName.SensuInput))(
    (signal: AnySignal) => processor.write(signal),
  );
  const handler: SignalHandler<typeof sensu.extension.signal> = signal => write(signal);
  const unsubscribe = services.signalBus.onSignal(sensu.extension.signal, handler);

  return {
    async close() {
      const errors: unknown[] = [];
      // Stop new input first while keeping output open for processor flush
      try {
        await unsubscribe();
      } catch (error) {
        errors.push(error);
      }
      const close = sensu.instrument.with(cielOperation(CielOperationName.SensuClose))(() =>
        processor.close(),
      );
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
      try {
        await output.drain();
      } catch (error) {
        errors.push(error);
      } finally {
        output.close();
      }

      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(errors, `Failed to close Sensu "${sensu.extension.name}"`);
      }
    },
  };
}
