import type { PGlite } from '@electric-sql/pglite';

// SQL 是迁移的事实来源，Drizzle schema 是类型化查询模型，必须与这些表和索引保持一致
const MIGRATION = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_namespaces (
  id text PRIMARY KEY,
  created_at bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_scopes (
  namespace_id text NOT NULL REFERENCES memory_namespaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  label text,
  created_at bigint NOT NULL,
  PRIMARY KEY (namespace_id, id)
);

CREATE TABLE IF NOT EXISTS daily_memory_entries (
  id text PRIMARY KEY,
  namespace_id text NOT NULL,
  scope_id text NOT NULL,
  date text NOT NULL,
  content text NOT NULL,
  occurred_at bigint NOT NULL,
  created_at bigint NOT NULL,
  idempotency_key text,
  committed boolean NOT NULL DEFAULT false,
  FOREIGN KEY (namespace_id, scope_id) REFERENCES memory_scopes(namespace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS daily_memory_partition_idx
  ON daily_memory_entries(namespace_id, scope_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS daily_memory_idempotency_idx
  ON daily_memory_entries(namespace_id, scope_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS long_term_memory_revisions (
  id text PRIMARY KEY,
  namespace_id text NOT NULL,
  scope_id text NOT NULL,
  content text NOT NULL,
  revision integer NOT NULL,
  based_on_dates jsonb NOT NULL,
  created_at bigint NOT NULL,
  committed boolean NOT NULL DEFAULT false,
  FOREIGN KEY (namespace_id, scope_id) REFERENCES memory_scopes(namespace_id, id) ON DELETE CASCADE,
  UNIQUE (namespace_id, scope_id, revision)
);

CREATE TABLE IF NOT EXISTS memory_consolidated_dates (
  namespace_id text NOT NULL,
  scope_id text NOT NULL,
  date text NOT NULL,
  consolidated_at bigint NOT NULL,
  PRIMARY KEY (namespace_id, scope_id, date),
  FOREIGN KEY (namespace_id, scope_id) REFERENCES memory_scopes(namespace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  record_id text PRIMARY KEY,
  namespace_id text NOT NULL,
  scope_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('daily', 'long-term')),
  embedding vector NOT NULL,
  created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_embeddings_filter_idx
  ON memory_embeddings(namespace_id, scope_id, kind);
`;

/**
 * 初始化空 Store，不修改已有记录
 */
export async function migrateMemoryStore(client: PGlite): Promise<void> {
  await client.exec(MIGRATION);
}
