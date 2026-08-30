import { embedMany } from 'ai';

import { MemoryAgent } from './agent.ts';
import { createMemoryProjector } from './projector.ts';
import { PGliteMemoryStore } from './store/index.ts';
import { createMemoryTools } from './tools.ts';
import type {
  CreateMemoryOptions,
  DailyMemoryEntry,
  MemoryRecall,
  MemoryRuntime,
  MemoryScope,
  MemoryScopeRange,
  MemoryScopeValue,
  MemorySearchPage,
  RecallMemoryInput,
  RememberMemoryInput,
  SearchMemoryInput,
  UpdateMemoryInput,
} from './types.ts';

const RECALL_CANDIDATE_MULTIPLIER = 4;
const MAX_RECALL_CANDIDATES = 50;

function isMemoryStore(
  value: CreateMemoryOptions['store'],
): value is Exclude<CreateMemoryOptions['store'], { readonly path: string }> {
  return 'start' in value;
}

function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeContent(value: string, name: string): string {
  const content = value.trim();
  if (!content) throw new TypeError(`${name} must not be empty`);
  return content;
}

function requireScope(
  range: 'current' | 'global',
  currentScope: MemoryScope | undefined,
): MemoryScopeValue {
  if (range === 'global') return 'global';
  if (!currentScope) throw new Error('当前没有可用的记忆作用域');
  return currentScope;
}

function scopeKey(scope: MemoryScopeValue): string {
  return scope === 'global' ? '$global' : scope.id;
}

/**
 * 生成工具与编程调用方共享的操作
 */
export interface MemoryActions {
  remember(input: RememberMemoryInput): Promise<DailyMemoryEntry | undefined>;
  update(input: UpdateMemoryInput): Promise<void>;
  recall(input: RecallMemoryInput): Promise<readonly MemoryRecall[]>;
  search(input: SearchMemoryInput): Promise<MemorySearchPage>;
}

/**
 * 将存储、向量化、Memory Agent 任务、工具与投影组合为统一管理生命周期的运行时
 */
