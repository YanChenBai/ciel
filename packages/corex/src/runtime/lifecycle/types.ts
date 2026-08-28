import type { Dispose, MaybePromise } from '#shared/async.ts';

export type LifecycleStatus = 'idle' | 'starting' | 'running' | 'stopping';

export interface Lifecycle {
  readonly status: LifecycleStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface CreateLifecycleOptions {
  readonly name: string;
  setup(): MaybePromise<void>;
  dispose(): MaybePromise<void>;
}

export interface LifecycleScope {
  onDispose(dispose: Dispose): void;
  dispose(): Promise<void>;
}
