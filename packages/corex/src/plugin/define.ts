import type { LLMContext } from '#model/llm/index.ts';
import type { AnySignalDefinition } from '#model/signal/index.ts';
import { createId } from '#shared/id.ts';

import type { DefineProjectorOptions, Projector } from './projector.ts';
import type { DefineSensuOptions, EmptySensuFactory, SensuFactory } from './sensu.ts';
import type { CielPlugin, EmptyPluginFactory, PluginFactory } from './types.ts';

export function definePlugin(define: () => Omit<CielPlugin, 'id'>): EmptyPluginFactory;
export function definePlugin<TOptions>(
  define: (options: TOptions) => Omit<CielPlugin, 'id'>,
): PluginFactory<TOptions>;
export function definePlugin<TOptions>(
  define: (options?: TOptions) => Omit<CielPlugin, 'id'>,
): PluginFactory<TOptions | undefined> {
  return options => ({ ...define(options), id: createId() });
}

export function defineSensu<TDefinition extends AnySignalDefinition>(
  define: () => DefineSensuOptions<TDefinition>,
): EmptySensuFactory<TDefinition>;
export function defineSensu<TOptions, TDefinition extends AnySignalDefinition>(
  define: (options: TOptions) => DefineSensuOptions<TDefinition>,
): SensuFactory<TOptions, TDefinition>;
export function defineSensu<TOptions, TDefinition extends AnySignalDefinition>(
  define: (options?: TOptions) => DefineSensuOptions<TDefinition>,
): SensuFactory<TOptions | undefined, TDefinition> {
  return options => ({ ...define(options), id: createId() });
}

export function defineProjector<TResult extends LLMContext>(
  options: DefineProjectorOptions<TResult>,
): Projector<TResult> {
  return { ...options, id: createId() };
}
