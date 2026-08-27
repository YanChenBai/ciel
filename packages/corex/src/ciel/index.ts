import type { AnyCue } from '../cue/index.ts';
import { createEngram } from '../engram/index.ts';
import { createInstrumenter, type Interceptor } from '../interceptor/index.ts';
import type { AnyNoesis, NoesisSetupContext } from '../noesis/index.ts';
import type { Percept } from '../percept/index.ts';
import type { Sensu, SensuSetupContext } from '../sensu/index.ts';
import type { AnySignal } from '../signal/index.ts';
import type { AnyStimulus, StimulusSetupContext } from '../stimulus/index.ts';
import { ModuleType } from '../types/index.ts';
import { createCueBus, createPerceptBus, createSignalBus } from './event-bus/index.ts';
import {
  createLifecycle,
  createLifecycleScope,
  disposeScopes,
  type LifecycleScope,
} from './lifecycle.ts';
import type {
  Ciel,
  DefineCielOptions,
  InstallableCielModule,
  InstallableCielModuleEntry,
} from './types.ts';

export type {
  Ciel,
  CielStatus,
  DefineCielOptions,
  InstallableCielModule,
  InstallableCielModuleEntry,
} from './types.ts';

interface ResolvedModules {
  readonly interceptorModules: Interceptor[];

  readonly stimulusModules: AnyStimulus[];

  readonly sensuModules: Sensu[];

  readonly noesisModules: AnyNoesis[];
}

function isModuleGroup(
  entry: InstallableCielModuleEntry,
): entry is readonly InstallableCielModule[] {
  return Array.isArray(entry);
}

function collectModules(entries: readonly InstallableCielModuleEntry[]): ResolvedModules {
  const interceptorModules: Interceptor[] = [];
  const stimulusModules: AnyStimulus[] = [];
  const sensuModules: Sensu[] = [];
  const noesisModules: AnyNoesis[] = [];

  for (const entry of entries) {
    const modules = isModuleGroup(entry) ? entry : [entry];

    for (const module of modules) {
      switch (module.type) {
        case ModuleType.Interceptor:
          interceptorModules.push(module);
          break;
        case ModuleType.Sensu:
          sensuModules.push(module);
          break;
        case ModuleType.Noesis:
          noesisModules.push(module);
          break;
        case ModuleType.Stimulus:
          stimulusModules.push(module);
          break;
      }
    }
  }

  return { interceptorModules, stimulusModules, sensuModules, noesisModules };
}

async function installModules<T>(modules: T[], install: (module: T) => Promise<void>) {
  for (const module of modules) {
    await install(module);
  }
}

export function defineCiel(options: DefineCielOptions): Ciel {
  const { interceptorModules, stimulusModules, sensuModules, noesisModules } = collectModules(
    options.modules,
  );

  const instrument = createInstrumenter(interceptorModules);
  const engram = createEngram({ windowMs: 1000 * 60 * 5 });
  const cueBus = createCueBus();
  const perceptBus = createPerceptBus();
  const signalBus = createSignalBus();
  const scopes: LifecycleScope[] = [];

  const emitCue = instrument(function emitCue(cue: AnyCue): Promise<void> {
    return cueBus.emitCue(cue);
  });

  const installEngram = (): void => {
    const scope = createLifecycleScope();
    scope.onDispose(
      perceptBus.onAnyPercept(percept => {
        engram.append(percept);
      }),
    );
    scopes.push(scope);
  };

  const installSensu = async (module: Sensu): Promise<void> => {
    const scope = createLifecycleScope();
    const emitPercept = instrument(function emitPercept(percept: Percept) {
      return perceptBus.emitPercept(percept);
    });
    const ctx: SensuSetupContext = {
      emitCue,
      emitPercept,
      onSignal(signal, handler) {
        const dispose = signalBus.onSignal(signal, instrument(handler));
        scope.onDispose(dispose);
        return dispose;
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await instrument(module.setup)(ctx);
  };

  const installStimulus = async (module: AnyStimulus): Promise<void> => {
    const scope = createLifecycleScope();
    const emitSignal = instrument(function emitSignal(signal: AnySignal) {
      return signalBus.emitSignal(signal);
    });
    const ctx: StimulusSetupContext = {
      emitSignal,
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await instrument(module.setup)(ctx);
  };

  const installNoesis = async (module: AnyNoesis): Promise<void> => {
    const scope = createLifecycleScope();
    const ctx: NoesisSetupContext = {
      engram,
      onCue(cue, handler) {
        const dispose = cueBus.onCue(cue, instrument(handler));
        scope.onDispose(dispose);
        return dispose;
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await instrument(module.setup)(ctx);
  };

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      // Engram 必须优先注册，避免后续模块在 setup 阶段发出的 Percept 漏记
      installEngram();
      await installModules(sensuModules, installSensu);
      await installModules(noesisModules, installNoesis);
      await installModules(stimulusModules, installStimulus);
    },
    dispose: () => disposeScopes(scopes),
  });

  return {
    get status() {
      return lifecycle.status;
    },
    engram,
    emitCue,
    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
  };
}
