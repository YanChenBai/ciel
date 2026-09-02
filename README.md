# CIEL シエル

Ciel 是一个持续感知型 AI Agent 运行时。当前实现以 Corex 为核心，组合感知、记忆、开发工具和 Bilibili 直播桌面应用。

## Workspace

| Workspace                   | 职责                                                     |
| --------------------------- | -------------------------------------------------------- |
| `packages/corex`            | `@cieljs/core` Agent 运行时、感知记录与 Plugin 模型      |
| `packages/asr`              | VAD、ASR、时间戳与说话人识别                             |
| `packages/sensu`            | 视觉和听觉感知插件                                       |
| `packages/memory`           | 长期记忆、经历归档与语义召回                             |
| `packages/devtool-protocol` | Devtool 的传输无关消息协议                               |
| `packages/devtool`          | Operation telemetry、OpenTelemetry 投影与 Devtool bridge |
| `packages/devtool-client`   | 基于 Vue 和 Vuetify v0 的 Devtool 客户端                 |
| `apps/watch-blive`          | Bilibili 直播 Electron 应用                              |

函数插桩统一使用外部包 `@cieljs/instrument`。Corex 导出固定的 `CielOperationName` 联合类型，以及包含 `name`、`label`、`tag` 的 `Operation` 协议；进入插桩边界时，`label` 和 `tag` 会作为 metadata 交给 interceptor。

## 开发

项目使用 Node.js 24、pnpm 12 和 Vite+：

```powershell
vp install
vp check
vp run -r test
vp run -r build
```

常用任务：

```powershell
vp run asr:install
vp -C apps/watch-blive run build
vp -C apps/watch-blive run test
```

运行时数据默认写入 `.ciel-data`，不会提交到 Git。

## 文档

- [Corex](./packages/corex/README.md)
- [ASR](./packages/asr/README.md)
- [Sensu](./packages/sensu/README.md)
- [Memory](./packages/memory/README.md)
- [Devtool Protocol](./packages/devtool-protocol/README.md)
- [Devtool](./packages/devtool/README.md)
- [Devtool Client](./packages/devtool-client/README.md)
