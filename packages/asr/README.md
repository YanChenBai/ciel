# @ciels/asr

基于 `sherpa-onnx-node` 的流式语音感知模块，负责 PCM 缓冲、TEN-VAD 分段、SenseVoiceSmall 离线识别、时间戳、声纹与说话人聚类，不依赖 Ciel 的信号和感知类型。

## 使用

```ts
import { ASR } from '@ciels/asr';

const asr = new ASR({
  bufferSeconds: 30,
  speakerThreshold: 0.6,
  maxSpeakers: 8,
});

asr.on('result', result => console.log(result.content));
asr.write({ data: pcm16le, startAt: new Date() });
asr.flush();
```

输入必须是 16 kHz、单声道、16 位有符号小端 PCM。

## 模型

```bash
vp run asr:install
vp run asr:install -- --force
vp run asr:voiceprint -- --output alice.voiceprint ./samples/alice.wav
```

模型和声纹默认保存在 `.ciel-data`，可通过 `CIEL_DATA_DIR` 修改目录。安装器使用 INT8 多语言 SenseVoiceSmall 与 TEN-VAD；TEN-VAD 仅支持 16 kHz 音频，商用前请确认上游许可证。

## 验证

```bash
vp check
vp test
vp pack
```
