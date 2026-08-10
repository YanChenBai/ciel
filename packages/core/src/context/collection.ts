import { EventHost } from '@ciels/event';

import type { Context } from './context.ts';
import type { ContextDefinition, ContextEventMap, ContextSnapshot } from './types.ts';

function uniqueDefinitions(definitions: readonly ContextDefinition[]): ContextDefinition[] {
  const seen = new Set<string>();
  return definitions.filter(definition => {
    const key = `${definition.kind}\u0000${definition.name}\u0000${definition.description}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * 将一个 Ciel 下的多个 Context 合并为 Nucleus 可消费的单一 ContextSource。
 */
export class ContextCollection extends EventHost<ContextEventMap> {
  private readonly contexts: Context[] = [];

  /**
   * 注册一个 Context，并转发它的数据与变更事件。
   */
  add(context: Context): void {
    if (this.contexts.includes(context)) {
      return;
    }
    this.contexts.push(context);
    context.on('data', data => this.emit('data', data));
    context.on('change', () => this.emit('change'));
  }

  /**
   * 合并定义与实时数据，保证感知仍按时间顺序排列。
   */
  snapshot(createdAt: Date = new Date()): ContextSnapshot {
    const snapshots = this.contexts.map(context => context.snapshot(createdAt));
    const definitions = uniqueDefinitions(snapshots.flatMap(snapshot => snapshot.definitions));
    const data = snapshots
      .flatMap(snapshot => snapshot.data)
      .toSorted(
        (left, right) =>
          left.time.startAt.getTime() - right.time.startAt.getTime() ||
          left.time.endAt.getTime() - right.time.endAt.getTime(),
      );
    return { createdAt, definitions, data };
  }
}
