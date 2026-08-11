# @ciels/asr

Streaming speech perception for Ciel, built on `sherpa-onnx-node`.

The package owns PCM buffering, TEN-VAD segmentation, offline SenseVoiceSmall recognition, token timestamps, speaker embeddings, registered voiceprints, and anonymous speaker clustering. It accepts raw audio segments and returns ASR results without depending on Ciel signal or perception classes.

## API

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

Input must be 16 kHz mono signed 16-bit little-endian PCM.

## Models

Install the ASR, VAD, and speaker models:

```bash
vp run asr:install
vp run asr:install -- --force
```

Create a voiceprint from one or more 16 kHz WAV files:

```bash
vp run asr:voiceprint -- --output alice.voiceprint ./samples/alice.wav
```

Models and voiceprints are stored below `.ciel-data` unless `CIEL_DATA_DIR` is set.
The installer uses the INT8 multilingual SenseVoiceSmall model with inverse text normalization and Sherpa's metadata-enhanced INT8 TEN-VAD model. TEN-VAD supports only 16 kHz audio; review its upstream license before commercial use.

## Development

Tests live in `tests/`.

```bash
vp check
vp test
vp pack
```
