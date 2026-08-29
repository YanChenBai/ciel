import type { EmitCue } from '#model/cue/index.ts';
import type { Engram, EngramEntry } from '#model/engram/index.ts';
import type { LLMContext } from '#model/llm/index.ts';
import type { Instrument, Interceptor } from '#modules/interceptor/index.ts';
import type { AnyNoesis } from '#modules/noesis/index.ts';
import type { AnyProjection } from '#modules/projection/index.ts';
import type { Sensu } from '#modules/sensu/index.ts';
import type { AnyStimulus } from '#modules/stimulus/index.ts';
import type { CielModule } from '#modules/types.ts';
import type { MaybePromise } from '#shared/async.ts';

import type { CueBus, SignalBus } from './event-bus/index.ts';
import type { CielOperationName } from './instrumentation.ts';
import type { LifecycleScope, LifecycleStatus } from './lifecycle/index.ts';

export interface RuntimeServices {
  readonly cueBus: CueBus;
  readonly emitCue: EmitCue;
  readonly engram: Engram;
  readonly instrument: Instrument;
  readonly projectionRegistry: ReadonlyMap<string, AnyProjection>;
  readonly scopes: LifecycleScope[];
  readonly signalBus: SignalBus;
}

export interface SetupModule<TContext> extends CielModule {
  setup(this: void, ctx: TContext): MaybePromise<void>;
}

export interface CreateSetupContextOptions<TModule> {
  readonly module: TModule;
  readonly scope: LifecycleScope;
  readonly services: RuntimeServices;
}

export type SetupContextFactory<TModule, TContext> = (
  options: CreateSetupContextOptions<TModule>,
) => TContext;

export interface InstallModulesOptions<TModule, TContext> {
  readonly createContext: SetupContextFactory<TModule, TContext>;
  readonly modules: TModule[];
  readonly services: RuntimeServices;
  readonly setupOperationName: CielOperationName;
}

export type ProjectionRunner = (
  entries: readonly EngramEntry[],
) => Promise<Readonly<Record<string, LLMContext>>>;

export interface ResolvedModules {
  readonly interceptorModules: Interceptor[];
  readonly stimulusModules: AnyStimulus[];
  readonly sensuModules: Sensu[];
  readonly noesisModules: AnyNoesis[];
  readonly projectionModules: AnyProjection[];
}

export type InstallableCielModule = AnyStimulus | Sensu | AnyNoesis | AnyProjection | Interceptor;

export type InstallableCielModuleEntry = InstallableCielModule | readonly InstallableCielModule[];

export interface DefineCielOptions {
  readonly modules: readonly InstallableCielModuleEntry[];
}

export type CielStatus = LifecycleStatus;

export interface Ciel {
  readonly engram: Engram;

  readonly status: CielStatus;

  /**
   * 从 Ciel 外部手动派发认知线索
   */
  readonly emitCue: EmitCue;

  start(): Promise<void>;

  stop(): Promise<void>;
}
