import type { ASROptions } from '@ciels/asr';
import { EventHost } from '@ciels/event';

import { Auris } from '#src/auris/index.ts';
import { DEFAULT_OCULUS_OUTPUT_DIR } from '#src/constants/index.ts';
import { Oculus } from '#src/oculus/index.ts';
import type { Hearing, Sight } from '#src/perceptions/index.ts';
import { Echo, Photon, Script } from '#src/signals/index.ts';
import type { Signal, SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

export interface CielOptions {
  auris?: ASROptions;
  oculus?: {
    sampleInterval?: number;
    outputDir?: string;
  };
}

export interface CielEventMap {
  hearing(data: Hearing): void;
  sight(data: Sight): void;
  script(data: Script): void;
  error(error: Error): void;
}

interface SignalProcessor {
  observe(signal: Signal): void | Promise<void>;
  flush?(): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

interface StimulusBinding {
  stimulus: Stimulus;
  processors: Map<SignalConstructor, QueuedProcessor>;
  unsubscribers: (() => void)[];
  started: boolean;
}

type CielState = 'idle' | 'starting' | 'running' | 'stopping';

class QueuedProcessor {
  // Stateful processors must observe each signal in source order, even when observe is async.
  private queue = Promise.resolve();

  constructor(
    private readonly processor: SignalProcessor,
    private readonly handleError: (error: Error) => void,
  ) {}

  enqueue(signal: Signal): Promise<void> {
    this.queue = this.queue
      .then(() => this.processor.observe(signal))
      .catch(error => this.handleError(toError(error)));
    return this.queue;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.processor.flush?.();
    await this.processor.dispose?.();
  }
}

export class Ciel extends EventHost<CielEventMap> {
  private readonly options: CielOptions;
  private readonly stimuli: Stimulus[] = [];
  private bindings: StimulusBinding[] = [];
  private state: CielState = 'idle';

  constructor(options: CielOptions = {}) {
    super();
    this.options = options;
  }

  use(stimulus: Stimulus): this {
    if (this.state !== 'idle') throw new Error('Cannot add a stimulus while Ciel is active');
    if (this.stimuli.includes(stimulus)) throw new Error('Stimulus is already registered');
    this.stimuli.push(stimulus);
    return this;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error('Ciel has already started');
    this.state = 'starting';

    try {
      // Prepare every processor and subscribe before a stimulus can synchronously emit in start().
      this.bindings = this.stimuli.map(stimulus => this.createBinding(stimulus));
      this.bindings.forEach(binding => this.subscribe(binding));

      for (const binding of this.bindings) {
        binding.started = true;
        await binding.stimulus.start();
      }
      this.state = 'running';
    } catch (error) {
      await this.teardown();
      this.state = 'idle';
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') throw new Error('Ciel is not running');
    this.state = 'stopping';
    const errors = await this.teardown();
    this.state = 'idle';
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to stop Ciel cleanly');
  }

  private createBinding(stimulus: Stimulus): StimulusBinding {
    // The map belongs to one Stimulus instance, so two sources never share processor state.
    const processors = new Map<SignalConstructor, QueuedProcessor>();
    for (const Signal of stimulus.signals) {
      if (processors.has(Signal)) {
        throw new Error(Signal.name + ' is declared more than once by a stimulus');
      }
      processors.set(
        Signal,
        new QueuedProcessor(this.createProcessor(Signal), error => this.emit('error', error)),
      );
    }
    return { stimulus, processors, unsubscribers: [], started: false };
  }

  private createProcessor(Signal: SignalConstructor): SignalProcessor {
    if (Signal === Echo || Signal.prototype instanceof Echo) {
      const auris = new Auris({
        ...this.options.auris,
        signal: Signal as typeof Echo,
      });
      const unsubscribers = [
        auris.on('hearing', hearing => this.emit('hearing', hearing)),
        auris.on('error', error => this.emit('error', error)),
      ];
      return {
        observe: signal => auris.observe(signal as Echo),
        flush: () => auris.flush(),
        dispose: () => unsubscribers.forEach(unsubscribe => unsubscribe()),
      };
    }

    if (Signal === Photon || Signal.prototype instanceof Photon) {
      const oculus = new Oculus({
        signal: Signal as typeof Photon,
        sampleInterval: this.options.oculus?.sampleInterval ?? 1_000,
        outputDir: this.options.oculus?.outputDir ?? DEFAULT_OCULUS_OUTPUT_DIR,
      });
      const unsubscribers = [oculus.on('sight', sight => this.emit('sight', sight))];
      return {
        observe: signal => oculus.observe(signal as Photon),
        dispose: () => unsubscribers.forEach(unsubscribe => unsubscribe()),
      };
    }

    if (Signal === Script || Signal.prototype instanceof Script) {
      return {
        observe: signal => this.emit('script', signal as Script),
      };
    }

    throw new Error('No processor registered for signal ' + Signal.name);
  }

  private subscribe(binding: StimulusBinding): void {
    binding.unsubscribers.push(
      binding.stimulus.on('echo', signal => this.dispatch(binding, signal)),
      binding.stimulus.on('photon', signal => this.dispatch(binding, signal)),
      binding.stimulus.on('script', signal => this.dispatch(binding, signal)),
    );
  }

  private dispatch(binding: StimulusBinding, signal: Signal): Promise<void> {
    const Signal = signal.constructor as SignalConstructor;
    const processor = binding.processors.get(Signal);
    if (!processor) {
      this.emit('error', new Error(Signal.name + ' is not declared in stimulus.signals'));
      return Promise.resolve();
    }
    return processor.enqueue(signal);
  }

  private async teardown(): Promise<Error[]> {
    const errors: Error[] = [];
    // Keep subscriptions alive during stop(), then drain queued events before flushing processors.
    for (const binding of [...this.bindings].reverse()) {
      if (!binding.started) continue;
      try {
        await binding.stimulus.stop();
      } catch (error) {
        errors.push(toError(error));
      }
    }

    this.bindings.forEach(binding => {
      binding.unsubscribers.forEach(unsubscribe => unsubscribe());
    });

    for (const binding of this.bindings) {
      for (const processor of binding.processors.values()) {
        try {
          await processor.close();
        } catch (error) {
          errors.push(toError(error));
        }
      }
    }
    this.bindings = [];
    errors.forEach(error => this.emit('error', error));
    return errors;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
