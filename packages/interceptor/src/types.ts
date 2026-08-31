export type AnyFunction = (...args: any[]) => any;

/**
 * 包装下一层函数并保持调用签名不变
 */
export type InterceptorWrapper<T extends AnyFunction = AnyFunction> = (next: T) => T;

export interface InstrumentContext {
  /**
   * 稳定的操作名称
   */
  readonly name: string;

  /**
   * 操作相关的静态附加数据
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * 为派生 Instrument 预先绑定的上下文
 *
 * Name 一旦在任意上层固定则下层不得改写 Metadata 会逐层合并
 */
export interface InstrumentPreset {
  readonly name?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Interceptor {
  /**
   * 判断是否拦截目标函数 未命中时返回 undefined
   */
  intercept<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext,
  ): InterceptorWrapper<T> | undefined;
}

export interface Instrument {
  <T extends AnyFunction>(target: T, context?: InstrumentContext): T;
  with(preset: InstrumentPreset): Instrument;
}
