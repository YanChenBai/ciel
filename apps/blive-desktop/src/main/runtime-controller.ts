// @env node

import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { BilibiliLive, createBliveAI } from '@ciels/blive';
import { Ciel, Memory } from '@ciels/core';
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';
import { Output } from 'ai';
import type { BrowserWindow } from 'electron';
import { z } from 'zod';

import type {
  BliveDesktopState,
  BliveMode,
  BliveStartOptions,
  BliveThought,
  LivePageEvent,
  LiveRoomInfo,
} from '../shared/types.ts';
import { BilibiliAccountManager } from './account.ts';
import { AreaCatalog } from './area-catalog.ts';
import { fetchLiveRoomInfo } from './bilibili-api.ts';
import {
  DANMAKU_COOLDOWN_MS,
  DANMAKU_PROMPT_HISTORY_LIMIT,
  MAX_DANMAKU_LENGTH,
  ROOM_REVIEW_AFTER_MS,
} from './constants.ts';
import { DanmakuHistory } from './danmaku-history.ts';
import type { LivePage } from './live-page.ts';
import {
  AUTONOMOUS_MODE_PROMPT,
  COMMON_BLIVE_PROMPT,
  createRoomContextMessage,
  STANDARD_MODE_PROMPT,
} from './prompts.ts';
import { createBliveTools } from './tools.ts';

interface RuntimeControllerEvents {
  state: [BliveDesktopState];
  vigilia: [AnyVigiliaEvent, VigiliaSnapshot];
}

