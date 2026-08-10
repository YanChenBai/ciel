# @ciels/asr

Streaming speech recognition for Ciel, built on `sherpa-onnx-node`.

The package owns PCM buffering, Silero VAD, online recognition, token timestamps, speaker embeddings, registered voiceprints, and anonymous speaker clustering. It accepts raw audio segments and returns ASR results without depending on Ciel signal or perception classes.

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

## Development

Tests live in `tests/`.

```bash
vp check
vp test
vp pack
```
