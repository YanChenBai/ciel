import { BilibiliLive, bilibiliLiveSignals } from '@ciels/blive';
import { Stimulus } from '@ciels/core';

interface LiveSessionCloseEvent {
  readonly code: number | null;
  readonly expected: boolean;
  readonly roomId: number;
  readonly signal: NodeJS.Signals | null;
}

/** 在不重建 Ciel/Nucleus 的前提下切换当前直播音视频源。 */
export class BilibiliLiveSession extends Stimulus<typeof bilibiliLiveSignals> {
  static readonly meta = {
    name: '场景',
    description: '自主探索中当前正在浏览的 Bilibili 直播间及其连续音视频内容',
  };

  readonly signals = bilibiliLiveSignals;
  private readonly closeListeners = new Set<(event: LiveSessionCloseEvent) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly stderrListeners = new Set<(message: string) => void>();
  private current?: BilibiliLive;
  private currentUnsubscribers: (() => void)[] = [];
  private expectedClosing?: BilibiliLive;
  private running = false;

  constructor(private readonly ffmpegPath?: string) {
    super();
  }

  start(): void {
    if (this.running) throw new Error('BilibiliLiveSession has already started');
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.closeCurrent();
  }

  async open(roomId: number): Promise<void> {
    if (!this.running) throw new Error('BilibiliLiveSession is not running');
    await this.closeCurrent();
    const live = new BilibiliLive({
      roomId,
      ...(this.ffmpegPath ? { ffmpegPath: this.ffmpegPath } : {}),
    });
    this.current = live;
    this.currentUnsubscribers = [
      live.on('data', signal => {
        void this.send(signal).catch(error => this.emitError(toError(error)));
      }),
      live.onError(error => this.emitError(error)),
      live.onStderr(message => {
        for (const listener of this.stderrListeners) listener(message);
      }),
      live.onClose((code, signal) => this.handleClose(live, code, signal)),
    ];
    try {
      await live.start();
    } catch (error) {
      this.cleanup(live);
      throw error;
    }
  }

  onClose(listener: (event: LiveSessionCloseEvent) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onStderr(listener: (message: string) => void): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  private async closeCurrent(): Promise<void> {
    const live = this.current;
    if (!live) return;
    this.expectedClosing = live;
    try {
      await live.stop();
    } finally {
      this.cleanup(live);
    }
  }

  private handleClose(
    live: BilibiliLive,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    const event = {
      code,
      expected: this.expectedClosing === live,
      roomId: live.roomId,
      signal,
    };
    this.cleanup(live);
    for (const listener of this.closeListeners) listener(event);
  }

  private cleanup(live: BilibiliLive): void {
    if (this.current !== live) return;
    this.current = undefined;
    if (this.expectedClosing === live) this.expectedClosing = undefined;
    this.currentUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.currentUnsubscribers = [];
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
