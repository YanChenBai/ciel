# @ciels/devtool-protocol

Ciel Devtool 的传输无关类型协议。

这个包只定义：

- 可序列化的 Target、Operation、Engram、Agent DTO。
- 请求名与输入、输出类型之间的映射。
- 事件名与事件 payload 类型之间的映射。
- Hello、Welcome、Request、Response 和 Event 消息。
- 协议版本、Capability、Cursor 和错误结构。

它没有运行时依赖，也不提供校验、Bridge、Transport、Adapter 或生命周期实现。

```ts
import {
  DevtoolProtocol,
  DevtoolRequestName,
  type DevtoolRequestOf,
} from '@ciels/devtool-protocol';

const request: DevtoolRequestOf<typeof DevtoolRequestName.OperationQuery> = {
  protocol: DevtoolProtocol.Name,
  version: DevtoolProtocol.Version,
  id: 'request-1',
  type: 'request',
  name: DevtoolRequestName.OperationQuery,
  payload: { after: 10, limit: 100 },
};
```
