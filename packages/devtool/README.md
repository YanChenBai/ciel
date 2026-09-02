# @ciels/devtool

Corex 的层级 operation telemetry 与传输无关 Devtool bridge。

本包提供：

- 基于 `@cieljs/instrument` 的 telemetry interceptor
- 输入输出捕获与 SuperJSON transformer
- OpenTelemetry span、counter 和 histogram 投影
- Devtool target、peer 和 bridge 协议适配

```ts
import { createDevtoolBridge, telemetry } from '@ciels/devtool';
import { defineCiel, defineInterceptor } from 'corex';

telemetry({ capture: true });

const ciel = defineCiel({
  instructions,
  model,
  extensions: [
    defineInterceptor({
      name: 'devtool',
      interceptor: telemetry,
    }),
  ],
});

const bridge = createDevtoolBridge({
  createId: crypto.randomUUID,
  epoch: crypto.randomUUID(),
  target,
});
```

`currentOperation()` 返回当前异步调用链内最深的 operation。`operation(id)`、`parentOf(id)` 和 `events()` 用于查询已记录数据。Bridge 不绑定 WebSocket、IPC 或其他具体传输。

默认不捕获动态输入输出。只有本地调试明确需要时才启用 `capture`。
