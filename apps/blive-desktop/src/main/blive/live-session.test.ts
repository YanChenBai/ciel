// @env node

import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const state = vi.hoisted(() => ({
  instances: [] as Array<{
    emitClose(): void;
    emitData(signal: unknown): void;
    emitStderr(message: string): void;
    roomId: number;
  }>,
}));

vi.mock('./live.ts', async importOriginal => {
  const actual = await importOriginal<typeof import('./live.ts')>();
  class FakeBilibiliLive {
    readonly roomId: number;
    private readonly closeListeners = new Set<(code: number | null, signal: null) => void>();
    private readonly dataListeners = new Set<(signal: unknown) => void>();
    private readonly errorListeners = new Set<(error: Error) => void>();
    private readonly stderrListeners = new Set<(message: string) => void>();

    constructor(options: { roomId: number }) {
      this.roomId = options.roomId;
      state.instances.push(this);
    }

    start(): Promise<void> {
      return Promise.resolve();
    }

    stop(): Promise<void> {
      for (const listener of this.closeListeners) listener(0, null);
      return Promise.resolve();
    }

    emitData(signal: unknown): void {
      for (const listener of this.dataListeners) listener(signal);
    }

    emitClose(): void {
      for (const listener of this.closeListeners) listener(1, null);
    }

    emitStderr(message: string): void {
      for (const listener of this.stderrListeners) listener(message);
    }

    onClose(listener: (code: number | null, signal: null) => void): () => void {
      this.closeListeners.add(listener);
      return () => this.closeListeners.delete(listener);
    }

    on(_event: 'data', listener: (signal: unknown) => void): () => void {
      this.dataListeners.add(listener);
      return () => this.dataListeners.delete(listener);
    }

    onError(listener: (error: Error) => void): () => void {
      this.errorListeners.add(listener);
      return () => this.errorListeners.delete(listener);
    }

    onStderr(listener: (message: string) => void): () => void {
      this.stderrListeners.add(listener);
      return () => this.stderrListeners.delete(listener);
    }
  }

  return { ...actual, BilibiliLive: FakeBilibiliLive };
});

const { BilibiliAudio } = await import('./signals.ts');
const { BilibiliLiveSession } = await import('./live-session.ts');

beforeEach(() => {
  state.instances.length = 0;
});

describe('BilibiliLiveSession', () => {
  it('切换直播间前等待旧房间信号处理完成，并给 stderr 标注房间号', async () => {
    const session = new BilibiliLiveSession();
    let releaseSignal: (() => void) | undefined;
    const signalHandled = new Promise<void>(resolve => {
      releaseSignal = resolve;
    });
    const stderr: Array<[number, string]> = [];
    session.on('data', () => signalHandled);
    session.onStderr((roomId, message) => stderr.push([roomId, message]));

    session.start();
    await session.open(100);
    state.instances[0]!.emitStderr('old-room-error');
    state.instances[0]!.emitData(
      new BilibiliAudio({ data: Buffer.alloc(2), startAt: new Date(0), endAt: new Date(1) }),
    );

    let switched = false;
    const switching = session.open(200).then(() => {
      switched = true;
    });
    await Promise.resolve();
    expect(switched).toBe(false);
    expect(stderr).toEqual([[100, 'old-room-error']]);

    releaseSignal?.();
    await switching;
    expect(state.instances.map(instance => instance.roomId)).toEqual([100, 200]);
    await session.stop();
  });

  it('旧直播流意外关闭后仍等待在途信号再打开新房间', async () => {
    const session = new BilibiliLiveSession();
    let releaseSignal: (() => void) | undefined;
    const signalHandled = new Promise<void>(resolve => {
      releaseSignal = resolve;
    });
    session.on('data', () => signalHandled);

    session.start();
    await session.open(100);
    state.instances[0]!.emitData(
      new BilibiliAudio({ data: Buffer.alloc(2), startAt: new Date(0), endAt: new Date(1) }),
    );
    state.instances[0]!.emitClose();

    let switched = false;
    const switching = session.open(200).then(() => {
      switched = true;
    });
    await Promise.resolve();
    expect(switched).toBe(false);

    releaseSignal?.();
    await switching;
    expect(state.instances.map(instance => instance.roomId)).toEqual([100, 200]);
    await session.stop();
  });
});
