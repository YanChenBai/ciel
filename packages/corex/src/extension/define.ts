import type { Interceptor } from '@cieljs/instrument';

import type { LLMContext } from '#model/llm/index.ts';
import type { AnySignalDefinition } from '#model/signal/index.ts';
import { createId } from '#shared/id.ts';
import type { CielMetadata } from '#shared/metadata.ts';

import type {
  DefineProjectorOptions,
  DefineSensuOptions,
  EmptyPluginFactory,
  EmptySensuFactory,
  InterceptorExtension,
  PluginFactory,
  PluginOptions,
  ProjectorExtension,
  SensuFactory,
} from './types.ts';

export function definePlugin(define: () => PluginOptions): EmptyPluginFactory;
export function definePlugin<TOptions>(
  define: (options: TOptions) => PluginOptions,
): PluginFactory<TOptions>;
export function definePlugin<TOptions>(
  define: (options?: TOptions) => PluginOptions,
): PluginFactory<TOptions | undefined> {
  return options => ({
    ...define(options),
    id: createId(),
    kind: 'plugin',
  });
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
  return options => ({
    ...define(options),
    id: createId(),
    kind: 'sensu',
  });
}

export function defineProjector<TResult extends LLMContext>(
  options: DefineProjectorOptions<TResult>,
): ProjectorExtension<TResult> {
  return {
    ...options,
    id: createId(),
    kind: 'projector',
  };
}

export function defineInterceptor(
  options: CielMetadata & { readonly interceptor: Interceptor },
): InterceptorExtension {
  return {
    ...options,
    id: createId(),
    kind: 'interceptor',
  };
}
