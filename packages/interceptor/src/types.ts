export type AnyFunction = (...args: any[]) => any;

/**
 * 包装下一层函数，返回调用签名不变的新函数
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

export interface Interceptor {
  /**
   * 判断是否拦截目标函数，未命中时返回 undefined
   */
  intercept<T extends AnyFunction>(
    target: T,
    context?: InstrumentContext,
  ): InterceptorWrapper<T> | undefined;
}

export type Instrument = <T extends AnyFunction>(target: T, context?: InstrumentContext) => T;
