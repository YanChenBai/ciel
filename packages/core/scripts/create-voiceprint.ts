// @env node

import { access } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import sherpaOnnx from 'sherpa-onnx-node';
import type { SpeakerEmbeddingExtractor as SpeakerEmbeddingExtractorInstance } from 'sherpa-onnx-node';

import { AURIS_SAMPLE_RATE } from '../src/auris/constants.ts';
import { createAurisModelConfig } from '../src/auris/models.ts';
import { averageEmbeddings, writeVoiceprint } from '../src/auris/voiceprint.ts';

const { SpeakerEmbeddingExtractor, readWave } = sherpaOnnx;
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

const { positionals, values } = parseArgs({
  args,
  allowPositionals: true,
  options: {
    output: { type: 'string', short: 'o' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

if (values.help) {
  printHelp();
} else {
  const output = values.output;
  if (!output) fail('--output is required');
  if (positionals.length === 0) fail('at least one WAV sample is required');
  await Promise.all(positionals.map(file => access(file)));

  const extractor = new SpeakerEmbeddingExtractor(createAurisModelConfig().speaker);
  const embeddings = positionals.map(file => computeEmbedding(extractor, file));
  const target = writeVoiceprint(output, averageEmbeddings(embeddings));
  process.stdout.write(
    JSON.stringify({
      type: 'voiceprint',
      output: target,
      samples: positionals.length,
      dimensions: extractor.dim,
    }) + '\n',
  );
}

function computeEmbedding(
  extractor: SpeakerEmbeddingExtractorInstance,
  file: string,
): Float32Array {
  const wave = readWave(file);
  if (wave.sampleRate !== AURIS_SAMPLE_RATE) {
    throw new Error(file + ' must use a 16000 Hz sample rate');
  }
  const stream = extractor.createStream();
  stream.acceptWaveform(wave);
  if (!extractor.isReady(stream)) {
    throw new Error(file + ' is too short to create a voiceprint');
  }
  return extractor.compute(stream);
}

function printHelp(): void {
  process.stdout.write(
    'Usage: vp run auris:voiceprint -- --output <file> <sample.wav...>\n\n' +
      'The voiceprint is written into .ciel-data/voiceprints.\n',
  );
}

function fail(message: string): never {
  process.stderr.write(message + '\n');
  process.exit(2);
}
