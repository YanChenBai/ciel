// @env node

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Memory, createMemoryResourceId, VigiliaGroup } from '@ciels/core';
import type {
  CielMemoryStore,
  EpisodeRecordResult,
  MemoryEmbeddingModel,
  MemoryOperationOptions,
  MemoryRecall,
  MemoryRecallOptions,
  PerceptRecord,
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
    options?: MemoryOperationOptions,
  ): Promise<EpisodeRecordResult | void> {
    return this.requireCurrent().recordEpisode(data, idempotencyKey, options);
  }

  readLongTerm(options?: MemoryOperationOptions): Promise<string> {
    return this.current?.readLongTerm(options) ?? Promise.resolve('');
  }

  readRecent(options?: MemoryOperationOptions): Promise<string> {
    return this.current?.readRecent(options) ?? Promise.resolve('');
  }

  updateLongTerm(content: string, options?: MemoryOperationOptions): Promise<void> {
    return this.requireCurrent().updateLongTerm(content, options);
  }

  recall(query: string, options?: MemoryRecallOptions): Promise<MemoryRecall[]> {
    return this.current?.recall(query, options) ?? Promise.resolve([]);
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
