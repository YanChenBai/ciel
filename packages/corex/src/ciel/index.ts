import type { AnyCue } from '../cue/index.ts';
import { createEngram } from '../engram/index.ts';
import type { AnyNoesis, NoesisSetupContext } from '../noesis/index.ts';
import { observe } from '../observe/index.ts';
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
import type { Ciel, DefineCielOptions, InstallableCielModule } from './types.ts';

export type { Ciel, CielStatus, DefineCielOptions, InstallableCielModule } from './types.ts';

interface ResolvedModules {
  readonly stimulusModules: AnyStimulus[];

  readonly sensuModules: Sensu[];

  readonly noesisModules: AnyNoesis[];
}

function collectModules(modules: readonly InstallableCielModule[]): ResolvedModules {
  const stimulusModules: AnyStimulus[] = [];
  const sensuModules: Sensu[] = [];
  const noesisModules: AnyNoesis[] = [];

  for (const module of modules) {
    if (module.type === ModuleType.Sensu) {
      sensuModules.push(module);
    } else if (module.type === ModuleType.Noesis) {
      noesisModules.push(module);
    } else if (module.type === ModuleType.Stimulus) {
      stimulusModules.push(module);
    }
  }

  return { stimulusModules, sensuModules, noesisModules };
}

async function installModules<T>(modules: T[], install: (module: T) => Promise<void>) {
  for (const module of modules) {
    await install(module);
  }
}

export function defineCiel(options: DefineCielOptions): Ciel {
  const { stimulusModules, sensuModules, noesisModules } = collectModules(options.modules);

  const engram = createEngram({ windowMs: 1000 * 60 * 5 });
  const cueBus = createCueBus();
  const perceptBus = createPerceptBus();
  const signalBus = createSignalBus();
  const scopes: LifecycleScope[] = [];

  const emitCue = observe(function emitCue(cue: AnyCue): Promise<void> {
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
    const emitPercept = observe(function emitPercept(percept: Percept) {
      return perceptBus.emitPercept(percept);
    });
    const ctx: SensuSetupContext = {
      emitCue,
      emitPercept,
      onSignal(signal, handler) {
        const dispose = signalBus.onSignal(signal, observe(handler));
        scope.onDispose(dispose);
        return dispose;
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await observe(module.setup)(ctx);
  };

  const installStimulus = async (module: AnyStimulus): Promise<void> => {
    const scope = createLifecycleScope();
    const emitSignal = observe(function emitSignal(signal: AnySignal) {
      return signalBus.emitSignal(signal);
    });
    const ctx: StimulusSetupContext = {
      emitSignal,
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await observe(module.setup)(ctx);
  };

  const installNoesis = async (module: AnyNoesis): Promise<void> => {
    const scope = createLifecycleScope();
    const ctx: NoesisSetupContext = {
      engram,
      onCue(cue, handler) {
        const dispose = cueBus.onCue(cue, observe(handler));
        scope.onDispose(dispose);
        return dispose;
      },
      onDispose: dispose => scope.onDispose(dispose),
    };

    scopes.push(scope);
    await observe(module.setup)(ctx);
  };

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      // Engram 必须最先订阅, 确保其他 Percept 监听器运行前已经完成记录
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
