# @ciels/devtool-bridge

Ciel Devtool 的传输无关 Bridge。

Bridge 只负责：

- 完成 Hello/Welcome 握手。
- 根据外部 `DevtoolTarget` 派生 Capability。
- 分派类型化请求并封装响应。
- 为目标事件分配 epoch、sequence、cursor 和消息 id。
- 向已完成握手的 Peer 广播事件。

它不提供 Corex、Telemetry、WebSocket、IPC、`postMessage` 或其他 Adapter 实现。

宿主实现 `DevtoolTarget`，Transport 实现 `DevtoolPeer`，然后通过
`createDevtoolBridge({ target, epoch, createId })` 将二者连接。
