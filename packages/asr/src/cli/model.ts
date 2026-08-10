import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import { DATA_PATH } from '../constants.ts';
import { loading, progress } from './utils/index.ts';

const RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';
const ASR_ARCHIVE = 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2';
const ASR_URL = RELEASE + '/asr-models/' + ASR_ARCHIVE;
const VAD_URL = RELEASE + '/asr-models/silero_vad.onnx';
const SPEAKER_URL =
  RELEASE +
  '/speaker-recongition-models/' +
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx';

export async function installModel(args: readonly string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(
      'Usage: vp run asr:install -- [--force]\n\n' +
        'Models are installed into .ciel-data/models.\n',
    );
    return;
  }

  await installModels(values.force);
}

async function installModels(force: boolean): Promise<void> {
  const modelsDir = path.join(DATA_PATH, 'models');
  const downloadsDir = path.join(DATA_PATH, 'downloads');
  const asrDir = path.join(modelsDir, 'asr');
  const vadFile = path.join(modelsDir, 'vad', 'silero_vad.onnx');
  const speakerFile = path.join(modelsDir, 'speaker', 'model.onnx');

  await mkdir(downloadsDir, { recursive: true });
  const archive = path.join(downloadsDir, ASR_ARCHIVE);
  if (force || !(await exists(path.join(asrDir, 'tokens.txt')))) {
    await download(ASR_URL, archive);
    const temporaryAsrDir = asrDir + '.installing';
    await rm(temporaryAsrDir, { recursive: true, force: true });
    await mkdir(temporaryAsrDir, { recursive: true });
    await extractArchive(archive, temporaryAsrDir);
    if (!(await exists(path.join(temporaryAsrDir, 'tokens.txt')))) {
      throw new Error('The ASR archive does not contain tokens.txt');
    }
    await rm(asrDir, { recursive: true, force: true });
    await rename(temporaryAsrDir, asrDir);
    await rm(archive, { force: true });
  } else {
    process.stdout.write('ASR model already installed\n');
  }

  await installFile(VAD_URL, vadFile, force);
  await installFile(SPEAKER_URL, speakerFile, force);
  process.stdout.write('ASR models installed in ' + modelsDir + '\n');
}

async function installFile(url: string, target: string, force: boolean): Promise<void> {
  if (!force && (await exists(target))) {
    process.stdout.write(path.basename(target) + ' already installed\n');
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.part';
  await download(url, temporary);
  await rm(target, { force: true });
  await rename(temporary, target);
}

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }

  const name = path.basename(target).replace(/\.part$/, '');
  const total = Number(response.headers.get('content-length'));
  const source = Readable.fromWeb(response.body as never);
  if (Number.isFinite(total) && total > 0) {
    let current = 0;
    process.stdout.write('Downloading ' + name + '\n');
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        current += chunk.length;
        progress(current, total);
        callback(null, chunk);
      },
    });
    await pipeline(source, meter, createWriteStream(target));
    if (current < total) progress(total, total);
    return;
  }

  const stop = loading('Downloading ' + name);
  try {
    await pipeline(source, createWriteStream(target));
  } finally {
    stop();
  }
}

async function extractArchive(archive: string, target: string): Promise<void> {
  const stop = loading('Extracting ' + path.basename(archive));
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-xjf', archive, '-C', target, '--strip-components=1'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', reject);
      child.once('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`tar exited with status ${code}`));
      });
    });
  } finally {
    stop();
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
