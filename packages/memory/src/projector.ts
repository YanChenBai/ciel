import { defineProjector } from 'corex';
import type { ProjectorExtension } from 'corex';

import type {
  DailyMemoryEntry,
  LongTermMemoryRevision,
  MemoryProjectorOptions,
  MemoryScope,
  MemoryStore,
} from './types.ts';

const DAY = 86_400_000;

function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function recentDateKeys(now: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => dateKey(now - index * DAY));
}

function renderLongTermMemory(
  global: LongTermMemoryRevision | undefined,
  current: LongTermMemoryRevision | undefined,
): string[] {
  if (!global && !current) return [];

  const sections = ['# 长期记忆'];
  if (global) sections.push(`## 全局\n\n${global.content}`);
  if (current) sections.push(`## 当前场景\n\n${current.content}`);

  return sections;
}

function renderRecentMemory(
  entries: readonly DailyMemoryEntry[],
  maxEntriesPerDay: number,
): string[] {
  if (entries.length === 0) return [];

  const entriesByDate = new Map<string, DailyMemoryEntry[]>();
  for (const entry of entries) {
    const day = entriesByDate.get(entry.date) ?? [];
    day.push(entry);
    entriesByDate.set(entry.date, day);
  }

  const days = [...entriesByDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, day]) => {
      const facts = day
        .slice(0, maxEntriesPerDay)
        .map(entry => `- ${entry.content}`)
        .join('\n');

      return `## ${date}\n\n${facts}`;
    });

  return ['# 最近经历', ...days];
}

/**
 * 创建注入主 Agent 上下文的只读视图
 */
export function createMemoryProjector(options: {
  readonly namespaceId: string;
  readonly name?: string;
  readonly store: MemoryStore;
  readonly scope: () => MemoryScope | undefined;
  readonly now: () => number;
  readonly projector?: MemoryProjectorOptions;
}): ProjectorExtension {
  const recentDays = options.projector?.recentDays ?? 3;
  const maxEntriesPerDay = options.projector?.maxEntriesPerDay ?? 20;
  const includeGlobalLongTerm = options.projector?.includeGlobalLongTerm ?? true;
  const includeCurrentLongTerm = options.projector?.includeCurrentLongTerm ?? true;

  return defineProjector({
    name: options.name ?? 'memory',

    async project() {
      const currentScope = options.scope();

      // 投影是稳定快照,所有独立读取共享同一 Scope,并在渲染 Markdown 前全部完成
      const [globalLongTerm, currentLongTerm, recent] = await Promise.all([
        includeGlobalLongTerm
          ? options.store.latestLongTerm(options.namespaceId, 'global')
          : undefined,
        includeCurrentLongTerm && currentScope
          ? options.store.latestLongTerm(options.namespaceId, currentScope)
          : undefined,
        currentScope
          ? options.store.listDaily(options.namespaceId, currentScope, {
              dates: recentDateKeys(options.now(), recentDays),
              limit: recentDays * maxEntriesPerDay,
            })
          : [],
      ]);

      const sections = [
        ...renderLongTermMemory(globalLongTerm, currentLongTerm),
        ...renderRecentMemory(recent, maxEntriesPerDay),
      ];

      return sections.length > 0 ? [{ type: 'text', text: sections.join('\n\n') }] : [];
    },
  });
}
