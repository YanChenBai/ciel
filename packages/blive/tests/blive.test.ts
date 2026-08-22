import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  fetchBilibiliFlvUrl: vi.fn<(roomId: number) => Promise<string>>(),
  spawn: vi.fn(),
}));

vi.mock('../src/api.ts', () => ({
  fetchBilibiliFlvUrl: mocks.fetchBilibiliFlvUrl,
}));

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));

import { BilibiliAudio, BilibiliLive, BilibiliVideo } from '../src/index.ts';

interface FakeFFmpeg extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  image: PassThrough;
  stdio: Array<PassThrough | null>;
  kill: ReturnType<typeof vi.fn>;
}

const ROOM_ID = 24_680;
const STREAM_URL = 'https://cdn.example.test/live.flv?token=secret';
let ffmpeg: FakeFFmpeg;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T00:00:00.000Z'));
  ffmpeg = createFakeFFmpeg();
  mocks.fetchBilibiliFlvUrl.mockResolvedValue(STREAM_URL);
  mocks.spawn.mockReturnValue(ffmpeg as unknown as ChildProcess);
});

afterEach(() => {
  vi.useRealTimers();
  ffmpeg.stdout.destroy();
  ffmpeg.stderr.destroy();
  ffmpeg.image.destroy();
});

describe('BilibiliLive', () => {
  it('以 Stimulus 形式启动 Bilibili FLV，并配置音频与每分钟九帧', async () => {
    const live = new BilibiliLive({ roomId: ROOM_ID });

    await live.start();

    expect(live.signals).toEqual([BilibiliAudio, BilibiliVideo]);
    expect(mocks.fetchBilibiliFlvUrl).toHaveBeenCalledWith(ROOM_ID, undefined);
    const [command, args, options] = mocks.spawn.mock.calls[0] as unknown as [
      string,
      string[],
      { stdio: string[] },
    ];
    expect(command).toBe('ffmpeg');
    expect(args.slice(args.indexOf('-i'), args.indexOf('-i') + 2)).toEqual(['-i', STREAM_URL]);
    expect(args[args.indexOf('-vf') + 1]).toBe('fps=9/60,scale=1280:-2');
    expect(args[args.indexOf('-referer') + 1]).toBe(`https://live.bilibili.com/${ROOM_ID}`);
    expect(args).not.toContain('nobuffer');
    expect(args).not.toContain('low_delay');
    expect(args[args.indexOf('-reconnect_streamed') + 1]).toBe('1');
    expect(options.stdio).toEqual(['ignore', 'pipe', 'pipe', 'pipe']);
    expect(live.isRunning()).toBe(true);
  });

  it('把 PCM 与跨 chunk JPEG 转换为声明过的 Echo 和 Photon', async () => {
    const live = new BilibiliLive({ roomId: ROOM_ID });
    const signals: Array<BilibiliAudio | BilibiliVideo> = [];
    live.on('data', signal => signals.push(signal));
    await live.start();

    ffmpeg.stdout.emit('data', Buffer.alloc(3_200));
    ffmpeg.image.emit('data', Buffer.from([0x00, 0xff]));
    ffmpeg.image.emit('data', Buffer.from([0xd8, 0x01, 0x02]));
    ffmpeg.image.emit('data', Buffer.from([0x03, 0xff, 0xd9, 0x00]));
    await vi.waitFor(() => expect(signals).toHaveLength(2));

    expect(signals[0]).toBeInstanceOf(BilibiliAudio);
    expect(signals[0]).toMatchObject({
      type: 'echo',
      startAt: new Date('2026-08-11T00:00:00.000Z'),
      endAt: new Date('2026-08-11T00:00:00.100Z'),
    });
    expect(signals[1]).toBeInstanceOf(BilibiliVideo);
    expect(signals[1]).toMatchObject({
      type: 'photon',
      data: Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0xff, 0xd9]),
    });
    expect(live.getHealth()).toMatchObject({
      audioBytes: 3_200,
      audioChunks: 1,
      imageFrames: 1,
      state: 'running',
    });
  });

  it('清理签名 URL 日志并等待 FFmpeg 停止', async () => {
    const live = new BilibiliLive({ roomId: ROOM_ID });
    const messages: string[] = [];
    live.onStderr(message => messages.push(message));
    await live.start();
    ffmpeg.stderr.emit('data', Buffer.from(`Failed to open ${STREAM_URL}`));
    expect(messages).toEqual(['Failed to open [REDACTED_URL]']);

    const stopping = live.stop();
    expect(ffmpeg.kill).toHaveBeenCalledWith('SIGTERM');
    ffmpeg.emit('close', 0, 'SIGTERM');
    await stopping;

    expect(live.isRunning()).toBe(false);
    expect(live.getHealth()).toMatchObject({
      state: 'idle',
      lastExitCode: 0,
      lastExitSignal: 'SIGTERM',
    });
  });
});

function createFakeFFmpeg(): FakeFFmpeg {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const image = new PassThrough();
  return Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    image,
    stdio: [null, stdout, stderr, image],
    kill: vi.fn(() => true),
  });
}
