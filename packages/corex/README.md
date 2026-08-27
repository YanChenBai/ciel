# Corex

Corex 提供 Ciel 的模块定义,运行时连接和可插拔函数拦截能力.

## Projection

Projector 定义可复用的 Engram 投影逻辑，Projection 使用对象组合并命名多个 Projector。
Projection 需要与使用它的 Noesis 一同注册到 Ciel 顶层：

```ts
import { defineCiel, defineNoesis, defineProjection, defineProjector } from '@ciels/corex';

const speechProjector = defineProjector({
  name: 'speech',
  project({ engram }) {
    return engram.entries(speechPercept).flatMap(entry => entry.value.contents);
  },
});

const agentProjection = defineProjection({
  name: 'agent-context',
  projectors: {
    speech: speechProjector,
    vision: visionProjector,
  },
});

const agent = defineNoesis({
  name: 'agent',
  projection: agentProjection,
  setup(ctx) {
    ctx.onCue(thinkingCue, async () => {
      const context = await ctx.project(ctx.engram.recent());

      context.speech;
      context.vision;
    });
  },
});

const ciel = defineCiel({ modules: [agentProjection, agent] });
```

每次 `project()` 都会先从输入条目创建固定的只读 Engram 快照。各 Projector 并行执行，
返回结果仍按照 `projectors` 的 key 命名和推导类型。同一个 Projector 可以被多个 Projection
复用；Noesis 引用的 Projection 未在当前 Ciel 注册时，Ciel 会拒绝启动。

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
