import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';

import { Stimulus } from '@ciels/core';

import { fetchBilibiliFlvUrl } from './api.ts';
import { JpegStreamParser } from './jpeg-stream.ts';
import { BilibiliAudio, bilibiliLiveSignals, BilibiliVideo } from './signals.ts';
import type {
  BilibiliLiveCloseListener,
  BilibiliLiveErrorListener,
  BilibiliLiveHealth,
  BilibiliLiveOptions,
  BilibiliLiveStderrListener,
} from './types.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

type State = BilibiliLiveHealth['state'];

/** 将一个 Bilibili 直播间作为 Ciel 的音视频 Stimulus。 */
export class BilibiliLive extends Stimulus<typeof bilibiliLiveSignals> {
  static readonly meta = {
    name: 'Bilibili 直播间',
    description: '正在浏览的 Bilibili 直播间及其连续音视频内容',
  };

  readonly signals = bilibiliLiveSignals;
  readonly roomId: number;
  private readonly options: Required<
    Pick<BilibiliLiveOptions, 'ffmpegPath' | 'imageInterval' | 'stopTimeout'>
  > &
    BilibiliLiveOptions;
  private readonly jpeg = new JpegStreamParser();
  private readonly errorListeners = new Set<BilibiliLiveErrorListener>();
  private readonly closeListeners = new Set<BilibiliLiveCloseListener>();
  private readonly stderrListeners = new Set<BilibiliLiveStderrListener>();
  private process?: ChildProcess;
  private closePromise?: Promise<void>;
  private resolveClose?: () => void;
  private state: State = 'idle';
  private startedAt?: Date;
  private lastAudioAt?: Date;
  private lastImageAt?: Date;
  private audioBytes = 0;
  private audioChunks = 0;
  private imageFrames = 0;
  private processStarts = 0;
  private lastExitCode?: number | null;
  private lastExitSignal?: NodeJS.Signals | null;
  private audioSampleCount = 0;

  constructor(options: BilibiliLiveOptions) {
    super();
    assertOptions(options);
    this.roomId = options.roomId;
    this.options = {
      ...options,
      ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
      imageInterval: options.imageInterval ?? 60_000 / 9,
      stopTimeout: options.stopTimeout ?? 5_000,
    };
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error('BilibiliLive has already started');
    this.state = 'starting';
    try {
      const url = await fetchBilibiliFlvUrl(this.roomId, this.options.api);
      this.startUrl(url);
    } catch (error) {
      this.state = 'idle';
      throw error;
    }
  }

  /** 使用已经取得的签名地址开始浏览，主要用于受控接入和测试。 */
  startUrl(url: string): void {
    if (this.process) throw new Error('BilibiliLive is already running');
    if (this.state !== 'idle' && this.state !== 'starting') {
      throw new Error('BilibiliLive cannot start in its current state');
    }

    this.resetSession();
    const process = spawn(
      this.options.ffmpegPath,
      createFFmpegArgs(this.roomId, url, this.options),
      { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] },
    );
    this.process = process;
    this.processStarts += 1;
    this.state = 'running';
    this.startedAt = new Date();
    this.closePromise = new Promise(resolve => {
      this.resolveClose = resolve;
    });

