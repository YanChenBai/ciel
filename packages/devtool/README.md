# @ciels/devtool

Ciel 下一代 Devtool 的渐进式实现。

当前边界：

- 使用 `@ciels/devtool-protocol`，不读取 Corex 或 Vigilia 内部类型。
- `createDevtoolClient` 只消费外部 `DevtoolConnection`，不实现 WebSocket、IPC 或其他传输。
- Vue 组件启用 Vapor Mode，界面基于 `@vuetify/v0` 与 Tailwind CSS。
- bootstrap 快照与实时事件通过协议 Cursor 合并，UI 不直接管理连接竞态。

```ts
import { CielDevtool, createDevtoolClient } from '@ciels/devtool';

const client = createDevtoolClient({
  connection,
  createId: crypto.randomUUID,
  client: { name: 'my-devtool-host' },
});
```

`connection` 由宿主实现；本包不会提供具体传输 Adapter。
