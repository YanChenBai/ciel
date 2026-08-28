import { expect, test } from 'vite-plus/test';

import { createLifecycle, createLifecycleScope, disposeScopes } from '../lifecycle/index.ts';

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('在启动和停止期间保护生命周期状态转换', async () => {
  const setup = deferred();
  const dispose = deferred();
  const lifecycle = createLifecycle({
    name: 'Test',
    setup: () => setup.promise,
    dispose: () => dispose.promise,
  });

  const starting = lifecycle.start();
  expect(lifecycle.status).toBe('starting');
  await expect(lifecycle.start()).rejects.toThrow('Cannot start Test while it is starting');
  await expect(lifecycle.stop()).rejects.toThrow('Cannot stop Test while it is starting');

  setup.resolve();
  await starting;
  expect(lifecycle.status).toBe('running');
  await lifecycle.start();

  const stopping = lifecycle.stop();
  expect(lifecycle.status).toBe('stopping');
  await expect(lifecycle.start()).rejects.toThrow('Cannot start Test while it is stopping');
  await expect(lifecycle.stop()).rejects.toThrow('Cannot stop Test while it is stopping');

  dispose.resolve();
  await stopping;
  expect(lifecycle.status).toBe('idle');
  await lifecycle.stop();
});

test('setup 失败时清理并恢复为空闲状态', async () => {
  const setupError = new Error('setup failed');
  let disposed = false;
  const lifecycle = createLifecycle({
    name: 'Test',
    setup() {
      throw setupError;
    },
    dispose() {
      disposed = true;
    },
  });

  await expect(lifecycle.start()).rejects.toBe(setupError);
  expect(disposed).toBe(true);
  expect(lifecycle.status).toBe('idle');
});

test('聚合 setup 和清理错误', async () => {
  const setupError = new Error('setup failed');
  const disposeError = new Error('dispose failed');
  const lifecycle = createLifecycle({
    name: 'Test',
    setup() {
      throw setupError;
    },
    dispose() {
      throw disposeError;
    },
  });

  await expect(lifecycle.start()).rejects.toMatchObject({
    message: 'Failed to start Test',
    errors: [setupError, disposeError],
  });
  expect(lifecycle.status).toBe('idle');
});

test('按相反顺序且仅一次释放作用域资源', async () => {
  const calls: number[] = [];
  const scope = createLifecycleScope();
  scope.onDispose(() => {
    calls.push(1);
  });
  scope.onDispose(async () => {
    calls.push(2);
  });

  await scope.dispose();
  await scope.dispose();

  expect(calls).toEqual([2, 1]);
});

test('尝试释放所有作用域并聚合错误', async () => {
  const firstError = new Error('first');
  const secondError = new Error('second');
  const first = createLifecycleScope();
  const second = createLifecycleScope();
  first.onDispose(() => {
    throw firstError;
  });
  second.onDispose(() => {
    throw secondError;
  });
  const scopes = [first, second];

  await expect(disposeScopes(scopes)).rejects.toMatchObject({
    message: 'Failed to stop Ciel',
    errors: [secondError, firstError],
  });
  expect(scopes).toEqual([]);
});
