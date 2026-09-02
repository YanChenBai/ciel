import type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InstrumentPreset,
  Interceptor,
  InterceptorWrapper,
  MetadataShape,
} from './types.ts';

export type {
  AnyFunction,
  Instrument,
  InstrumentContext,
  InstrumentPreset,
  Interceptor,
  InterceptorWrapper,
  MetadataShape,
} from './types.ts';

/**
 * 为一组 interceptor 创建相互隔离的 instrumenter
 */
export function createInstrumenter<TMetadata extends MetadataShape = Record<string, unknown>>(
  interceptors: readonly Interceptor<TMetadata>[],
): Instrument<TMetadata> {
  return createInstrument(interceptors);
}

function assertSamePresetValue(
  field: 'label' | 'name' | 'tag',
  preset: string | undefined,
  context: string | undefined,
): void {
  if (preset !== undefined && context !== undefined && preset !== context) {
    throw new TypeError(`Instrument ${field} "${preset}" cannot be overridden with "${context}"`);
  }
}

function mergeContext<TMetadata extends MetadataShape>(
  preset: InstrumentPreset<TMetadata> | undefined,
  context: InstrumentContext<TMetadata> | undefined,
): InstrumentContext<TMetadata> | undefined {
  if (!preset) return context;
  assertSamePresetValue('name', preset.name, context?.name);
  assertSamePresetValue('label', preset.label, context?.label);
  assertSamePresetValue('tag', preset.tag, context?.tag);

  const name = preset.name ?? context?.name;
  const label = preset.label ?? context?.label;
  const tag = preset.tag ?? context?.tag;
  if (name === undefined && label === undefined && tag === undefined) return undefined;
  if (name === undefined || label === undefined || tag === undefined) {
    throw new TypeError('Instrument context requires name, label, and tag');
  }

  // Preset fields represent trusted owner identity and win over call-site fields
  const metadata = {
    ...context?.metadata,
    ...preset.metadata,
  } as Partial<TMetadata>;

  return {
    name,
    label,
    tag,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

function mergePreset<TMetadata extends MetadataShape>(
  current: InstrumentPreset<TMetadata> | undefined,
  next: InstrumentPreset<TMetadata>,
): InstrumentPreset<TMetadata> {
  assertSamePresetValue('name', current?.name, next.name);
  assertSamePresetValue('label', current?.label, next.label);
  assertSamePresetValue('tag', current?.tag, next.tag);

  // Earlier derivations are closer to the owner and keep priority
  return {
    name: current?.name ?? next.name,
    label: current?.label ?? next.label,
    tag: current?.tag ?? next.tag,
    metadata: {
      ...next.metadata,
      ...current?.metadata,
    } as Partial<TMetadata>,
  };
}

function createInstrument<TMetadata extends MetadataShape>(
  interceptors: readonly Interceptor<TMetadata>[],
  preset?: InstrumentPreset<TMetadata>,
): Instrument<TMetadata> {
  const instrument = function instrument<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext<TMetadata>,
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
  } as Instrument<TMetadata>;

  instrument.with = next => createInstrument(interceptors, mergePreset(preset, next));
  return instrument;
}
