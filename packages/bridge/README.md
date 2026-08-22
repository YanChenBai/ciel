# @ciels/vigilia-bridge

基于 Elysia 和 Eden Treaty 的 Vigilia WebSocket 传输层。

服务端会先发送包含当前快照与历史事件的 `vigilia.bootstrap`，再按顺序发送 `vigilia.event`。客户端断线后会自动重连并重新取得基线，消费端可按 `sequence` 去重。

## 服务端

```ts
import { createBridge } from '@ciels/vigilia-bridge';

const bridge = createBridge(ciel);
bridge.listen(3000);
```

## 客户端

```ts
import { createClient } from '@ciels/vigilia-bridge/client';

const client = createClient('http://localhost:3000');
const off = client.onMessage(message => console.log(message));
const release = client.retain();

off();
release();
```

首次 `retain()` 建立连接，最后一次 `release()` 关闭连接。请先注册消息监听器，再调用 `retain()`，避免遗漏首条 bootstrap 消息。

## 导出

- 主入口：服务端与 `App` 类型。
- `/protocol`：传输消息类型。
- `/client`：可保留的通用客户端。
- `/vue`：Vue 集成。

## 验证

```bash
vp check
vp pack
```
