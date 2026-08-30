# @ciels/telemetry

面向 Corex 的层级 operation 遥测。它直接依赖 `corex`，通过 Corex Interceptor 接收
`think`、prompt、模型生成、Tool 执行、Projection、Sensu 等稳定边界，并将同一异步调用链
组织为可查询的父子 operation。

```ts
import { defineCiel } from 'corex';
import { telemetry } from '@ciels/telemetry';

const ciel = defineCiel({
  instructions,
  model,
  tools,
  modules: [telemetry, ...modules],
});

telemetry.subscribe(event => {
  console.log(event.operation.id, event.operation.parentOperationId, event.type);
});
```

`telemetry.currentOperation()` 返回当前异步调用链最内层 operation；`operation(id)` 和
`parentOf(id)` 可用于向上追溯。每个 started/completed/failed 事件都携带相同的
`TelemetryOperation`，父级关系不依赖 OpenTelemetry SDK 是否安装。

默认不记录动态输入输出，避免完整 prompt、上下文和工具参数进入遥测。需要本地调试时可显式开启：

```ts
telemetry.configure({
  capture: true,
});
```

领域对象可以复用 SuperJSON 的自定义转换器：

```ts
import { defineTransformer, telemetry } from '@ciels/telemetry';

telemetry.configure({
  capture: true,
  transformers: [
    defineTransformer({
      name: 'url',
      isApplicable: (value): value is URL => value instanceof URL,
      serialize: value => value.toString(),
      deserialize: value => new URL(value),
    }),
  ],
});
```

库始终创建 OpenTelemetry span、operation counter、error counter 和 duration histogram，
但不安装 SDK 或 exporter；宿主可以按部署环境自行配置 OpenTelemetry。
