# @ciels/blive

将 Bilibili 直播间接入为 Ciel `Stimulus`：

- 标准输出提供 16 kHz、单声道、s16le PCM，转为 `BilibiliAudio`。
- fd 3 输出 JPEG，转为 `BilibiliVideo`。
- Auris 与 Oculus 继续完成听觉、视觉处理，再交给 Nucleus。

## 准备

系统需要能够执行 FFmpeg。首次运行前安装 ASR 模型：

```bash
vp run asr:install
```

配置同一个 OpenAI-compatible 多模态模型：

```powershell
$env:BLIVE_AI_API_KEY='...'
$env:BLIVE_AI_MODEL='provider/shared-model'
$env:BLIVE_AI_BASE_URL='https://openrouter.ai/api/v1' # 可选
```

生成与 embedding 共用 `BLIVE_AI_MODEL`，因此服务端模型必须同时支持图片输入和 embeddings。embedding 用于历史经历的语义检索。

桌面客户端负责配置 `CIEL_DATA_DIR` 并启动运行时。可选配置：

- `BLIVE_FFMPEG_PATH`：FFmpeg 路径。
- `BLIVE_IMAGE_INTERVAL`：截图间隔，默认 `60_000 / 9` 毫秒。

## 作为 Stimulus 使用

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
      resourceId: 'blive:example',
    }),
  },
  oculus: {
    // FFmpeg 已经限制截图频率，Oculus 无需再次采样。
    sampleInterval: 0,
    differenceThreshold: 0.03,
  },
});

live.onError(console.error);
await ciel.start();
```

FFmpeg 请求会携带直播页所需的 User-Agent、Referer 和 Origin，并为 HTTP 直播流启用断线重连。日志中的签名播放地址会被清理。

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
