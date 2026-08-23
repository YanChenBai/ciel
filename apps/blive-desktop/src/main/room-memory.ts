// @env node

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Memory, createMemoryResourceId, VigiliaGroup } from '@ciels/core';
import type {
  CielMemoryStore,
  EpisodeRecordResult,
  MemoryEmbeddingModel,
  MemoryRecall,
  PerceptRecord,
  VigiliaOperationContext,
} from '@ciels/core';
import type { LanguageModel } from 'ai';

interface RoomMemoryOptions {
  readonly embedder: MemoryEmbeddingModel;
  readonly model: LanguageModel;
  readonly directory: string;
}

/** 在同一个 Ciel 运行时内把所有记忆操作路由到当前直播间资源。 */
export class RoomMemory implements CielMemoryStore {
  readonly observations = new VigiliaGroup();
  private current?: Memory;
  private readonly rooms = new Map<number, Memory>();
  private roomId?: number;

  constructor(private readonly options: RoomMemoryOptions) {
    mkdirSync(options.directory, { recursive: true });
  }

  select(roomId: number): void {
    if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error('roomId must be positive');
    if (this.roomId === roomId && this.current) return;
    let memory = this.rooms.get(roomId);
    if (!memory) {
      memory = new Memory({
        embedder: this.options.embedder,
        model: this.options.model,
        path: join(this.options.directory, `${roomId}.db`),
        resourceId: createMemoryResourceId('blive-desktop', 'room', roomId),
      });
      this.rooms.set(roomId, memory);
      this.observations.add(memory.observations);
    }
    this.current = memory;
    this.roomId = roomId;
  }

  recordEpisode(
    data: readonly PerceptRecord[],
    idempotencyKey?: string,
    context?: VigiliaOperationContext,
  ): Promise<EpisodeRecordResult | void> {
    return this.requireCurrent().recordEpisode(data, idempotencyKey, context);
  }

  readLongTerm(context?: VigiliaOperationContext): Promise<string> {
    return this.current?.readLongTerm(context) ?? Promise.resolve('');
  }

  readRecent(context?: VigiliaOperationContext): Promise<string> {
    return this.current?.readRecent(context) ?? Promise.resolve('');
  }

  updateLongTerm(content: string, context?: VigiliaOperationContext): Promise<void> {
    return this.requireCurrent().updateLongTerm(content, context);
  }

  recall(
    query: string,
    limit?: number,
    context?: VigiliaOperationContext,
  ): Promise<MemoryRecall[]> {
    return this.current?.recall(query, limit, context) ?? Promise.resolve([]);
  }

  async close(): Promise<void> {
    this.current = undefined;
    this.roomId = undefined;
    for (const memory of this.rooms.values()) await memory.close();
    this.rooms.clear();
  }

  private requireCurrent(): Memory {
    if (!this.current) throw new Error('当前没有可写入的直播间记忆');
    return this.current;
  }
}
