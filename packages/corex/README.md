# Corex

Corex 提供 Ciel 的模块定义,运行时连接和可插拔函数观测能力.

## Observe

Core Runtime 会观测以下函数边界:

- `Stimulus`, `Sensu`, `Noesis` 的 `setup`
- `onSignal` 和 `onCue` 注册的 handler
- `emitSignal`, `emitPercept`, `emitCue`

外部能力通过 `defineObserve()` 定义拦截规则,通过 `useObserve()` 动态安装:

```ts
import {
  type AnyFunction,
  defineCiel,
  defineObserve,
  defineSignal,
  defineStimulus,
  useObserve,
} from 'corex';

const logger = defineObserve({
  intercept<T extends AnyFunction>(target: T) {
    return next =>
      ((...args: Parameters<T>) => {
        console.log('[observe:call]', target.name, args);

        try {
          const result = next(...args);
          console.log('[observe:return]', target.name, result);
          return result;
        } catch (error) {
          console.error('[observe:error]', target.name, error);
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
const disposeObserve = useObserve(logger);

try {
  await ciel.start();
} finally {
  await ciel.stop();
  await disposeObserve();
}
```

`observe(fn)` 本身不需要注销,它会在调用时读取当前 registry. `useObserve()` 返回的 disposer 由安装者持有,应用级 definition 应在应用退出时注销,Ciel 实例级 definition 应在对应实例停止后注销.

同一个 definition 可以被多个生命周期重复安装,只有全部 disposer 都执行后才会从 registry 移除.

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
