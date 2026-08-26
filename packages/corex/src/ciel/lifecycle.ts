import type { Dispose, MaybePromise } from '../types/index.ts';

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

export function createLifecycle(options: CreateLifecycleOptions): Lifecycle {
  let status: LifecycleStatus = 'idle';

  return {
    get status() {
      return status;
    },

    async start() {
      if (status === 'running') {
        return;
      }
      if (status !== 'idle') {
        throw new Error(`Cannot start ${options.name} while it is ${status}`);
      }

      status = 'starting';
      try {
        await options.setup();
        status = 'running';
      } catch (error) {
        try {
          await options.dispose();
        } catch (disposeError) {
          status = 'idle';
          throw new AggregateError([error, disposeError], `Failed to start ${options.name}`);
        }
        status = 'idle';
        throw error;
      }
    },

    async stop() {
      if (status === 'idle') {
        return;
      }
      if (status !== 'running') {
        throw new Error(`Cannot stop ${options.name} while it is ${status}`);
      }

      status = 'stopping';
      try {
        await options.dispose();
      } finally {
        status = 'idle';
      }
    },
  };
}

export interface LifecycleScope {
  onDispose(dispose: Dispose): void;

  dispose(): Promise<void>;
}

export function createLifecycleScope(): LifecycleScope {
  let disposers: Dispose[] = [];

  return {
    onDispose(dispose) {
      disposers.push(dispose);
    },

    async dispose() {
      const errors: unknown[] = [];

      for (const dispose of disposers.reverse()) {
        try {
          await dispose();
        } catch (error) {
          errors.push(error);
        }
      }

      disposers = [];

      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Failed to dispose Ciel lifecycle scope');
      }
    },
  };
}

export async function disposeScopes(scopes: LifecycleScope[]): Promise<void> {
  const errors: unknown[] = [];

  for (const scope of scopes.reverse()) {
    try {
      await scope.dispose();
    } catch (error) {
      errors.push(error);
    }
  }

  scopes.length = 0;

  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Failed to stop Ciel');
  }
}
