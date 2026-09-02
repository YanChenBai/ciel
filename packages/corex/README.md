<h1 align="center">@cieljs/core</h1>

<p align="center">让外部世界成为可追踪的感知流，让 Ciel 在正确的时刻开始思考</p>

> The perception and agent runtime behind Ciel

## 核心模型

`@cieljs/core` 只接受已经构造完成的 Signal，不负责连接、重试或外部数据源生命周期。

- Signal 表达外部输入
- Sensu 以有状态流消费 Signal，并产生 Percept 与 Cue
- Engram 保存 Percept
- Cue 决定 Agent 何时思考
- Projector 将 Engram 快照整理为模型上下文
- Plugin 是唯一 Runtime 扩展单元，可贡献 Sensu、Projector、Interceptor、Tool 与 instructions

```text
External source -> ciel.dispatchSignal() -> Signal -> Sensu
                                                  ├-> Percept -> Engram -> Projector
                                                  └-> Cue -> Agent
```

## 快速开始

```ts
import {
  defineCiel,
  defineCue,
  definePercept,
  definePlugin,
  defineSensu,
  defineSignal,
  referenceSignal,
} from '@cieljs/core';

const Message = definePercept({ name: 'message' });
const MessageReceived = defineCue({
  name: 'message-received',
  prompt: '请结合最新消息决定是否回应',
});
const messageSignal = defineSignal<string>({ name: 'message-input' });

const messageSensu = defineSensu(() => ({
  name: 'message',
  signal: messageSignal,
  create({ output }) {
    return {
      async write(input) {
        await output.write({
          percepts: Message.create({
            origin: input.definition,
            causes: [referenceSignal(input)],
            temporal: input.temporal,
            contents: [{ type: 'text', text: input.payload }],
          }),
          cues: MessageReceived.create(input.temporal),
        });
      },
      close() {},
    };
  },
}))();

const perception = definePlugin(() => ({
  name: 'message-perception',
  sensu: [messageSensu],
}))();

const ciel = defineCiel({
  id: 'ciel-main',
  instructions: '你是夏尔',
  model,
  plugins: [perception],
  tools: [businessTool],
});

await ciel.start();
await ciel.dispatchSignal(messageSignal.create('你好', { kind: 'instant', at: Date.now() }));
await ciel.stop();
```

## Plugin

Plugin 直接声明贡献，不再创建 PluginInstance，也不存在通用 Extension 或 PluginPackage 抽象。

```ts
const memoryPlugin = definePlugin((options: MemoryOptions) => ({
  name: 'memory',
  instructions: '可以使用 memory tools 查询长期记忆',
  interceptors: [telemetry],
  sensu: [memorySensu],
  projectors: [memoryProjector],
  tools: [searchMemoryTool],
  configResolved(config) {
    console.log(config.id);
  },
  initialize() {},
  dispose() {},
}));
```

`configResolved()` 接收已标准化且只读的最终配置，并保证在 Plugin 初始化与 `Sensu.create()` 前调用。
Plugin 组合直接使用数组、条件值或普通 JavaScript 函数：

```ts
plugins: [
  memoryPlugin(options),
  enableTelemetry && telemetryPlugin(),
  [audioPlugin(), visualPlugin()],
];
```

Plugin Tool 自动携带 `pluginId` 与 `pluginName`。顶层 Host Tool 直接从根 Instrument 派生。

## 生命周期

生命周期顺序固定为：

1. 调用 `configResolved`
2. 按声明顺序执行 `initialize`
3. 安装 Sensu 并启动 Agent
4. 按声明顺序执行内部 Runtime `activate`
5. 禁止新的 Signal ingress，并逆序执行 `deactivate`
6. 逆序关闭 Sensu、停止 Agent
7. 逆序执行 `dispose`

外部 Source 生命周期不属于 Plugin。Source 应由宿主管理，并在 Core 运行期间调用
`ciel.dispatchSignal(signal)`。

## 会话与 Engram

`id` 是稳定的 Ciel 隔离标识，`sessionId` 是一次对话标识。Agent 每轮 checkout 尚未消费的
Percept，成功后才提交，失败时下轮仍会看到同一批增量。

默认会话保存在 `.ciel`。传入稳定的 `id` 与 `sessionId` 可以跨进程恢复，也可以通过
`sessionStore: false` 禁用持久化。

## 上下文压缩

Core 会在 Projector 与本轮 prompt 生成后统计实际模型上下文的 token 数。计数范围包括
instructions、tools、历史消息和本轮投影内容。达到阈值时，旧历史会被摘要替换，并保留最近的
完整对话轮次：

```ts
const ciel = defineCiel({
  // 默认阈值为模型上下文窗口的 80%
  compaction: {
    thresholdTokens: 80_000,
    keepRecentTurns: 1,
    summaryMaxTokens: 4_096,
    instructions: '保留直播间状态和未完成的工具操作',
    countTokens: ({ model, context }) => provider.countTokens(model, context),
  },
  // ...
});

console.log(ciel.contextTokens);
```

传入 `compaction: false` 可以禁用。压缩后的拼接顺序为压缩摘要、最近历史、本轮投影 prompt。
配置 `countTokens` 时会在请求前对完整投影上下文精确计数；未配置时使用模型响应中的原生 usage，
并在下一轮开始前按阈值压缩。若模型仍返回上下文溢出，Core 会强制压缩并从失败请求前继续一次，
不会重放已经完成的工具调用。`contextTokens` 表示最近一次可用的真实上下文 token 数。

## 开发

```shell
vp install
vp check
vp test
vp pack
```
