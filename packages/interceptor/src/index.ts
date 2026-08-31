import type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InstrumentPreset,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InstrumentPreset,
  Interceptor,
  InterceptorWrapper,
} from './types.ts';

/**
 * 为一组 interceptor 创建相互隔离的 instrumenter
 */
export function createInstrumenter(interceptors: readonly Interceptor[]): Instrument {
  return createInstrument(interceptors);
}

function mergeContext(
  preset: InstrumentPreset | undefined,
  context: InstrumentContext | undefined,
): InstrumentContext | undefined {
  if (!preset) return context;
  if (preset.name !== undefined && context?.name !== undefined && preset.name !== context.name) {
    throw new TypeError(
      `Instrument name "${preset.name}" cannot be overridden with "${context.name}"`,
    );
  }

  const name = preset.name ?? context?.name;
  if (name === undefined) return undefined;

  // Preset fields represent trusted owner identity and win over call-site fields
  const metadata = {
    ...context?.metadata,
    ...preset.metadata,
  };

  return {
    name,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function mergePreset(
  current: InstrumentPreset | undefined,
  next: InstrumentPreset,
): InstrumentPreset {
  if (current?.name !== undefined && next.name !== undefined && current.name !== next.name) {
    throw new TypeError(
      `Instrument name "${current.name}" cannot be overridden with "${next.name}"`,
    );
  }

  // Earlier derivations are closer to the owner and keep priority
  return {
    name: current?.name ?? next.name,
    metadata: {
      ...next.metadata,
      ...current?.metadata,
    },
  };
}

function createInstrument(
  interceptors: readonly Interceptor[],
  preset?: InstrumentPreset,
): Instrument {
  const instrument = function instrument<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext,
  ): T {
    const resolvedContext = mergeContext(preset, context);
    const wrappers: InterceptorWrapper<T>[] = [];

    for (const interceptor of interceptors) {
      const wrapper = interceptor.intercept(target, resolvedContext);

      if (wrapper) {
        wrappers.push(wrapper);
      }
    }

    return function (this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
      let next = ((...nextArgs: Parameters<T>): ReturnType<T> =>
        Reflect.apply(target, this, nextArgs)) as T;

      for (let index = wrappers.length - 1; index >= 0; index--) {
        next = wrappers[index]!(next);
      }

      return Reflect.apply(next, this, args);
    } as T;
  } as Instrument;

  instrument.with = next => createInstrument(interceptors, mergePreset(preset, next));
  return instrument;
}
