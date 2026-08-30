# @ciels/sensu

`@ciels/sensu` 是 Corex 的视觉与听觉插件。一个 `sensuPlugin()` 同时注册视觉、听觉解释器，
并通过内部唯一的 Projector 将 `Sight` 与 `Hearing` 合并为同一个模型上下文。

## 使用

```ts
import { defineCiel, definePlugin } from 'corex';
import { defineEcho, definePhoton, sensuPlugin } from '@ciels/sensu';

const screen = definePhoton({
  name: 'screen',
  description: '桌面画面',
});
const microphone = defineEcho({
  name: 'microphone',
  description: '麦克风音频',
});

const sensu = sensuPlugin({
  name: 'sensu',
  vision: {
    signals: [screen],
    sampleInterval: 60_000 / 9,
    differenceThreshold: 0.03,
  },
  hearing: {
    signals: [microphone],
    asr: {
      bufferSeconds: 30,
      speaker: [{ name: 'Alice', file: '.ciel-data/voiceprints/alice.voiceprint' }],
      speakerThreshold: 0.6,
      maxSpeakers: 8,
    },
  },
  projector: {
    maxVisionFrames: 9,
    visionPrompt: '结合画面顺序理解视觉变化。',
    hearingPrompt: '结合来源和说话人理解听觉内容。',
  },
});

const input = definePlugin(() => ({
  name: 'desktop-input',
  setup(ctx) {
    ctx.onStart(async () => {
      await ctx.emitSignal(
        screen.create({ data: imageBuffer }, { kind: 'instant', at: Date.now() }),
      );
      await ctx.emitSignal(
        microphone.create(
          { data: pcmBuffer },
          { kind: 'interval', start: startedAt, end: endedAt },
        ),
      );
    });
  },
}))({});

const ciel = defineCiel({
  model,
  instructions: '你是夏尔。',
  plugins: [sensu, input],
});
```

`PhotonPayload.data` 接受 Sharp 可读取的图片 `Buffer`。`EchoPayload.data` 固定为 16 kHz、
单声道、signed 16-bit little-endian PCM。

## 投影

内部 Projector 使用插件的 `name` 作为上下文 key：

- 听觉按时间排列，保留 Signal 来源、说话人与 ASR 文本。
- 视觉按 Signal 来源分组，每个来源均匀选取最多 `maxVisionFrames` 帧并合成为 1920×1080 JPEG。
- `visionPrompt` 与 `hearingPrompt` 分别放在对应上下文前；传空字符串可关闭内置提示词。

未提供自定义提示词时，会使用简短的默认视觉和听觉提示词。

## ASR 配置

`hearing.asr` 原样使用 `@ciels/asr` 的 `ASROptions`：

- `bufferSeconds`：VAD 环形缓冲区时长。
- `speaker`：已注册声纹文件。
- `speakerThreshold`：声纹匹配阈值。
- `maxSpeakers`：匿名说话人上限。

ASR 在 Plugin 启动时创建，停止时先 flush，再等待内部 Hearing Signal 写入 Corex，最后关闭。

## 插装

Sensu 使用 Corex `PluginContext.instrument()` 接入当前 Ciel 的 `@ciels/interceptor` 链：

- `ciel.sensu.asr.input`：记录送入 ASR 的 PCM、开始时间和音频 Signal Definition。
- `ciel.sensu.asr.output`：记录 ASR 文本、说话人、置信度、时间戳和 tokens，并以发布后的
  `SpeechResultPayload` 作为操作输出。

Corex 自动追加 `pluginId`、`pluginName`；Sensu 追加 `capability`、`signalDefinitionId` 和
`signalDefinitionName`。Telemetry 等 Interceptor 无需 Sensu 专用适配即可捕获输入、输出、错误和耗时。
