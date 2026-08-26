export type AnyFunction = (...args: any[]) => any;

/**
 * 包装下一层函数,返回调用签名不变的新函数
 */
export type InterceptorWrapper<T extends AnyFunction = AnyFunction> = (next: T) => T;

export interface Interceptor {
  /**
   * 判断是否拦截目标函数,未命中时返回 undefined
   */
  intercept<T extends AnyFunction>(target: T): InterceptorWrapper<T> | undefined;
}
