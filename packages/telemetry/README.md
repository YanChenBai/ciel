<h1 align="center">@ciels/telemetry</h1>

<p align="center">把一次思考展开成可查询的层级 operation</p>

<p align="center">
  <img alt="OpenTelemetry" src="https://img.shields.io/badge/OpenTelemetry-compatible-F5A800?logo=opentelemetry&logoColor=white">
  <img alt="Corex Interceptor" src="https://img.shields.io/badge/Corex-Interceptor-8A2BE2">
</p>

> Observe Corex without coupling the runtime to a telemetry backend

## 能看到什么

- Agent think、prompt 与模型生成
- Tool 执行
- Projector 投影
- Sensu 创建、输入、输出与关闭
- Plugin 生命周期
- Signal 发布
- 同一异步调用链中的父子 operation

## 快速开始

```ts
import { defineCiel, defineInterceptor } from 'corex';
import { telemetry } from '@ciels/telemetry';

const telemetryExtension = defineInterceptor({
  name: 'telemetry',
  interceptor: telemetry,
});

const ciel = defineCiel({
  instructions,
  model,
  extensions: [telemetryExtension, ...extensions],
});

telemetry.subscribe(event => {
  console.log(event.operation.id, event.operation.parentOperationId, event.type);
});
```

`currentOperation()` 返回当前异步调用链最内层 operation。`operation(id)` 与 `parentOf(id)` 可用于
向上追溯。started、completed 和 failed 事件共享同一个 `TelemetryOperation`。

## 捕获输入输出

默认不记录动态输入输出，避免 prompt、上下文和 Tool 参数意外进入遥测。需要本地调试时可以显式开启：

```ts
telemetry({
  capture: true,
});
```

领域对象可以注册 SuperJSON 转换器：

```ts
import { defineTransformer, telemetry } from '@ciels/telemetry';

telemetry({
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

## OpenTelemetry

库会创建 span、operation counter、error counter 与 duration histogram，但不会安装 SDK 或
exporter。宿主可以按部署环境接入自己的 OpenTelemetry pipeline。

## 开发

```shell
vp check
vp test --run
vp pack
```
