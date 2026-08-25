import { CIEL_SYMBOL } from '../identity.ts';
import type { Percept } from '../percept/index.ts';
import type { SensuOutput, SensuSetupContext } from '../sensu/index.ts';
import type { AnySignalDefinition } from '../signal/index.ts';
import type { SignalDefinitions, StimulusSetupContext } from '../stimulus/index.ts';
import {
  createLifecycle,
  createLifecycleScope,
  disposeScopes,
  type LifecycleScope,
} from './lifecycle.ts';
import { createSignalBus } from './signal-bus.ts';
import type { AnySensu, AnyStimulus, Ciel, DefineCielOptions, SignalsOfStimuli } from './types.ts';

export type { Ciel, CielStatus, DefineCielOptions, SensuResolver } from './types.ts';

function signalDefinitionsOf(signals: SignalDefinitions): readonly AnySignalDefinition[] {
  return Array.isArray(signals) ? signals : Object.values(signals);
}

function acceptPercepts(percepts: Percept[], output: SensuOutput): void {
  if (output === undefined) {
    return;
  }

  if (Array.isArray(output)) {
    percepts.push(...output);
    return;
  }

  percepts.push(output as Percept);
}

export function defineCiel<
  const TStimuli extends readonly AnyStimulus[],
  const TSensus extends readonly AnySensu[],
  TNucleus = unknown,
>(options: DefineCielOptions<TStimuli, TSensus, TNucleus>): Ciel<TNucleus> {
  const stimulusSignals = options.stimulus.map(
    stimulus => stimulus.signals,
  ) as SignalsOfStimuli<TStimuli>;
  const sensus = options.sensus(stimulusSignals);
  const percepts: Percept[] = [];
  const bus = createSignalBus(output => acceptPercepts(percepts, output));
  const scopes: LifecycleScope[] = [];

  const installSensu = async (definition: AnySensu): Promise<void> => {
    const scope = createLifecycleScope();
    const allowedSignals = new Set<AnySignalDefinition>(definition.signals);
    const ctx: SensuSetupContext<any> = {
      signals: definition.signals,
      onSignal(signal, handler) {
        if (!allowedSignals.has(signal)) {
          throw new Error('Sensu cannot subscribe to an undeclared Signal definition');
        }

        const dispose = bus.on(signal, handler);
        scope.onDispose(dispose);
        return dispose;
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await definition.setup(ctx);
  };

  const installStimulus = async (definition: AnyStimulus): Promise<void> => {
    const scope = createLifecycleScope();
    const allowedSignals = new Set(signalDefinitionsOf(definition.signals));
    const ctx: StimulusSetupContext<any> = {
      signals: definition.signals,
      async emitSignal(signal) {
        if (!allowedSignals.has(signal.definition)) {
          throw new Error('Stimulus cannot emit an undeclared Signal definition');
        }
        await bus.emit(signal);
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await definition.setup(ctx);
  };

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      for (const definition of sensus) {
        await installSensu(definition);
      }
      for (const definition of options.stimulus) {
        await installStimulus(definition);
      }
    },
    dispose: () => disposeScopes(scopes),
  });

  return {
    [CIEL_SYMBOL]: true,
    nucleus: options.nucleus,

    get percepts() {
      return percepts;
    },

    get status() {
      return lifecycle.status;
    },

    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
  };
}
