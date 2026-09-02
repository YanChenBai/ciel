export type AnyFunction = (...args: any[]) => any;
export type MetadataShape = object;

/**
 * 包装下一层函数并保持调用签名不变
 */
export type InterceptorWrapper<T extends AnyFunction = AnyFunction> = (next: T) => T;

export interface InstrumentContext<TMetadata extends MetadataShape = Record<string, unknown>> {
  /**
   * 稳定的操作名称
   */
  readonly name: string;

  /**
   * 稳定的操作展示名称
   */
  readonly label: string;

  /**
   * 稳定的操作分组标签
   */
  readonly tag: string;

  /**
   * 操作相关的静态附加数据
   */
  readonly metadata?: Readonly<Partial<TMetadata>>;
}

/**
 * 为派生 Instrument 预先绑定的上下文
 *
 * Name 一旦在任意上层固定则下层不得改写 Metadata 会逐层合并
 */
export interface InstrumentPreset<TMetadata extends MetadataShape = Record<string, unknown>> {
  readonly name?: string;
  readonly label?: string;
  readonly tag?: string;
  readonly metadata?: Readonly<Partial<TMetadata>>;
}

export interface Interceptor<TMetadata extends MetadataShape = Record<string, unknown>> {
  /**
   * 判断是否拦截目标函数 未命中时返回 undefined
   */
  intercept<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext<TMetadata>,
  ): InterceptorWrapper<T> | undefined;
}

export interface Instrument<TMetadata extends MetadataShape = Record<string, unknown>> {
  <T extends AnyFunction>(target: T, context?: InstrumentContext<TMetadata>): T;
  with(preset: InstrumentPreset<TMetadata>): Instrument<TMetadata>;
}