    process.stdout?.on('data', chunk => this.consumeAudio(Buffer.from(chunk)));
    const imageStream = process.stdio[3] as Readable | null;
    imageStream?.on('data', chunk => this.consumeImages(Buffer.from(chunk)));
    process.stderr?.on('data', chunk => {
      const message = redactUrl(Buffer.from(chunk).toString().trim());
      if (message && !message.includes('deprecated pixel format used')) {
        for (const listener of this.stderrListeners) listener(message);
      }
    });
    process.on('error', error => this.emitError(error));
    process.on('close', (code, signal) => this.handleClose(process, code, signal));
  }

  async stop(): Promise<void> {
    if (this.state === 'idle') return;
    const process = this.process;
    const closePromise = this.closePromise;
    if (!process || !closePromise) {
      this.state = 'idle';
      return;
    }

    this.state = 'stopping';
    if (!process.kill('SIGTERM')) throw new Error('Failed to stop FFmpeg');
    if (
      !(await waitWithTimeout(closePromise, this.options.stopTimeout)) &&
      this.process === process
    ) {
      process.kill('SIGKILL');
      await waitWithTimeout(closePromise, this.options.stopTimeout);
    }
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  getHealth(): BilibiliLiveHealth {
    return {
      state: this.state,
      startedAt: this.startedAt,
      lastAudioAt: this.lastAudioAt,
      lastImageAt: this.lastImageAt,
      audioBytes: this.audioBytes,
      audioChunks: this.audioChunks,
      imageFrames: this.imageFrames,
      processStarts: this.processStarts,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
    };
  }

  onError(listener: BilibiliLiveErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onClose(listener: BilibiliLiveCloseListener): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onStderr(listener: BilibiliLiveStderrListener): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  private consumeAudio(buffer: Buffer): void {
    const startAt = new Date(this.startedAt!.getTime() + (this.audioSampleCount / 16_000) * 1_000);
    this.audioSampleCount += Math.floor(buffer.byteLength / 2);
    const endAt = new Date(this.startedAt!.getTime() + (this.audioSampleCount / 16_000) * 1_000);
    this.lastAudioAt = new Date();
    this.audioBytes += buffer.byteLength;
    this.audioChunks += 1;
    void this.send(new BilibiliAudio({ data: buffer, startAt, endAt })).catch(error =>
      this.emitError(toError(error)),
    );
  }

  private consumeImages(buffer: Buffer): void {
    for (const image of this.jpeg.push(buffer)) {
      const timestamp = new Date();
      this.lastImageAt = timestamp;
      this.imageFrames += 1;
      void this.send(new BilibiliVideo({ data: image, timestamp })).catch(error =>
        this.emitError(toError(error)),
      );
    }
  }

  private handleClose(
    process: ChildProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (this.process !== process) return;
    this.process = undefined;
    this.state = 'idle';
    this.lastExitCode = code;
    this.lastExitSignal = signal;
    this.jpeg.clear();
    this.resolveClose?.();
    this.resolveClose = undefined;
    this.closePromise = undefined;
    for (const listener of this.closeListeners) listener(code, signal);
  }

  private resetSession(): void {
    this.jpeg.clear();
    this.audioSampleCount = 0;
    this.startedAt = undefined;
    this.lastAudioAt = undefined;
    this.lastImageAt = undefined;
    this.audioBytes = 0;
    this.audioChunks = 0;
    this.imageFrames = 0;
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

export function createBilibiliLive(options: BilibiliLiveOptions): BilibiliLive {
  return new BilibiliLive(options);
}

function createFFmpegArgs(
  roomId: number,
  url: string,
  options: Pick<BilibiliLiveOptions, 'imageInterval'>,
): string[] {
  const framesPerMinute = 60_000 / options.imageInterval!;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-reconnect',
    '1',
    '-reconnect_at_eof',
    '1',
    '-reconnect_on_network_error',
    '1',
    '-reconnect_on_http_error',
    '4xx,5xx',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-user_agent',
    USER_AGENT,
    '-referer',
    `https://live.bilibili.com/${roomId}`,
    '-headers',
    'Origin: https://live.bilibili.com\r\n',
    '-i',
    url,
    '-map',
    '0:a:0?',
    '-vn',
    '-acodec',
    'pcm_s16le',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    's16le',
    'pipe:1',
    '-map',
    '0:v:0?',
    '-an',
    '-vf',
    `fps=${framesPerMinute}/60,scale=1280:-2`,
    '-q:v',
    '4',
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    'pipe:3',
  ];
}

function redactUrl(message: string): string {
  return message.replace(/https?:\/\/\S+/giu, '[REDACTED_URL]');
}

function waitWithTimeout(promise: Promise<void>, timeout: number): Promise<boolean> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeout);
    void promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function assertOptions(options: BilibiliLiveOptions): void {
  if (!Number.isSafeInteger(options.roomId) || options.roomId <= 0) {
    throw new Error('roomId must be a positive safe integer');
  }
  if (
    options.imageInterval !== undefined &&
    (!Number.isFinite(options.imageInterval) || options.imageInterval <= 0)
  ) {
    throw new Error('imageInterval must be a positive finite number');
  }
  if (
    options.stopTimeout !== undefined &&
    (!Number.isFinite(options.stopTimeout) || options.stopTimeout <= 0)
  ) {
    throw new Error('stopTimeout must be a positive finite number');
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
