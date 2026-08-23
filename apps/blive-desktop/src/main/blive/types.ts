// @env node

import type { ChildProcess } from 'node:child_process';

export interface BilibiliApiRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly retryLimit?: number;
  readonly retryBackoffMs?: number;
}

export interface BilibiliLiveOptions {
  readonly roomId: number;
  readonly api?: BilibiliApiRequestOptions;
  readonly ffmpegPath?: string;
  /** FFmpeg 输出 Photon 的间隔。默认每分钟九帧，与 Oculus 3×3 拼图保持一致。 */
  readonly imageInterval?: number;
  readonly stopTimeout?: number;
}

export interface BilibiliLiveHealth {
  readonly state: 'idle' | 'starting' | 'running' | 'stopping';
  readonly startedAt?: Date;
  readonly lastAudioAt?: Date;
  readonly lastImageAt?: Date;
  readonly audioBytes: number;
  readonly audioChunks: number;
  readonly imageFrames: number;
  readonly processStarts: number;
  readonly lastExitCode?: number | null;
  readonly lastExitSignal?: NodeJS.Signals | null;
}

export type BilibiliLiveErrorListener = (error: Error) => void;
export type BilibiliLiveCloseListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;
export type BilibiliLiveStderrListener = (message: string) => void;

export type SpawnFFmpeg = (
  command: string,
  args: readonly string[],
  options: { readonly stdio: readonly ['ignore', 'pipe', 'pipe', 'pipe'] },
) => ChildProcess;
