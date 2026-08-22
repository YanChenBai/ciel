# @ciels/devtools

Ciel 的可嵌入、可独立部署运行时检查器。界面包含两个顶层视图：

- `对话`：直接展示 ASR 结果和模型最终消息。
- `轨迹`：展示 Vigilia 步骤时间轴、步骤列表与详细检查器。

## 开发

```powershell
vp dev
```

打开 `http://localhost:4173/?demo` 可使用内置演示数据。

## 构建

```powershell
vp run build
```

- `dist/app`：可直接部署的静态应用。
- `dist/lib`：可被其他 Vue 应用引用的组件库。

## 组件 API

```ts
import { CielDevTools, CielDevToolsApp } from '@ciels/devtools';
import '@ciels/devtools/style.css';
```

`CielDevTools` 接收 `events`、`snapshot` 和可选的 `connected`，不依赖传输层。`CielDevToolsApp` 接收 `endpoint`，并自行连接 `@ciels/bridge`。
