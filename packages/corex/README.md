# Corex

Corex 提供 Ciel 的模块定义,运行时连接和可插拔函数拦截能力.

## Instrumentation

Core Runtime 会 instrument 以下函数边界:

- `Stimulus`, `Sensu`, `Noesis` 的 `setup`
- `onSignal` 和 `onCue` 注册的 handler
- `emitSignal`, `emitPercept`, `emitCue`

外部能力通过 `defineInterceptor()` 定义拦截器,通过 `useInterceptor()` 动态安装:

```ts
import {
  type AnyFunction,
  defineCiel,
  defineInterceptor,
  defineSignal,
  defineStimulus,
  useInterceptor,
} from 'corex';

const logger = defineInterceptor({
  intercept<T extends AnyFunction>(target: T) {
    return next =>
      ((...args: Parameters<T>) => {
        console.log('[interceptor:call]', target.name, args);

        try {
          const result = next(...args);
          console.log('[interceptor:return]', target.name, result);
          return result;
        } catch (error) {
          console.error('[interceptor:error]', target.name, error);
          throw error;
        }
      }) as T;
  },
});

const heartbeat = defineSignal({
  name: 'heartbeat',
  description: 'Heartbeat signal',
});

const stimulus = defineStimulus({
  name: 'heartbeat',
  description: 'Emits one heartbeat',
  async setup(ctx) {
    await ctx.emitSignal(
      heartbeat.create(undefined, {
        kind: 'instant',
        at: Date.now(),
      }),
    );
  },
});

const ciel = defineCiel({ modules: [stimulus] });
const disposeInterceptor = useInterceptor(logger);

try {
  await ciel.start();
} finally {
  await ciel.stop();
  await disposeInterceptor();
}
```

`instrument(fn)` 本身不需要注销,它会在调用时读取当前 registry. `useInterceptor()` 返回的 disposer 由安装者持有,应用级 interceptor 应在应用退出时注销,Ciel 实例级 interceptor 应在对应实例停止后注销.

同一个 interceptor 可以被多个生命周期重复安装,只有全部 disposer 都执行后才会从 registry 移除.

## Development

- Install dependencies:

```bash
vp install
```

- Run the unit tests:

```bash
vp test
```

- Build the library:

```bash
vp pack
```
