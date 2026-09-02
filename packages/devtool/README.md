# @ciels/devtool

Corex Devtools 扩展。

应用只需提供负责收发协议消息的 adapter，并把 `devtools()` 放入 `plugins`：

```ts
import { devtools } from '@ciels/devtool';
import { defineCiel } from '@cieljs/core';

const ciel = defineCiel({
  instructions,
  model,
  plugins: [devtools({ adapter, capture: true })],
});
```

Adapter 不绑定具体传输，可以使用 Electron IPC、WebSocket 或其他双向消息通道：

```ts
const adapter = {
  send(message) {
    transport.send(message);
  },
  subscribe(receive) {
    transport.on('message', receive);
    return () => transport.off('message', receive);
  },
};
```

扩展内部统一管理 operation telemetry、运行时 target、协议 bridge 和连接生命周期。`createDevtoolBridge` 与 `telemetry` 仍作为兼容和底层定制 API 导出。

默认不捕获动态输入输出。只有本地调试明确需要时才启用 `capture`。
