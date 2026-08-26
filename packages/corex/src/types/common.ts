import type { MaybePromise } from './async.ts';

export type Dispose = () => MaybePromise<void>;
