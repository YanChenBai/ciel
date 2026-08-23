import path from 'node:path';

import { VigiliaJournal } from './journal.ts';
import type { VigiliaJournalOptions } from './journal.ts';
import type { VigiliaObservation, VigiliaSink, VigiliaSource } from './observability/index.ts';
import { VigiliaObservationRecorder } from './observation-recorder.ts';
import type {
  VigiliaEventQuery,
  VigiliaJsonValue,
  VigiliaSnapshot,
  VigiliaSubscriber,
} from './types.ts';

export interface VigiliaOptions extends VigiliaJournalOptions {
  /** 可观测媒体文件根目录；Journal 只保存相对此目录的路径。 */
  readonly assetRoot?: string;
  /** 控制哪些可能敏感或体积较大的值可以进入 Journal。 */
  readonly capture?: {
    readonly context?: boolean;
    readonly memory?: boolean;
    readonly reasoning?: boolean;
    readonly result?: boolean;
    readonly toolInput?: boolean;
    readonly toolOutput?: boolean;
  };
  readonly capturePerceptContent?: boolean;
  readonly signals?: boolean;
  readonly projectThought?: (output: unknown) => VigiliaJsonValue | undefined;
}

export interface VigiliaCapturePolicy {
  readonly context: boolean;
  readonly memory: boolean;
  readonly reasoning: boolean;
  readonly result: boolean;
  readonly toolInput: boolean;
  readonly toolOutput: boolean;
}

/**
 * 单个 Ciel 运行时的可观测性门面。
 *
 * Vigilia 只记录运行时事实，不能反向成为感知或认知决策的依赖。
 */
export class Vigilia implements VigiliaSink {
  readonly assetRoot?: string;
  readonly capturePerceptContent: boolean;
  readonly capture: VigiliaCapturePolicy;
  readonly signals: boolean;
  readonly projectThought?: (output: unknown) => VigiliaJsonValue | undefined;
  private readonly journal: VigiliaJournal;
  private readonly observationRecorder: VigiliaObservationRecorder;

  constructor(options: VigiliaOptions = {}) {
    this.assetRoot = options.assetRoot ? path.resolve(options.assetRoot) : undefined;
    // 内容捕获默认关闭，避免提示词、记忆和工具数据在无意间泄露。
    this.capturePerceptContent = options.capturePerceptContent ?? false;
    this.capture = Object.freeze({
      context: options.capture?.context ?? false,
      memory: options.capture?.memory ?? false,
      reasoning: options.capture?.reasoning ?? false,
      result: options.capture?.result ?? false,
      toolInput: options.capture?.toolInput ?? false,
      toolOutput: options.capture?.toolOutput ?? false,
    });
    this.signals = options.signals ?? true;
    this.projectThought = options.projectThought;
    this.journal = new VigiliaJournal(options);
    this.observationRecorder = new VigiliaObservationRecorder({
      assetPath: filePath => this.assetPath(filePath),
      capture: this.capture,
      capturePerceptContent: this.capturePerceptContent,
      projectThought: this.projectThought,
      record: (type, data) => {
        this.journal.record(type, data);
      },
      signals: this.signals,
    });
  }

  assetPath(filePath: string): string | undefined {
    if (!this.assetRoot) return undefined;
    const relative = path.relative(this.assetRoot, path.resolve(filePath));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
    return relative.replaceAll('\\', '/');
  }

  observe(observation: VigiliaObservation): void {
    this.observationRecorder.observe(observation);
  }

  connect(source: VigiliaSource): () => void {
    return source.subscribe(observation => this.observe(observation));
  }

  events(query?: VigiliaEventQuery) {
    return this.journal.events(query);
  }

  snapshot(): VigiliaSnapshot {
    return this.journal.snapshot();
  }

  subscribe(subscriber: VigiliaSubscriber): () => void {
    return this.journal.subscribe(subscriber);
  }
}
