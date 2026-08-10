# CIEL シエル

Ciel 是一个面向 AI Agent 的认知核心系统。

项目名来自《**关于我转生变成史莱姆这档事**》主角
[**利姆鲁**](https://baike.baidu.com/item/%E5%88%A9%E5%A7%86%E9%B2%81%C2%B7%E7%89%B9%E6%81%A9%E4%BD%A9%E6%96%AF%E7%89%B9/22945511?fromModule=lemma_inlink)
的技能“智慧之王／夏尔（Ciel）”。这个名字表达了项目的长期目标：构建一个能够接收感官信息、形成上下文，并逐步拥有记忆、推理与行动能力的 Agent 核心。

对于视觉和听觉，Ciel 不会先把外部世界统一转换成文本，而是让 Agent 从原始刺激中形成自己的感知；对于外部已经提供的符号信息，则允许 `Script` 直接进入大脑上下文：

```text
World
  → Stimulus
      ├─ Raw Sensory Signals
      │    → Perception
      │    → Context
      └─ Script
           → Context
  → Memory / Reasoning
  → Response
```

当前阶段聚焦直播场景下的感官基础：接收连续媒体流，将画面和声音转换为 Ciel 内部统一的视觉、听觉感知对象，为后续记忆、理解和决策提供输入。

## 设计哲学

Ciel 严格分离四种职责：

1. 原始感官信号；
2. 感知处理；
3. 可直接进入大脑的符号输入；
4. 认知理解。

```text
Sensory Path:
Raw Signal
  → Perception Module
  → LLM-ready Context
  → Ciel Core

Symbolic Path:
Script
  → Ciel Core
```

`Photon` 和 `Echo` 必须经过 Oculus、Auris 等感知器官转换；`Script` 已经是外部世界提供的符号信息，因此不再经过视觉或听觉理解，直接进入 Ciel Core 的上下文。感知器官不负责最终推理，高层认知也不直接处理媒体编码细节。

项目遵循以下原则：

- 信号对象不可变，只携带数据和时间。
- 感知模块只依赖信号契约，不反向依赖信号生产者。
- 模块之间优先通过事件通信。
- 感知层不直接耦合 LLM。
- 运行时生成的数据统一保存在 `.ciel-data`。

## 整体架构

```text
Live Stream / External World
            │
            ▼
        Stimulus
      ┌─────┼───────────┐
      ▼     ▼           ▼
   Photon  Echo       Script
      │     │           │
      ▼     ▼           │
   Oculus  Auris        │
      │     │           │
      ▼     ▼           │
    Sight Hearing       │
      └─────┼───────────┘
            ▼
   Ciel Context / Core
            ▼
   Memory / Reasoning / Agent
```

当前仓库是一个 Vite+ monorepo：

```text
ciel/
├── apps/
│   └── webui/            # Vue 管理与展示界面
├── packages/
│   ├── core/             # 通用信号、感知结果与视觉处理
│   ├── asr/              # ASR、VAD、说话人识别与 CLI
│   ├── event/            # 支持同步与异步监听的类型化事件包
│   └── bridge/           # WebSocket 服务和客户端桥接
├── .ciel-data/           # 模型、声纹和感知产物，不提交到 Git
├── vite.config.ts        # 工具链和项目任务
└── package.json
```

`packages/core/src` 的主要结构：

```text
packages/core/src/
├── signals/              # Photon、Echo、Script
├── stimulus/             # 外部刺激输入契约
├── perceptions/          # Sight、Hearing
├── oculus/               # 视觉感知
├── auris/                # Auris 听觉适配层
├── constants/
└── utils/
```

## 模块职责

### Signals

`signals` 定义低层、不可变的感官信号。

它们只描述“世界向 Ciel 传来了什么”，不描述这些信息意味着什么。

#### Photon

`Photon` 表示视觉刺激，即 Ciel 接收到的一帧光学信息：

```ts
interface PhotonFrame {
  data: Buffer;
  timestamp: Date;
}
```

它不包含图像描述、标签或模型推理结果。

#### Echo

`Echo` 表示听觉刺激：

```ts
interface EchoSegment {
  data: Buffer;
  startAt: Date;
  endAt: Date;
}
```

它不包含转写文本、说话人语义或内容解释。

#### Script

`Script` 表示外部世界直接提供的符号化文字刺激，例如直播字幕、平台消息或上游已经整理好的文本：

```ts
interface ScriptData {
  content: string;
  timestamp: Date;
}
```

文字信号与音频转写结果保持独立：

- `Script` 是外部世界直接提供给大脑的文字输入；
- `Hearing` 是 `Echo` 经 Auris 处理后形成的听觉感知。

`Script` 不进入 Oculus 或 Auris，也不需要再次执行 ASR 或视觉理解。Stimulus 发出 `script` 事件后，未来的 Context／Ciel Core 可以直接消费其内容。

### Stimulus

`Stimulus` 是外部世界的输入层。

它负责：

- 建立和关闭外部数据源；
- 解码或整理媒体数据；
- 创建 `Photon`、`Echo`、`Script`；
- 通过事件发送信号。

```ts
interface StimulusEventMap {
  photon(data: Photon): void;
  echo(data: Echo): void;
  script(data: Script): void;
}
```

`Stimulus` 不理解内容，也不产生 `Sight` 或 `Hearing`。

每个刺激源通过 `signals` 显式声明可能发送的具体信号类型，并继续使用事件发送信号：

```ts
const signals = [LiveEcho, LivePhoton, DanmuScript] as const;

class LiveStimulus extends Stimulus<typeof signals> {
  readonly signals = signals;

  async start() {
    await this.send(new LiveEcho(audioSegment));
  }

  async stop() {}
}
```

`send()` 会拒绝未在 `signals` 中声明的实例，并通过 `@ciels/event` 的异步事件等待 Ciel 完成对应处理队列。

### Ciel

`Ciel` 负责绑定刺激源、发现信号、自动创建处理器和管理生命周期：

```ts
const ciel = new Ciel({
  auris: {
    bufferSeconds: 30,
  },
  oculus: {
    sampleInterval: 1_000,
  },
});

ciel.use(new LiveStimulus());

await ciel.start();
await ciel.stop();
```

启动时，Ciel 根据 `Signal.prototype` 自动匹配处理器：

- `Echo` 子类创建独立的 `Auris`；
- `Photon` 子类创建独立的 `Oculus`；
- `Script` 子类直接作为 Ciel 的 `script` 事件发送。

处理器以“Stimulus 实例 + 具体 Signal class”为作用域，因此不同刺激源不会共享音频缓冲、说话人状态或视觉帧队列。Ciel 会先完成处理器创建和事件订阅，再启动刺激源；停止时则先停止刺激源，等待异步队列清空，最后 flush 和释放处理器。

### Oculus

`Oculus` 是 Ciel 的视觉感知器官。

处理流程：

```text
Photon[]
  → 时间采样
  → 收集 6 帧
  → 3 × 2 视觉拼图
  → 持久化 JPEG
  → Sight
```

当前实现会将采样后的画面统一调整为 1920 × 1080，并生成一张 3 × 2 的视觉快照。布局属于内部实现细节，不作为公共配置暴露。

`Sight` 只描述一次已经持久化的视觉观察：

```ts
interface SightOptions {
  path: string;
  startAt: Date;
  endAt: Date;
}
```

默认视觉产物保存在：

```text
.ciel-data/sights/
```

`Oculus` 不调用视觉 LLM，也不生成图片语义描述。后续视觉分析器应消费 `Sight`，而不是侵入 `Oculus`。

### ASR / Auris

`@ciels/asr` 提供底层语音识别能力；`@ciels/core` 中的 `Auris` 是面向 `Echo`、产出 `Hearing` 的上层封装。

当前已经支持：

- 连续音频块输入；
- 可配置环形缓冲区；
- Silero VAD 端点检测；
- sherpa-onnx 流式语音识别；
- 句子和 Token 级时间戳；
- 预注册声纹识别；
- 未知说话人在线聚类；
- 声纹创建脚本；
- 模型安装脚本。

处理流程：

```text
Echo (16 kHz mono s16le)
  → Float32 PCM
  → CircularBuffer
  → Silero VAD
  → OnlineRecognizer
  → Speaker Embedding
  → Voiceprint Match / Online Clustering
  → Hearing
```

`Auris` 接受连续的 `Echo`，但只在 VAD 确认一句语音结束后产生最终 `Hearing`，不会伪造逐 Token 临时结果。

#### 安装模型

```powershell
vp run asr:install
```

强制重新安装：

```powershell
vp run asr:install -- --force
```

模型会写入：

```text
.ciel-data/
├── downloads/
└── models/
   ├── asr/
   ├── vad/
   │  └── silero_vad.onnx
   └── speaker/
      └── model.onnx
```

#### 创建声纹

输入文件必须为单声道、16 kHz WAV。同一说话人可以提供多个样本：

```powershell
vp run asr:voiceprint -- `
  --output alice.voiceprint `
  ./samples/alice-1.wav `
  ./samples/alice-2.wav
```

输出文件位于：

```text
.ciel-data/voiceprints/alice.voiceprint
```

多个样本会分别提取 embedding，再经过平均和归一化生成最终声纹。

#### 配置

```ts
interface ASROptions {
  speaker?: readonly {
    name: string;
    file: string;
  }[];
  bufferSeconds?: number;
  speakerThreshold?: number;
  maxSpeakers?: number;
}
```

| 配置               | 默认值 | 说明                            |
| ------------------ | -----: | ------------------------------- |
| `speaker`          |   `[]` | 已注册说话人及其声纹文件        |
| `bufferSeconds`    |   `30` | 环形输入缓冲区和 VAD 缓冲区容量 |
| `speakerThreshold` |  `0.6` | 声纹与聚类中心的余弦相似度阈值  |
| `maxSpeakers`      |    `8` | 最多创建的匿名说话人数量        |

说话人识别始终启用，不提供关闭选项。声纹文件名相对于 `.ciel-data/voiceprints` 解析，并且不能访问该目录之外的文件。

匹配预注册声纹时，`Hearing.speaker` 返回业务名称。未匹配时，会在当前会话中生成稳定的 `speaker_0`、`speaker_1` 等匿名标签。

#### 使用

```ts
import { Auris, Echo } from '@ciels/core';

class MyEcho extends Echo.WithMeta({
  title: 'Microphone',
  description: 'Primary microphone audio',
}) {}

const auris = new Auris({
  signal: MyEcho,
  bufferSeconds: 30,
  speaker: [
    {
      name: 'alice',
      file: 'alice.voiceprint',
    },
  ],
});

auris.on('hearing', hearing => {
  console.log('[' + hearing.speaker + '] ' + hearing.content);
});

auris.on('error', error => {
  console.error(error);
});

auris.observe(echo);
auris.flush();
```

`Echo.data` 在进入 `Auris` 时必须是 16 kHz、单声道、signed 16-bit little-endian PCM。数据没有按 16-bit 样本对齐时会触发 `error` 事件。

#### Hearing

```ts
interface Hearing {
  readonly content: string;
  readonly speaker?: string;
  readonly confidence?: number;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly tokens?: readonly HearingToken[];
  readonly signal: SignalConstructor;
}

interface HearingToken {
  content: string;
  startAt: Date;
  endAt: Date;
}
```

`startAt` 和 `endAt` 根据 VAD 音频位置与原始 `Echo.startAt` 换算。Token 时间戳来自识别器结果，并映射为绝对时间。

短语音、重叠语音、强噪声以及录音设备差异可能降低说话人识别准确率。

### Events

Ciel 使用轻量事件驱动通信。感知器官消费信号并发送感知结果：

```text
Oculus emits sight(Sight)
Auris  emits hearing(Hearing)
```

这种方式使信号生产者、感知器官和后续认知模块保持独立。

### Bridge 与 WebUI

`packages/bridge` 提供基于 Elysia 的 WebSocket 服务、协议类型以及浏览器和 Vue 客户端。

`apps/webui` 是 Vue 应用，用于后续展示感知结果、运行状态和 Agent 交互。目前二者仍处于基础设施阶段，不属于已经完成的认知核心。

## 数据目录

所有运行时生成或下载的数据统一放在 `.ciel-data`：

```text
.ciel-data/
├── downloads/            # 临时模型下载
├── models/               # ASR、VAD、说话人模型
├── voiceprints/          # 已创建的声纹
└── sights/               # Oculus 视觉快照
```

该目录已加入 `.gitignore`。

## 当前实现状态

| 能力                     | 状态     |
| ------------------------ | -------- |
| 原始视觉、音频、文字信号 | 已实现   |
| Stimulus 输入契约与事件  | 已实现   |
| Oculus 采样与视觉拼图    | 已实现   |
| Sight 持久化             | 已实现   |
| Auris 流式输入与 VAD     | 已实现   |
| ASR 与转写时间戳         | 已实现   |
| 声纹识别与未知说话人聚类 | 已实现   |
| 模型安装与声纹创建脚本   | 已实现   |
| WebSocket 基础服务       | 初步实现 |
| WebUI                    | 初步实现 |
| Context 聚合             | 规划中   |
| 长期记忆                 | 规划中   |
| 多模态推理               | 规划中   |
| 自主决策与行动           | 规划中   |

## 开发

项目固定使用 Node.js 24.11.1 与 pnpm 11.20.0，并通过 Vite+ 统一管理依赖、格式化、检查、测试和构建。Vite+ 会按项目声明准备对应版本，无需手动切换全局环境。

```powershell
vp install
vp check
vp test
vp run -r build
```

启动 WebUI：

```powershell
Set-Location apps/webui
vp dev
```

`AGENTS.md` 和 `CLAUDE.md` 属于代理协作说明文件，已从项目格式化范围中排除。

## 后续方向

Ciel 当前解决的是“如何让 Agent 感受到世界”。后续可以继续扩展记忆、推理与决策能力：

```text
Perception
  → Context
  → Archive (Memory)
  → Cortex (Reasoning)
  → Will (Decision)
```

这些模块应消费 `Sight`、`Hearing` 等感知对象和可直接进入大脑的 `Script`，而不是直接依赖直播流、图片 Buffer 或音频编码。

最终目标是让 AI Agent 能够持续地看见、听见、记住并理解它所处的世界。
