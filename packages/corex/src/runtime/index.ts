import type { AnyCue } from '#model/cue/index.ts';
import { createEngram, createEngramView, type EngramEntry } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { Percept } from '#model/percept/index.ts';
import type { AnySignal } from '#model/signal/index.ts';
import {
  createInstrumenter,
  type Instrument,
  type Interceptor,
} from '#modules/interceptor/index.ts';
import type { AnyNoesis, NoesisSetupContext } from '#modules/noesis/index.ts';
import type { AnyProjection, AnyProjector, ProjectorContext } from '#modules/projection/index.ts';
import type { Sensu, SensuSetupContext } from '#modules/sensu/index.ts';
import type { AnyStimulus, StimulusSetupContext } from '#modules/stimulus/index.ts';
import { ModuleType } from '#modules/types.ts';

import { createCueBus, createPerceptBus, createSignalBus } from './event-bus/index.ts';
import {
  createLifecycle,
  createLifecycleScope,
  disposeScopes,
  type LifecycleScope,
} from './lifecycle/index.ts';
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

  readonly projectionModules: AnyProjection[];
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
  const projectionModules: AnyProjection[] = [];

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
        case ModuleType.Projection:
          projectionModules.push(module);
          break;
        case ModuleType.Stimulus:
          stimulusModules.push(module);
          break;
      }
    }
  }

  return {
    interceptorModules,
    stimulusModules,
    sensuModules,
    noesisModules,
    projectionModules,
  };
}

async function installModules<T>(modules: T[], install: (module: T) => Promise<void>) {
  for (const module of modules) {
    await install(module);
  }
}

type ProjectionRunner = (
  entries: readonly EngramEntry[],
) => Promise<Readonly<Record<string, LLMContext>>>;

function createProjectionRunner(
  projection: AnyProjection | undefined,
  instrument: Instrument,
): ProjectionRunner {
  const projectors = projection
    ? (Object.entries(projection.projectors) as [string, AnyProjector][]).map(
        ([name, projector]) => [name, instrument(projector.project)] as const,
      )
    : [];

  return async entries => {
    const ctx: ProjectorContext = {
      engram: createEngramView(entries),
    };
    const results = await Promise.all(
      projectors.map(async ([name, project]) => [name, await project(ctx)] as const),
    );

    return Object.fromEntries(results);
  };
}

export function defineCiel(options: DefineCielOptions): Ciel {
  const { interceptorModules, stimulusModules, sensuModules, noesisModules, projectionModules } =
    collectModules(options.modules);

  const instrument = createInstrumenter(interceptorModules);
  const projectionRegistry = new Map(
    projectionModules.map(projection => [projection.id, projection] as const),
  );
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
    const requestedProjection = module.projection;
    const projection = requestedProjection
      ? projectionRegistry.get(requestedProjection.id)
      : undefined;

    if (requestedProjection && !projection) {
      throw new Error(`Projection "${requestedProjection.name}" is not registered in this Ciel`);
    }

    const ctx: NoesisSetupContext<any> = {
      engram,
      project: createProjectionRunner(projection, instrument),
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