export function createMemory(options: CreateMemoryOptions): MemoryRuntime {
  const now = options.now ?? Date.now;
  const getCurrentScope = options.scope ?? (() => undefined);
  const store = isMemoryStore(options.store) ? options.store : new PGliteMemoryStore(options.store);
  const agent = new MemoryAgent(options.agent);

  // 同一 Scope 的写入按顺序执行，不同 Scope 彼此独立并可并发推进
  const queues = new Map<string, Promise<void>>();
  let status: 'idle' | 'running' | 'closing' | 'closed' = 'idle';

  async function embed(content: string): Promise<readonly number[]> {
    const result = await embedMany({ model: options.embedder, values: [content] });
    const embedding = result.embeddings[0];

    if (!embedding) throw new Error('Embedding model did not return an embedding');
    return embedding;
  }

  function assertRunning(): void {
    if (status !== 'running') throw new Error(`Memory runtime is ${status}`);
  }

  function enqueue<T>(scope: MemoryScopeValue, task: () => Promise<T>): Promise<T> {
    const key = scopeKey(scope);
    const previous = queues.get(key) ?? Promise.resolve();

    // 单次写入失败不能污染 Scope 队列，后续任务仍应继续执行
    const current = previous.then(task, task);
    const settled = current.then(
      () => undefined,
      () => undefined,
    );

    queues.set(key, settled);

    void settled.finally(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });

    return current;
  }

  /**
   * 每个 Scope 的每个已结束自然日只整合一次
   */
  async function consolidate(beforeDate: string): Promise<void> {
    const pending = await store.listPendingDates(options.id, beforeDate);

    await Promise.all(
      pending.map(item =>
        enqueue(item.scope, async () => {
          // 等待期间其他排队任务可能已经完成该日期的结算
          const stillPending = await store.listPendingDates(options.id, beforeDate);
          if (
            !stillPending.some(
              candidate =>
                candidate.date === item.date && scopeKey(candidate.scope) === scopeKey(item.scope),
            )
          ) {
            return;
          }

          const entries = await store.listDaily(options.id, item.scope, {
            dates: [item.date],
            limit: 100,
          });
          const current = await store.latestLongTerm(options.id, item.scope);
          const content = await agent.consolidateLongTerm(current, item.date, entries);

          if (content && content !== current?.content) {
            await store.commitLongTerm({
              namespaceId: options.id,
              scope: item.scope,
              content,
              embedding: await embed(content),
              basedOnDates: [item.date],
              createdAt: now(),
            });
          }

          // 即使当天没有长期事实也要标记，避免 Agent 重复处理
          await store.markDateConsolidated(options.id, item.scope, item.date);
        }),
      ),
    );
  }

  const actions: MemoryActions = {
    async remember(input) {
      assertRunning();
      const currentScope = getCurrentScope();
      const scope = requireScope(input.scope, currentScope);
      const occurredAt = input.occurredAt ?? now();
      const date = dateKey(occurredAt);

      // 接收新日期的首条记忆前先结算更早日期
      await consolidate(date);

      return enqueue(scope, async () => {
        const summarized = await agent.summarizeDaily(
          normalizeContent(input.content, 'memory_remember.content'),
        );
        if (!summarized) return undefined;

        return store.appendDaily({
          namespaceId: options.id,
          scope,
          date,
          content: summarized,
          embedding: await embed(summarized),
          occurredAt,
          createdAt: now(),
          idempotencyKey: input.idempotencyKey,
        });
      });
    },

    async update(input) {
      assertRunning();
      const scope = requireScope(input.scope, getCurrentScope());
      await enqueue(scope, async () => {
        const [current, evidence] = await Promise.all([
          store.latestLongTerm(options.id, scope),
          store.listDaily(options.id, scope, { limit: 100 }),
        ]);

        const content = await agent.reviseLongTerm(
          normalizeContent(input.instruction, 'memory_update.instruction'),
          current,
          evidence,
        );
        if (!content || content === current?.content) return;

        await store.commitLongTerm({
          namespaceId: options.id,
          scope,
          content,
          embedding: await embed(content),
          basedOnDates: [],
          createdAt: now(),
        });
      });
    },

    async recall(input) {
      assertRunning();
      const query = normalizeContent(input.query, 'memory_recall.query');
      const scope: MemoryScopeRange = input.scope ?? options.tools?.defaultRecallRange ?? 'current';
      const limit = input.limit ?? options.tools?.recallLimit ?? 5;

      // 向量搜索生成较宽的候选集，再由 Memory Agent 完成最终语义筛选与排序
      const candidates = await store.recall({
        namespaceId: options.id,
        currentScope: getCurrentScope(),
        embedding: await embed(query),
        scope,
        limit: Math.min(limit * RECALL_CANDIDATE_MULTIPLIER, MAX_RECALL_CANDIDATES),
      });

      return agent.recall(query, candidates, limit);
    },

    async search(input) {
      assertRunning();
      return store.search({
        ...input,
        namespaceId: options.id,
        currentScope: getCurrentScope(),
        scope: input.scope ?? 'current',
        limit: input.limit ?? options.tools?.searchLimit ?? 20,
      });
    },
  };

  const projector = createMemoryProjector({
    namespaceId: options.id,
    store,
    scope: getCurrentScope,
    now,
    projector: options.projector,
  });
  const tools = createMemoryTools(actions, options.tools);

  async function start(): Promise<void> {
    if (status === 'running') return;
    if (status !== 'idle') throw new Error(`Cannot start Memory runtime while it is ${status}`);

    await store.start();
    agent.start();
    status = 'running';
  }

  async function flush(): Promise<void> {
    if (status !== 'running' && status !== 'closing') return;

    // 先等待当前写入，再结算已结束日期，最后等待整合产生的写入
    await Promise.all(queues.values());
    await consolidate(dateKey(now()));
    await Promise.all(queues.values());
  }

  async function close(): Promise<void> {
    if (status === 'closed') return;
    if (status === 'idle') {
      status = 'closed';
      await store.close();
      return;
    }

    if (status === 'closing') {
      await Promise.all(queues.values());
      return;
    }

    status = 'closing';
    const errors: unknown[] = [];
    try {
      await flush();
    } catch (error) {
      errors.push(error);
    }

    try {
      await agent.stop();
    } catch (error) {
      errors.push(error);
    }

    try {
      await store.close();
    } catch (error) {
      errors.push(error);
    }

    status = 'closed';

    // 关闭时尽力清理每个组件，并集中报告全部失败
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to close Memory runtime');
  }

  return { projector, tools, start, flush, close };
}
