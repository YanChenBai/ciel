import type { AnyCue, OnCue } from '#model/cue/index.ts';
import { createEngram, createEngramView } from '#model/engram/index.ts';
import type { AnySignal, EmitSignal, SignalHandler } from '#model/signal/index.ts';
import {
  createInstrumenter,
  type Instrument,
  type Interceptor,
} from '#modules/interceptor/index.ts';
import type { AnyNoesis, NoesisProjectRecent, NoesisSetupContext } from '#modules/noesis/index.ts';
import type { AnyProjection, AnyProjector, ProjectorContext } from '#modules/projection/index.ts';
import type { Sensu, SensuInterpret, SensuSetupContext } from '#modules/sensu/index.ts';
import type { AnyStimulus, StimulusSetupContext } from '#modules/stimulus/index.ts';
import { ModuleType } from '#modules/types.ts';
import type { OnDispose } from '#shared/async.ts';

import { createCueBus, createSignalBus } from './event-bus/index.ts';
import { CielOperationName } from './instrumentation.ts';
import {
  createLifecycle,
  createLifecycleScope,
  disposeScopes,
  type LifecycleScope,
} from './lifecycle/index.ts';
import type {
  Ciel,
  DefineCielOptions,
  InstallModulesOptions,
  InstallableCielModule,
  InstallableCielModuleEntry,
  ProjectionRunner,
  ResolvedModules,
  RuntimeServices,
  SetupContextFactory,
  SetupModule,
} from './types.ts';

export type {
  Ciel,
  CielStatus,
  DefineCielOptions,
  InstallableCielModule,
  InstallableCielModuleEntry,
} from './types.ts';
export { CielOperationName };

/**
 * 将 Projection 中的 Projector 预先绑定为可执行函数并接入 Interceptor。 每次投影都会从传入条目创建固定的 EngramView，并行生成按 Projector
 * 名称组织的上下文。
 */
function createProjectionRunner(
  projection: AnyProjection | undefined,
  instrument: Instrument,
): ProjectionRunner {
  const projectors = projection
    ? (Object.entries(projection.projectors) as [string, AnyProjector][]).map(
        ([name, projector]) =>
          [
            name,
            instrument(projector.project, {
              name: CielOperationName.ProjectorProject,
              metadata: {
                projectionId: projection.id,
                projectionName: projection.name,
                projectorId: projector.id,
                projectorName: projector.name,
                projectorKey: name,
              },
            }),
          ] as const,
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

function normalizeMany<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value as T];
}

const createSensuSetupContext: SetupContextFactory<Sensu, SensuSetupContext> = ({
  module,
  scope,
  services,
}) => {
  const { emitCue, engram, instrument, signalBus } = services;

  const interpret: SensuInterpret = (definition, interpreter) => {
    const runInterpreter = instrument(interpreter, {
      name: CielOperationName.SensuInterpret,
      metadata: {
        moduleId: module.id,
        moduleName: module.name,
        signalDefinitionId: definition.id,
        signalDefinitionName: definition.name,
      },
    });

    const handleSignal: SignalHandler<typeof definition> = async signal => {
      const interpretation = await runInterpreter(signal);

      if (!interpretation) {
        return;
      }

      engram.append(...normalizeMany(interpretation.percepts));

      for (const cue of normalizeMany(interpretation.cues)) {
        await emitCue(cue);
      }
    };

    const dispose = signalBus.onSignal(definition, handleSignal);
    scope.onDispose(dispose);

    return dispose;
  };

  const onDispose: OnDispose = dispose => scope.onDispose(dispose);
  return { interpret, onDispose };
};

const createStimulusSetupContext: SetupContextFactory<AnyStimulus, StimulusSetupContext> = ({
  module,
  scope,
  services,
}) => {
  const { instrument, signalBus } = services;

  function emitSignal(signal: AnySignal): Promise<void> {
    return signalBus.emitSignal(signal);
  }

  const instrumentedEmitSignal: EmitSignal = instrument(emitSignal, {
    name: CielOperationName.SignalEmit,
    metadata: {
      moduleId: module.id,
      moduleName: module.name,
    },
  });
  const onDispose: OnDispose = dispose => scope.onDispose(dispose);
  return { emitSignal: instrumentedEmitSignal, onDispose };
};

const createNoesisSetupContext: SetupContextFactory<AnyNoesis, NoesisSetupContext<any>> = ({
  module,
  scope,
  services,
}) => {
  const { cueBus, engram, instrument, projectionRegistry } = services;
  const requestedProjection = module.projection;
  const projection = requestedProjection
    ? projectionRegistry.get(requestedProjection.id)
    : undefined;

  if (requestedProjection && !projection) {
    throw new Error(`Projection "${requestedProjection.name}" is not registered in this Ciel`);
  }

  const project = createProjectionRunner(projection, instrument);
  const projectRecent: NoesisProjectRecent<any> = durationMs => project(engram.recent(durationMs));
  const onCue: OnCue = (cue, handler) => {
    const dispose = cueBus.onCue(
      cue,
      instrument(handler, {
        name: CielOperationName.CueHandle,
        metadata: {
          cueDefinitionId: cue.id,
          cueDefinitionName: cue.name,
          moduleId: module.id,
          moduleName: module.name,
        },
      }),
    );
    scope.onDispose(dispose);
    return dispose;
  };
  const onDispose: OnDispose = dispose => scope.onDispose(dispose);
  return { engram, project, projectRecent, onCue, onDispose };
};

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

async function installModules<TContext, TModule extends SetupModule<TContext>>(
  options: InstallModulesOptions<TModule, TContext>,
): Promise<void> {
  const { createContext, modules, services, setupOperationName } = options;

  for (const module of modules) {
    const scope = createLifecycleScope();
    services.scopes.push(scope);

    const ctx = createContext({ module, scope, services });
    await services.instrument(module.setup, {
      name: setupOperationName,
      metadata: {
        moduleId: module.id,
        moduleName: module.name,
        moduleType: module.type,
      },
    })(ctx);
  }
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
  const signalBus = createSignalBus();
  const scopes: LifecycleScope[] = [];

  function emitCue(cue: AnyCue): Promise<void> {
    return cueBus.emitCue(cue);
  }

  const instrumentedEmitCue = instrument(emitCue, {
    name: CielOperationName.CueEmit,
  });
  const services: RuntimeServices = {
    cueBus,
    emitCue: instrumentedEmitCue,
    engram,
    instrument,
    projectionRegistry,
    scopes,
    signalBus,
  };

  const lifecycle = createLifecycle({
    name: 'Ciel',
    async setup() {
      await installModules({
        createContext: createSensuSetupContext,
        modules: sensuModules,
        services,
        setupOperationName: CielOperationName.SensuSetup,
      });
      await installModules({
        createContext: createNoesisSetupContext,
        modules: noesisModules,
        services,
        setupOperationName: CielOperationName.NoesisSetup,
      });
      await installModules({
        createContext: createStimulusSetupContext,
        modules: stimulusModules,
        services,
        setupOperationName: CielOperationName.StimulusSetup,
      });
    },
    dispose: () => disposeScopes(scopes),
  });

  return {
    get status() {
      return lifecycle.status;
    },
    engram,
    emitCue: instrumentedEmitCue,
    start: () => lifecycle.start(),
    stop: () => lifecycle.stop(),
  };
}
