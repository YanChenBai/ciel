// @env node

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';

import { defineEcho, definePhoton } from '@ciels/sensu';
import { definePlugin } from 'corex';
import type { AnySignal, EmitSignal } from 'corex';

import { fetchFlvUrl } from './bilibili.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

export const LiveAudio = defineEcho({
  name: 'blive.audio',
  description: '16kHz 单声道 PCM 直播音频',
});
export const LiveVideo = definePhoton({ name: 'blive.video', description: '直播 JPEG 变化帧' });

export class LiveMedia {
  private process?: ChildProcess;
  private emit?: EmitSignal;
  private startedAt = 0;
  private samples = 0;
  private jpegBuffer = Buffer.alloc(0);
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly onError?: (error: Error) => void) {}

  bind(emit: EmitSignal): void {
    this.emit = emit;
  }

  async open(roomId: number): Promise<void> {
    await this.close();
    const url = await fetchFlvUrl(roomId);
    const child = spawn(process.env.FFMPEG_PATH?.trim() || 'ffmpeg', ffmpegArgs(roomId, url), {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    this.startedAt = Date.now();
    this.samples = 0;
    let lastError = '';
    child.stdout?.on('data', chunk => {
      if (this.process === child) this.audio(Buffer.from(chunk));
    });
    const images = child.stdio[3] as Readable | null;
    images?.on('data', chunk => {
      if (this.process === child) this.images(Buffer.from(chunk));
    });
    child.stderr?.on('data', chunk => {
      const text = Buffer.from(chunk)
        .toString()
        .trim()
        .replace(/https?:\/\/\S+/giu, '[URL]');
      if (text && !text.includes('deprecated pixel format'))
        console.warn(`[watch-blive:ffmpeg] ${text}`);
      if (text) lastError = text;
    });
    child.on('error', error => {
      console.error('[watch-blive:ffmpeg]', error);
      this.onError?.(error);
    });
    child.on('close', (code, signal) => {
      if (this.process !== child) return;
      this.process = undefined;
      if (code === 0) return;
      this.onError?.(
        new Error(
          `FFmpeg 异常退出（code=${String(code)}, signal=${String(signal)}）${lastError ? `：${lastError}` : ''}`,
        ),
      );
    });
  }

  async close(): Promise<void> {
    const process = this.process;
    this.process = undefined;
    if (process && !process.killed) process.kill('SIGTERM');
    await Promise.allSettled(this.pending);
    this.jpegBuffer = Buffer.alloc(0);
  }

  private audio(data: Buffer): void {
    const start = this.startedAt + (this.samples / 16_000) * 1_000;
    this.samples += Math.floor(data.byteLength / 2);
    this.publish(
      LiveAudio.create(
        { data },
        { kind: 'interval', start, end: this.startedAt + (this.samples / 16_000) * 1_000 },
      ),
    );
  }

  private images(data: Buffer): void {
    this.jpegBuffer = Buffer.concat([this.jpegBuffer, data]);
    while (true) {
      const start = this.jpegBuffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (start < 0) return;
      const end = this.jpegBuffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) {
        if (start > 0) this.jpegBuffer = this.jpegBuffer.subarray(start);
        return;
      }
      const image = this.jpegBuffer.subarray(start, end + 2);
      this.jpegBuffer = this.jpegBuffer.subarray(end + 2);
      this.publish(LiveVideo.create({ data: image }, { kind: 'instant', at: Date.now() }));
    }
  }

  private publish(signal: AnySignal): void {
    if (!this.emit) return;
    const pending = Promise.resolve(this.emit(signal)).catch(error => {
      console.error('[watch-blive:media]', error);
    });
    this.pending.add(pending);
    void pending.then(() => this.pending.delete(pending));
  }
}

export const liveMediaPlugin = definePlugin((media: LiveMedia) => ({
  name: 'blive-media-source',
  create() {
    return {
      activate(context: { emitSignal: EmitSignal }) {
        media.bind(context.emitSignal);
      },
      deactivate: () => media.close(),
    };
  },
}));

export function ffmpegArgs(roomId: number, url: string): string[] {
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
    'fps=9/60,scale=1280:-2',
    '-q:v',
    '4',
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    'pipe:3',
  ];
}
