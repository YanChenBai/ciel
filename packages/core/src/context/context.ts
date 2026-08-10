import { EventHost } from '@ciels/event';

import type { Percept } from '#percepts';
import type { SignalConstructor } from '#signals';
import type { Stimulus, StimulusConstructor } from '#src/stimulus/index.ts';

import { DEFAULT_PERCEPT_WINDOW } from './constants.ts';
import type {
  ContextData,
  ContextDefinition,
  ContextDefinitionInput,
  ContextEventMap,
  ContextOptions,
  ContextSnapshot,
  ContextTime,
} from './types.ts';

function getPerceptTime(percept: Percept): ContextTime {
  if (percept.type === 'reading') {
    return {
      startAt: percept.timestamp,
      endAt: percept.timestamp,
    };
  }

  return {
    startAt: percept.startAt,
    endAt: percept.endAt,
  };
}

/**
 * 单个 Stimulus 的工作上下文，只保存受信任定义与时间窗口内的实时感知。
 */
export class Context extends EventHost<ContextEventMap> {
  private readonly signalDefinitions = new Map<SignalConstructor, ContextDefinition>();
  private readonly definitions: ContextDefinition[];
  private readonly perceptWindow: number;
  private readonly entries: ContextData[] = [];

  constructor(stimulus: Stimulus, options: ContextOptions = {}) {
    super();

    const Stimulus = stimulus.constructor as StimulusConstructor;
    Stimulus.assertMeta();

    const scene: ContextDefinition = {
      kind: 'scene',
      name: Stimulus.meta.name,
      description: Stimulus.meta.description,
    };
    const signals = stimulus.signals.map(Signal => {
      Signal.assertMeta();
      const definition: ContextDefinition = {
        kind: 'signal',
        name: Signal.meta.name,
        description: Signal.meta.description,
      };
      this.signalDefinitions.set(Signal, definition);
      return definition;
    });

    const perceptWindow = options.perceptWindow ?? DEFAULT_PERCEPT_WINDOW;
    if (!Number.isFinite(perceptWindow) || perceptWindow <= 0) {
      throw new Error('context.perceptWindow must be a positive finite number');
    }

    const customDefinitions = (options.definitions ?? []).map<ContextDefinition>(definition => ({
      kind: 'custom',
      ...definition,
    }));
    this.definitions = [...customDefinitions, scene, ...signals];
    this.perceptWindow = perceptWindow;
  }

  /**
   * 当前窗口内尚未过期的感知数量。
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * 将一条感知转换为 Context 数据并通知 Nucleus。
   */
  ingest(percept: Percept): void {
    const signal = percept.originSignal;
    const definition = this.signalDefinitions.get(signal);
    if (!definition) {
      throw new Error(`${signal.name} is not declared in this context`);
    }

    const data: ContextData = {
      signal: definition,
      time: getPerceptTime(percept),
      content:
        percept.type === 'sight'
          ? { type: 'image', path: percept.path }
          : {
              type: 'text',
              text: percept.content,
              ...(percept.type === 'hearing' && percept.speaker
                ? { speaker: percept.speaker }
                : {}),
            },
      percept,
    };

    this.entries.push(data);
    this.emit('data', data);
    this.emit('change');
  }

  /**
   * 添加一条运行时 system 定义，返回幂等的移除函数。
   */
  define(definition: ContextDefinitionInput): () => void {
    if (!definition.name || !definition.description) {
      throw new Error('context definition must have a non-empty name and description');
    }

    const value: ContextDefinition = {
      kind: 'custom',
      ...definition,
    };
    this.definitions.unshift(value);
    this.emit('change');

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const index = this.definitions.indexOf(value);
      if (index >= 0) {
        this.definitions.splice(index, 1);
        this.emit('change');
      }
    };
  }

  /**
   * 生成不可变快照，并顺便淘汰窗口之外的旧感知。
   */
  snapshot(createdAt: Date = new Date()): ContextSnapshot {
    const cutoff = createdAt.getTime() - this.perceptWindow;
    const retained = this.entries.filter(entry => entry.time.endAt.getTime() >= cutoff);
    this.entries.length = 0;
    this.entries.push(...retained);
    const data = retained.toSorted(
      (left, right) =>
        left.time.startAt.getTime() - right.time.startAt.getTime() ||
        left.time.endAt.getTime() - right.time.endAt.getTime(),
    );

    return {
      createdAt,
      definitions: [...this.definitions],
      data,
    };
  }

  /**
   * 清空当前感知窗口，保留语义定义。
   */
  clear(): void {
    this.entries.length = 0;
  }
}
