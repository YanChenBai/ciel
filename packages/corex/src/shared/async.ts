export type MaybePromise<T> = T | Promise<T>;

export type Dispose = () => MaybePromise<void>;
