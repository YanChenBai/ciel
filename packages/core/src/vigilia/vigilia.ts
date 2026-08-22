import { VigiliaJournal } from './journal.ts';
import type { VigiliaJournalOptions } from './journal.ts';
import { serializeError } from './serialize.ts';
import type {
  VigiliaEventDataMap,
  VigiliaEventQuery,
  VigiliaEventType,
  VigiliaJsonValue,
  VigiliaSnapshot,
  VigiliaSubscriber,
} from './types.ts';

export interface VigiliaOptions extends VigiliaJournalOptions {
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
export class Vigilia {
  readonly capturePerceptContent: boolean;
  readonly capture: VigiliaCapturePolicy;
  readonly signals: boolean;
  readonly projectThought?: (output: unknown) => VigiliaJsonValue | undefined;
  private readonly journal: VigiliaJournal;

  constructor(options: VigiliaOptions = {}) {
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
  }

  record<TType extends VigiliaEventType>(type: TType, data: VigiliaEventDataMap[TType]) {
    return this.journal.record(type, data);
  }

  error(source: string, phase: string, input: unknown): void {
    this.record('error.observed', { error: serializeError(input), phase, source });
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