const thoughtSchema = z.object({
  action: z.enum(['stay', 'switch']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(5),
  reason: z.string(),
  score: z.number().min(0).max(100),
  targetRoomId: z.number().int().positive().optional(),
});

export class RuntimeController extends EventEmitter<RuntimeControllerEvents> {
  private readonly catalog = new AreaCatalog();
  private readonly accountManager = new BilibiliAccountManager();
  private readonly history = new DanmakuHistory();
  private readonly livePage: LivePage;
  private readonly userDataPath: string;
  private areaUrl?: string;
  private account?: BliveDesktopState['account'];
  private ciel?: Ciel<BliveThought>;
  private events: AnyVigiliaEvent[] = [];
  private lastCandidates = new Set<number>();
  private lastError?: string;
  private lastSentAt = 0;
  private mode: BliveMode = 'standard';
  private memory?: Memory;
  private room?: LiveRoomInfo;
  private roomStartedAt = 0;
  private snapshot: VigiliaSnapshot = emptySnapshot();
  private switching = false;
  private unsubscribeVigilia?: () => void;

  constructor(options: { readonly livePage: LivePage; readonly userDataPath: string }) {
    super();
    this.livePage = options.livePage;
    this.userDataPath = options.userDataPath;
    this.livePage.on('event', event => void this.handlePageEvent(event));
  }

  async initialize(): Promise<void> {
    this.account = await this.accountManager.current().catch(() => undefined);
    this.emitState();
  }

  async login(parent: BrowserWindow): Promise<void> {
    this.account = await this.accountManager.login(parent);
    this.emitState();
  }

  state(): BliveDesktopState {
    return {
      ...(this.account ? { account: this.account } : {}),
      connected: true,
      ...(this.lastError ? { error: this.lastError } : {}),
      events: this.events,
      history: this.history.list(undefined, 20),
      mode: this.mode,
      ...(this.room ? { room: this.room } : {}),
      running: this.ciel !== undefined,
      snapshot: this.snapshot,
    };
  }

  async start(options: BliveStartOptions): Promise<void> {
    await this.stop();
    this.mode = options.mode;
    this.areaUrl = options.areaUrl?.trim() || undefined;
    this.lastError = undefined;
    try {
      await this.startRoom(options.roomId);
    } catch (error) {
      const normalized = formatStartError(error);
      this.reportError(normalized);
      throw normalized;
    }
  }

  async stop(): Promise<void> {
    const ciel = this.ciel;
    this.ciel = undefined;
    this.unsubscribeVigilia?.();
    this.unsubscribeVigilia = undefined;
    if (ciel) await ciel.stop().catch(error => this.reportError(error));
    this.emitState();
  }

  async sendDanmaku(content: string): Promise<void> {
    const room = this.room;
    if (!room || !this.ciel) throw new Error('当前没有正在运行的直播间');
    const normalized = content.trim();
    if (!normalized || countCharacters(normalized) > MAX_DANMAKU_LENGTH) {
      throw new Error(`弹幕长度必须为 1～${MAX_DANMAKU_LENGTH} 个字符`);
    }
    if (Date.now() - this.lastSentAt < DANMAKU_COOLDOWN_MS) {
      throw new Error('弹幕发送过于频繁，请稍后再试');
    }
    if (this.history.hasRecentDuplicate(room.roomId, normalized)) {
      throw new Error('这条弹幕最近已经发送过');
    }
    await this.livePage.sendDanmaku(normalized);
    this.lastSentAt = Date.now();
    await this.recordSentDanmaku(normalized);
  }

  async close(): Promise<void> {
    await this.stop();
    this.catalog.close();
    await this.memory?.close();
    this.memory = undefined;
    this.removeAllListeners();
  }

  private async startRoom(requestedRoomId: number): Promise<void> {
    assertAurisModels();
    const room = await fetchLiveRoomInfo(requestedRoomId);
    if (!room.live) throw new Error(`直播间 ${room.roomId} 当前未开播`);
    const ffmpegPath = process.env.BLIVE_FFMPEG_PATH?.trim();
    const live = new BilibiliLive({
      roomId: room.roomId,
      ...(ffmpegPath ? { ffmpegPath } : {}),
    });
    const { embedder, model } = createBliveAI();
    this.memory ??= new Memory({
      embedder,
      model,
      path: join(this.userDataPath, 'memory.db'),
      resourceId: 'blive:desktop',
    });
    const tools = createBliveTools({
      autonomous: this.mode === 'autonomous',
      listLiveRooms: (page, limit) => this.listLiveRooms(page, limit),
      sendDanmaku: content => this.sendDanmaku(content),
    });
    const ciel = new Ciel<BliveThought>(live, {
      vigilia: {
        capturePerceptContent: true,
        capture: {
          context: true,
          memory: true,
          reasoning: true,
          result: true,
          toolInput: true,
          toolOutput: true,
        },
        signals: false,
      },
      nucleus: {
        context: { maxImages: 9, perceptWindow: 60_000 },
        maxThinkInterval: 60_000,
        memory: this.memory,
        messages: [() => ({ role: 'user', content: this.createDynamicContext() })],
        minThinkInterval: 10_000,
        model,
        prepareStep: ({ steps }) => {
          const interactionResolved = steps.some(step =>
            step.toolCalls.some(call => call.toolName === 'send_danmaku'),
          );
          if (interactionResolved) {
            return {
              activeTools: this.mode === 'autonomous' ? ['list_live_rooms'] : [],
              toolChoice: 'auto',
            };
          }
          return {
            activeTools: ['send_danmaku'],
            output: Output.text(),
            toolChoice: { toolName: 'send_danmaku', type: 'tool' },
          };
        },
        output: Output.object({
          schema: thoughtSchema,
          name: 'blive_room_decision',
          description:
            'Return the current room decision with action, confidence, evidence, reason, score, and an optional targetRoomId.',
        }),
        system: [
          COMMON_BLIVE_PROMPT,
          this.mode === 'autonomous' ? AUTONOMOUS_MODE_PROMPT : STANDARD_MODE_PROMPT,
        ],
        tools,
      },
      oculus: { differenceThreshold: 0.03, sampleInterval: 0 },
    });
    const ffmpegErrors: string[] = [];
    const unsubscribeVigilia = ciel.vigilia.subscribe((event, snapshot) => {
      this.events = [...this.events, event];
      this.snapshot = snapshot;
      this.emit('vigilia', event, snapshot);
    });
    ciel.on('error', error => {
      if (isRecoverableModelOutputError(error)) {
        console.warn(`[blive] 跳过未匹配评估 schema 的模型输出：${error.message}`);
        return;
      }
      this.reportError(error);
    });
    ciel.on('thought', thought => this.handleThought(thought));
    live.onStderr(message => {
      ffmpegErrors.push(message);
      if (ffmpegErrors.length > 4) ffmpegErrors.shift();
    });
    live.onClose((code, signal) => {
      if (code === 0 || this.ciel !== ciel) return;
      const normalizedCode = normalizeWindowsExitCode(code);
      const detail = ffmpegErrors.at(-1);
      this.reportError(
        new Error(
          `FFmpeg 异常退出（code=${String(normalizedCode)}, signal=${String(signal)}）${detail ? `：${detail}` : ''}`,
        ),
      );
      setTimeout(() => {
        if (this.ciel === ciel) void this.stop();
      }, 0);
    });
    try {
      await this.livePage.open(room.roomId);
      await ciel.start();
      this.room = room;
      this.roomStartedAt = Date.now();
      this.lastCandidates.clear();
      this.ciel = ciel;
      this.snapshot = ciel.vigilia.snapshot();
      this.unsubscribeVigilia = unsubscribeVigilia;
      this.emitState();
    } catch (error) {
      unsubscribeVigilia();
      this.room = undefined;
      this.snapshot = emptySnapshot();
      throw formatStartError(error);
    }
  }

  private createDynamicContext(): string {
    const room = this.room;
    if (!room) return '当前没有直播间信息。';
    return createRoomContextMessage({
      canSwitch: Date.now() - this.roomStartedAt >= ROOM_REVIEW_AFTER_MS,
      history: this.history.list(room.roomId, DANMAKU_PROMPT_HISTORY_LIMIT),
      room,
      startedAt: this.roomStartedAt,
    });
  }

  private async listLiveRooms(page: number, limit: number) {
    if (!this.areaUrl) throw new Error('自主模式尚未配置分区 URL');
    const result = await this.catalog.list(this.areaUrl, page, limit);
    for (const candidate of result.candidates) this.lastCandidates.add(candidate.roomId);
    return {
      ...result,
      candidates: result.candidates.filter(item => item.roomId !== this.room?.roomId),
    };
  }

  private handleThought(thought: BliveThought): void {
    if (
      this.mode !== 'autonomous' ||
      thought.action !== 'switch' ||
      !thought.targetRoomId ||
      !this.lastCandidates.has(thought.targetRoomId) ||
      Date.now() - this.roomStartedAt < ROOM_REVIEW_AFTER_MS
    ) {
      return;
    }
    const targetRoomId = thought.targetRoomId;
    setTimeout(() => void this.switchRoom(targetRoomId), 0);
  }

  private async switchRoom(roomId: number): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    try {
      await this.stop();
      await this.startRoom(roomId);
    } catch (error) {
      this.reportError(error);
    } finally {
      this.switching = false;
    }
  }

  private async handlePageEvent(event: LivePageEvent): Promise<void> {
    if (event.type === 'danmaku-sent') {
      await this.recordSentDanmaku(event.content);
      return;
    }
    if (event.type === 'live-ended' && this.room && event.roomId === this.room.roomId) {
      if (this.mode === 'standard') await this.stop();
      else this.reportError(new Error(`直播间 ${this.room.roomId} 已下播，等待选择新房间`));
      return;
    }
    if (event.type === 'room-info' && this.room) {
      this.room = { ...this.room, ...compact(event.info), roomId: this.room.roomId };
      this.emitState();
    }
  }

  private async recordSentDanmaku(content: string): Promise<void> {
    const roomId = this.room?.roomId;
    if (!roomId || this.history.hasRecentDuplicate(roomId, content)) return;
    this.history.append({ content, roomId, sentAt: Date.now() });
    this.emitState();
  }

  private reportError(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.emitState();
  }

  private emitState(): void {
    this.emit('state', this.state());
  }
}

