import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * 逻辑所有者在同一个物理数据库中隔离无关的 Ciel 实例
 */
export const namespaces = pgTable('memory_namespaces', {
  id: text('id').primaryKey(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

/**
 * Scope 标签是可变展示数据，Scope 标识保持为稳定键
 */
export const scopes = pgTable(
  'memory_scopes',
  {
    namespaceId: text('namespace_id')
      .notNull()
      .references(() => namespaces.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    label: text('label'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  table => [primaryKey({ columns: [table.namespaceId, table.id] })],
);

/**
 * 每日条目保留经过规范化的原始事实，供后续结算使用
 */
export const dailyEntries = pgTable(
  'daily_memory_entries',
  {
    id: text('id').primaryKey(),
    namespaceId: text('namespace_id').notNull(),
    scopeId: text('scope_id').notNull(),
    date: text('date').notNull(),
    content: text('content').notNull(),
    occurredAt: bigint('occurred_at', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    idempotencyKey: text('idempotency_key'),
    committed: boolean('committed').notNull().default(false),
  },
  table => [
    index('daily_memory_partition_idx').on(table.namespaceId, table.scopeId, table.date),
    uniqueIndex('daily_memory_idempotency_idx').on(
      table.namespaceId,
      table.scopeId,
      table.idempotencyKey,
    ),
  ],
);

/**
 * 长期记忆采用追加式写入，使 revision 始终可审计
 */
export const longTermRevisions = pgTable(
  'long_term_memory_revisions',
  {
    id: text('id').primaryKey(),
    namespaceId: text('namespace_id').notNull(),
    scopeId: text('scope_id').notNull(),
    content: text('content').notNull(),
    revision: integer('revision').notNull(),
    basedOnDates: jsonb('based_on_dates').$type<readonly string[]>().notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    committed: boolean('committed').notNull().default(false),
  },
  table => [
    uniqueIndex('long_term_memory_revision_idx').on(
      table.namespaceId,
      table.scopeId,
      table.revision,
    ),
  ],
);

/**
 * 记录已经整合进长期记忆的 Scope 与日期分区
 */
export const consolidatedDates = pgTable(
  'memory_consolidated_dates',
  {
    namespaceId: text('namespace_id').notNull(),
    scopeId: text('scope_id').notNull(),
    date: text('date').notNull(),
    consolidatedAt: bigint('consolidated_at', { mode: 'number' }).notNull(),
  },
  table => [primaryKey({ columns: [table.namespaceId, table.scopeId, table.date] })],
);

// 此处有意不声明 `memory_embeddings`，pgvector 值与距离运算符由 PGliteMemoryStore 中的显式 SQL 处理
export const schema = {
  consolidatedDates,
  dailyEntries,
  longTermRevisions,
  namespaces,
  scopes,
};
