# @ciels/blive

将一个 Bilibili 直播间接入为 Ciel `Stimulus`。包会解析直播 FLV 地址并启动 FFmpeg：

- stdout 输出 16kHz、单声道、s16le PCM，转换为 `BilibiliAudio extends Echo`；
- fd 3 每分钟输出九张 JPEG，转换为 `BilibiliVideo extends Photon`；
- Ciel 的 Auris 与 Oculus 继续负责听觉和视觉变化筛选，Nucleus 在每轮 Context 中组合视觉拼图。

## 使用

系统需要能够执行 `ffmpeg`：

首次运行听觉感知前需要准备 Ciel ASR 模型：

```bash
vp run asr:install
```

配置 OpenAI-compatible 多模态模型：

```powershell
$env:BLIVE_AI_API_KEY='...'
$env:BLIVE_AI_VISION_MODEL='provider/vision-model'
# 默认 https://openrouter.ai/api/v1；使用其他服务时再覆盖
$env:BLIVE_AI_BASE_URL='https://openrouter.ai/api/v1'
```

blive 会复用同一个模型 ID 创建视觉生成与 embedding handle，因此服务端模型必须同时支持
`image input` 和 embeddings 接口；embedding 用于历史经历的语义检索。`BLIVE_AI_MODEL`
仍可兼容使用，但建议通过 `BLIVE_AI_VISION_MODEL` 明确配置视觉模型；Nucleus 会把本轮尚未成功提交的变化帧每九张组合成一张 JPEG，不足九张也会立即提交。

```bash
vp run --filter @ciels/blive start
```

启动入口使用 `oxnode ./src/main.ts`。入口会先将默认 `CIEL_DATA_DIR` 解析到 monorepo 根目录的 `.ciel-data`，再动态加载 Core；从 app 子目录启动时仍会复用同一套 ASR 模型。入口通过 `new Ciel(live, { nucleus: { model, memory } })` 启动完整链路，原始 `BilibiliAudio`/`BilibiliVideo` 会依次进入 Auris/Oculus，形成 `Hearing`/`Sight` 后交给 Nucleus 思考，结果通过 `thought` 输出。`BLIVE_FFMPEG_PATH` 可以指定 FFmpeg 路径，`BLIVE_IMAGE_INTERVAL` 可以覆盖默认的 `10000` 毫秒截图间隔。

作为 Ciel Stimulus 使用：

```ts
import { BilibiliLive } from '@ciels/blive';
import { Ciel, Memory } from '@ciels/core';

const live = new BilibiliLive({ roomId: 24680 });
const ciel = new Ciel(live, {
  nucleus: {
    model,
    memory: new Memory({
      path: '.ciel-data/memory.db',
      embedder: embeddingModel,
      model,
    }),
  },
  oculus: {
    // BilibiliLive 已经在 FFmpeg 层限流为每分钟九帧。
    sampleInterval: 0,
    differenceThreshold: 0.03,
  },
});

live.onError(console.error);
await ciel.start();
```

`imageInterval` 默认 `60_000 / 9` 毫秒，与 Oculus 默认的每分钟九帧一致。FFmpeg 请求包含 Bilibili 直播页所需的 User-Agent、Referer 和 Origin；stderr 中的签名播放地址会被清理。输入使用 FFmpeg 默认解码缓冲以正确处理 H.264 参考帧重排，并为 HTTP 直播流启用断线重连。

```ts
const live = new BilibiliLive({
  roomId: 24680,
  ffmpegPath: 'ffmpeg',
  imageInterval: 60_000 / 9,
  stopTimeout: 5_000,
  api: {
    timeoutMs: 10_000,
    retryLimit: 2,
  },
});
```