function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function normalizeWindowsExitCode(code: number | null): number | null {
  return code !== null && code > 0x7fff_ffff ? code - 0x1_0000_0000 : code;
}

function isRecoverableModelOutputError(error: Error): boolean {
  return (
    error.name === 'AI_NoObjectGeneratedError' ||
    error.message.includes('response did not match schema')
  );
}

function emptySnapshot(): VigiliaSnapshot {
  return {
    activeOperations: [],
    performance: { archiveDurationMs: 0, signalDurationMs: 0, thinkDurationMs: 0 },
    state: 'idle',
    throughSequence: 0,
    totals: {
      archives: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      percepts: 0,
      signals: 0,
      thoughts: 0,
    },
  };
}

function countCharacters(value: string): number {
  return [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value)].length;
}

function formatStartError(error: unknown): Error {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (normalized.message === 'Please check your config!') {
    return new Error(
      `语音模型配置无效，请检查 CIEL_DATA_DIR：${process.env.CIEL_DATA_DIR ?? '未设置'}`,
      { cause: normalized },
    );
  }
  return normalized;
}

function assertAurisModels(): void {
  const dataPath = process.env.CIEL_DATA_DIR;
  const models = dataPath && join(dataPath, 'models');
  const required = models
    ? [
        join(models, 'asr', 'sense-voice', 'model.int8.onnx'),
        join(models, 'asr', 'sense-voice', 'tokens.txt'),
        join(models, 'speaker', 'model.onnx'),
        join(models, 'vad', 'ten-vad.int8.onnx'),
      ]
    : [];
  if (dataPath && required.every(existsSync)) return;
  throw new Error(`缺少语音模型，请检查 CIEL_DATA_DIR：${dataPath ?? '未设置'}`);
}
