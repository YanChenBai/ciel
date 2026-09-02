import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';

import type {
  AppendDailyMemoryOptions,
  CommitLongTermMemoryOptions,
  DailyMemoryEntry,
  LongTermMemoryRevision,
  MemoryKind,
  MemoryRecall,
  MemoryScope,
  MemoryScopeRange,
  MemoryScopeValue,
  MemorySearchPage,
  MemorySearchResult,
  MemoryStore,
  MemoryStoreOptions,
  MemoryStoreRecallOptions,
  MemoryStoreSearchOptions,
  PendingMemoryDate,
} from '../types.ts';
import { migrateMemoryStore } from './migrations.ts';
import {
  consolidatedDates,
  dailyEntries,
  longTermRevisions,
  namespaces,
  schema,
  scopes,
} from './schema.ts';

const GLOBAL_SCOPE_ID = '$global';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type MemoryDatabase = PgliteDatabase<typeof schema>;

/**
 * 确定性搜索与向量召回共享的原始 SQL 行
 */
interface RecallRow {
  readonly id: string;
  readonly kind: MemoryKind;
  readonly scope_id: string;
  readonly scope_label: string | null;
  readonly content: string;
  readonly date: string | null;
  readonly revision: number | null;
  readonly occurred_at: number | null;
  readonly created_at: number;
  readonly score: number;
}

