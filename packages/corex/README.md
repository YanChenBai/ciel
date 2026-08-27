# Corex

Corex 提供 Ciel 的模块定义,运行时连接和可插拔函数拦截能力.

## Instrumentation

Core Runtime 会 instrument 以下函数边界:

- `Stimulus`, `Sensu`, `Noesis` 的 `setup`
- `onSignal` 和 `onCue` 注册的 handler
- `emitSignal`, `emitPercept`, `emitCue`

Interceptor 与其他 Ciel 模块一样通过 `defineInterceptor()` 定义，并放入
`defineCiel()` 的 `modules` 中：

```ts
import {
  type AnyFunction,
  defineCiel,
  defineInterceptor,
  defineSignal,
  defineStimulus,
} from '@ciels/corex';

const logger = defineInterceptor({
  name: 'logger',
  description: 'Logs instrumented function calls',
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

const ciel = defineCiel({ modules: [logger, stimulus] });

try {
  await ciel.start();
} finally {
  await ciel.stop();
}
```

`intercept(target)` 返回 wrapper 时拦截目标函数，返回 `undefined` 时跳过。Interceptor 归所在的
Ciel 实例所有，模块数组中的声明顺序就是 wrapper 的组合顺序，不同 Ciel 实例彼此隔离。

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