function normalizeText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} must not be empty`);
  return normalized;
}

function normalizeScope(scope: MemoryScopeValue): { id: string; label: string | null } {
  // 全局记忆使用保留的 Scope 行表示，使所有表保持相同的复合所有权模型
  if (scope === 'global') return { id: GLOBAL_SCOPE_ID, label: null };

  return {
    id: normalizeText(scope.id, 'memory.scope.id'),
    label: normalizeText(scope.label, 'memory.scope.label'),
  };
}

function toScope(scopeId: string, label: string | null): MemoryScopeValue {
  return scopeId === GLOBAL_SCOPE_ID ? 'global' : { id: scopeId, label: label ?? scopeId };
}

function clampLimit(value: number | undefined, fallback = DEFAULT_LIMIT): number {
  const limit = value ?? fallback;

  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError('memory limit must be a positive integer');
  }
  return Math.min(limit, MAX_LIMIT);
}

function vectorLiteral(embedding: readonly number[]): string {
  if (embedding.length === 0 || embedding.some(value => !Number.isFinite(value))) {
    throw new TypeError('memory embedding must contain finite numbers');
  }

  return `[${embedding.join(',')}]`;
}

// 分页按 createdAt 与 id 排序，因此游标同时携带两者，在多条记录共享时间戳时仍保持稳定
function encodeCursor(value: { createdAt: number; id: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(cursor: string | undefined): { createdAt: number; id: string } | undefined {
  if (!cursor) return undefined;

  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof Reflect.get(value, 'createdAt') === 'number' &&
      typeof Reflect.get(value, 'id') === 'string'
    ) {
      return value as { createdAt: number; id: string };
    }
  } catch {
    // 下方公开错误信息有意保持稳定
  }
  throw new TypeError('memory search cursor is invalid');
}

function resolveScopeIds(
  range: MemoryScopeRange,
  currentScope?: MemoryScope,
): string[] | undefined {
  if (range === 'all') return undefined;
  if (range === 'global') return [GLOBAL_SCOPE_ID];
  return currentScope ? [normalizeScope(currentScope).id] : [];
}

export class PGliteMemoryStore implements MemoryStore {
  private client: PGlite | undefined;
  private database: MemoryDatabase | undefined;
  private state: 'idle' | 'running' | 'closed' = 'idle';

  constructor(private readonly options: MemoryStoreOptions) {}

  /**
   * 打开 PGlite、安装 pgvector 并应用幂等迁移
   */
  async start(): Promise<void> {
    if (this.state === 'running') return;
    if (this.state === 'closed') throw new Error('Memory store is closed');

    const client =
      this.options.path === ':memory:'
        ? new PGlite({ extensions: { vector } })
        : new PGlite(this.options.path, { extensions: { vector } });
    await client.waitReady;
    await migrateMemoryStore(client);

    this.client = client;
    this.database = drizzle(client, { schema });
    this.state = 'running';
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return;
    const client = this.client;
    this.client = undefined;
    this.database = undefined;
    this.state = 'closed';

    await client?.close();
  }

  /**
   * 原子写入每日事实及可选的语义索引行
   */
  async appendDaily(options: AppendDailyMemoryOptions): Promise<DailyMemoryEntry> {
    const db = this.getDatabase();
    const scope = normalizeScope(options.scope);
    const content = normalizeText(options.content, 'memory.content');
    const namespaceId = normalizeText(options.namespaceId, 'memory.namespaceId');
    const idempotencyKey = options.idempotencyKey?.trim() || undefined;

    return db.transaction(async tx => {
      await this.ensureScope(tx as MemoryDatabase, namespaceId, scope, options.createdAt);

      if (idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(dailyEntries)
          .where(
            and(
              eq(dailyEntries.namespaceId, namespaceId),
              eq(dailyEntries.scopeId, scope.id),
              eq(dailyEntries.idempotencyKey, idempotencyKey),
              eq(dailyEntries.committed, true),
            ),
          )
          .limit(1);

        if (existing) return this.mapDaily(existing, scope.label);
      }

      const id = randomUUID();
      const [row] = await tx
        .insert(dailyEntries)
        .values({
          id,
          namespaceId,
          scopeId: scope.id,
          date: options.date,
          content,
          occurredAt: options.occurredAt,
          createdAt: options.createdAt,
          idempotencyKey,
        })
        .returning();

      if (options.embedding) {
        await tx.execute(sql`
          INSERT INTO memory_embeddings
            (record_id, namespace_id, scope_id, kind, embedding, created_at)
          VALUES
            (${id}, ${namespaceId}, ${scope.id}, 'daily', ${vectorLiteral(options.embedding)}::vector, ${options.createdAt})
        `);
      }
      await tx.update(dailyEntries).set({ committed: true }).where(eq(dailyEntries.id, id));

      return this.mapDaily({ ...row!, committed: true }, scope.label);
    });
  }

  /**
   * 追加下一个长期记忆 revision 及可选的语义索引
   */
  async commitLongTerm(options: CommitLongTermMemoryOptions): Promise<LongTermMemoryRevision> {
    const db = this.getDatabase();
    const scope = normalizeScope(options.scope);
    const namespaceId = normalizeText(options.namespaceId, 'memory.namespaceId');
    const content = normalizeText(options.content, 'memory.content');

    return db.transaction(async tx => {
      await this.ensureScope(tx as MemoryDatabase, namespaceId, scope, options.createdAt);
      const [latest] = await tx
        .select({ revision: longTermRevisions.revision })
        .from(longTermRevisions)
        .where(
          and(
            eq(longTermRevisions.namespaceId, namespaceId),
            eq(longTermRevisions.scopeId, scope.id),
            eq(longTermRevisions.committed, true),
          ),
        )
        .orderBy(desc(longTermRevisions.revision))
        .limit(1);

      const id = randomUUID();
      const revision = (latest?.revision ?? 0) + 1;

      const [row] = await tx
        .insert(longTermRevisions)
        .values({
          id,
          namespaceId,
          scopeId: scope.id,
          content,
          revision,
          basedOnDates: [...options.basedOnDates],
          createdAt: options.createdAt,
        })
        .returning();

      if (options.embedding) {
        await tx.execute(sql`
          INSERT INTO memory_embeddings
            (record_id, namespace_id, scope_id, kind, embedding, created_at)
          VALUES
            (${id}, ${namespaceId}, ${scope.id}, 'long-term', ${vectorLiteral(options.embedding)}::vector, ${options.createdAt})
        `);
      }
      await tx
        .update(longTermRevisions)
        .set({ committed: true })
        .where(eq(longTermRevisions.id, id));

      if (options.basedOnDates.length > 0) {
        await tx
          .insert(consolidatedDates)
          .values(
            options.basedOnDates.map(date => ({
              namespaceId,
              scopeId: scope.id,
              date,
              consolidatedAt: options.createdAt,
            })),
          )
          .onConflictDoNothing();
      }

      return this.mapLongTerm({ ...row!, committed: true }, scope.label);
    });
  }

  async latestLongTerm(
    namespaceId: string,
    scopeValue: MemoryScopeValue,
  ): Promise<LongTermMemoryRevision | undefined> {
    const scope = normalizeScope(scopeValue);
    const [row] = await this.getDatabase()
      .select()
      .from(longTermRevisions)
      .where(
        and(
          eq(longTermRevisions.namespaceId, namespaceId),
          eq(longTermRevisions.scopeId, scope.id),
          eq(longTermRevisions.committed, true),
        ),
      )
      .orderBy(desc(longTermRevisions.revision))
      .limit(1);

    return row ? this.mapLongTerm(row, scope.label) : undefined;
  }

  async listDaily(
    namespaceId: string,
    scopeValue: MemoryScopeValue,
    options: { readonly dates?: readonly string[]; readonly limit?: number } = {},
  ): Promise<readonly DailyMemoryEntry[]> {
    if (options.dates?.length === 0) return [];

    const scope = normalizeScope(scopeValue);
    const filters = [
      eq(dailyEntries.namespaceId, namespaceId),
      eq(dailyEntries.scopeId, scope.id),
      eq(dailyEntries.committed, true),
    ];

    if (options.dates) filters.push(inArray(dailyEntries.date, [...options.dates]));

    const rows = await this.getDatabase()
      .select()
      .from(dailyEntries)
      .where(and(...filters))
      .orderBy(desc(dailyEntries.occurredAt), desc(dailyEntries.id))
      .limit(clampLimit(options.limit, MAX_LIMIT));

    return rows.map(row => this.mapDaily(row, scope.label));
  }

  async listPendingDates(
    namespaceId: string,
    beforeDate: string,
  ): Promise<readonly PendingMemoryDate[]> {
    const rows = await this.getDatabase()
      .selectDistinct({
        date: dailyEntries.date,
        scopeId: dailyEntries.scopeId,
        scopeLabel: scopes.label,
      })
      .from(dailyEntries)
      .innerJoin(
        scopes,
        and(eq(scopes.namespaceId, dailyEntries.namespaceId), eq(scopes.id, dailyEntries.scopeId)),
      )
      .leftJoin(
        consolidatedDates,
        and(
          eq(consolidatedDates.namespaceId, dailyEntries.namespaceId),
          eq(consolidatedDates.scopeId, dailyEntries.scopeId),
          eq(consolidatedDates.date, dailyEntries.date),
        ),
      )
      .where(
        and(
          eq(dailyEntries.namespaceId, namespaceId),
          eq(dailyEntries.committed, true),
          lt(dailyEntries.date, beforeDate),
          isNull(consolidatedDates.date),
        ),
      )
      .orderBy(asc(dailyEntries.date), asc(dailyEntries.scopeId));

    return rows.map(row => ({
      date: row.date,
      scope: toScope(row.scopeId, row.scopeLabel),
    }));
  }

  async markDateConsolidated(
    namespaceId: string,
    scopeValue: MemoryScopeValue,
    date: string,
  ): Promise<void> {
    const scope = normalizeScope(scopeValue);
    await this.getDatabase()
      .insert(consolidatedDates)
      .values({ namespaceId, scopeId: scope.id, date, consolidatedAt: Date.now() })
      .onConflictDoNothing();
  }

  async search(options: MemoryStoreSearchOptions): Promise<MemorySearchPage> {
    const limit = clampLimit(options.limit);
    const cursor = decodeCursor(options.cursor);
    const range = options.scope ?? 'current';
    const scopeIds = resolveScopeIds(range, options.currentScope);
    if (scopeIds?.length === 0) return { entries: [] };

    const kinds = options.kinds ?? ['daily', 'long-term'];
    const query = options.query?.trim();

    // 联合查询跨越元数据不同的两个记录表
    // 原始 SQL 使共享排序、全文过滤和游标条件保持显式
    const rows = await this.getClient().query<Omit<RecallRow, 'score'>>(
      `
        WITH records AS (
          SELECT d.id, 'daily'::text AS kind, d.scope_id, s.label AS scope_label,
            d.content, d.date, NULL::integer AS revision, d.occurred_at,
            d.created_at
          FROM daily_memory_entries d
          JOIN memory_scopes s ON s.namespace_id = d.namespace_id AND s.id = d.scope_id
          WHERE d.namespace_id = $1 AND d.committed = true
          UNION ALL
          SELECT l.id, 'long-term'::text AS kind, l.scope_id, s.label AS scope_label,
            l.content, NULL::text AS date, l.revision, NULL::bigint AS occurred_at,
            l.created_at
          FROM long_term_memory_revisions l
          JOIN memory_scopes s ON s.namespace_id = l.namespace_id AND s.id = l.scope_id
          WHERE l.namespace_id = $1 AND l.committed = true
        )
        SELECT * FROM records
        WHERE ($2::text[] IS NULL OR scope_id = ANY($2::text[]))
          AND kind = ANY($3::text[])
          AND (
            $4::text IS NULL
            OR position(lower($4) in lower(content)) > 0
            OR to_tsvector('simple', content) @@ plainto_tsquery('simple', $4)
          )
          AND ($5::text IS NULL OR date IS NULL OR date >= $5)
          AND ($6::text IS NULL OR date IS NULL OR date <= $6)
          AND ($7::bigint IS NULL OR created_at < $7 OR (created_at = $7 AND id < $8))
        ORDER BY created_at DESC, id DESC
        LIMIT $9
      `,
      [
        options.namespaceId,
        scopeIds,
        kinds,
        query || null,
        options.from ?? null,
        options.to ?? null,
        cursor?.createdAt ?? null,
        cursor?.id ?? null,
        limit + 1,
      ],
    );

    const page = rows.rows.slice(0, limit).map(row => this.mapSearchRow(row));
    const last = page.at(-1);

    return {
      entries: page,
      ...(rows.rows.length > limit && last
        ? { cursor: encodeCursor({ createdAt: last.createdAt, id: last.id }) }
        : {}),
    };
  }

  async recall(options: MemoryStoreRecallOptions): Promise<readonly MemoryRecall[]> {
    const scopeIds = resolveScopeIds(options.scope, options.currentScope);
    if (scopeIds?.length === 0) return [];

    // PGlite 与 pgvector 只负责候选检索，运行时将较宽的候选集交给 MemoryAgent 做语义重排
    const rows = await this.getClient().query<RecallRow>(
      `
        WITH records AS (
          SELECT d.id, 'daily'::text AS kind, d.scope_id, s.label AS scope_label,
            d.content, d.date, NULL::integer AS revision, d.occurred_at, d.created_at
          FROM daily_memory_entries d
          JOIN memory_scopes s ON s.namespace_id = d.namespace_id AND s.id = d.scope_id
          WHERE d.namespace_id = $1 AND d.committed = true
          UNION ALL
          SELECT l.id, 'long-term'::text AS kind, l.scope_id, s.label AS scope_label,
            l.content, NULL::text AS date, l.revision, NULL::bigint AS occurred_at,
            l.created_at
          FROM long_term_memory_revisions l
          JOIN memory_scopes s ON s.namespace_id = l.namespace_id AND s.id = l.scope_id
          WHERE l.namespace_id = $1 AND l.committed = true
        )
        SELECT records.*, 1 - (e.embedding <=> $2::vector) AS score
        FROM records
        JOIN memory_embeddings e ON e.record_id = records.id
        WHERE ($3::text[] IS NULL OR records.scope_id = ANY($3::text[]))
        ORDER BY e.embedding <=> $2::vector, records.created_at DESC
        LIMIT $4
      `,
      [options.namespaceId, vectorLiteral(options.embedding), scopeIds, clampLimit(options.limit)],
    );

    return rows.rows.map(row => ({ ...this.mapSearchRow(row), score: Number(row.score) }));
  }

  private getClient(): PGlite {
    if (this.state !== 'running' || !this.client) throw new Error('Memory store is not running');
    return this.client;
  }

  private getDatabase(): MemoryDatabase {
    if (this.state !== 'running' || !this.database) {
      throw new Error('Memory store is not running');
    }
    return this.database;
  }

  private async ensureScope(
    db: MemoryDatabase,
    namespaceId: string,
    scope: { id: string; label: string | null },
    createdAt: number,
  ): Promise<void> {
    // 再次遇到同一 Scope 时刷新标签，但不改变稳定标识
    await db.insert(namespaces).values({ id: namespaceId, createdAt }).onConflictDoNothing();

    await db
      .insert(scopes)
      .values({ namespaceId, id: scope.id, label: scope.label, createdAt })
      .onConflictDoUpdate({
        target: [scopes.namespaceId, scopes.id],
        set: { label: scope.label },
      });
  }

  private mapDaily(row: typeof dailyEntries.$inferSelect, label: string | null): DailyMemoryEntry {
    return {
      id: row.id,
      date: row.date,
      scope: toScope(row.scopeId, label),
      content: row.content,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
      ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    };
  }

  private mapLongTerm(
    row: typeof longTermRevisions.$inferSelect,
    label: string | null,
  ): LongTermMemoryRevision {
    return {
      id: row.id,
      scope: toScope(row.scopeId, label),
      content: row.content,
      revision: row.revision,
      basedOnDates: row.basedOnDates,
      createdAt: row.createdAt,
    };
  }

  private mapSearchRow(row: Omit<RecallRow, 'score'> | RecallRow): MemorySearchResult {
    return {
      id: row.id,
      kind: row.kind,
      scope: toScope(row.scope_id, row.scope_label),
      content: row.content,
      createdAt: Number(row.created_at),
      ...(row.date ? { date: row.date } : {}),
      ...(row.revision === null ? {} : { revision: row.revision }),
      ...(row.occurred_at === null ? {} : { occurredAt: Number(row.occurred_at) }),
    };
  }
}
