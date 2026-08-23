// @env node

import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createBliveAI } from '@ciels/blive';
import { Ciel, Memory } from '@ciels/core';
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/core';
import { createBridge } from '@ciels/vigilia-bridge';
import type { CielBridge } from '@ciels/vigilia-bridge';
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
  DANMAKU_PROMPT_HISTORY_LIMIT,
  MAX_DANMAKU_LENGTH,
  ROOM_REVIEW_AFTER_MS,
} from './constants.ts';
import { DanmakuHistory } from './danmaku-history.ts';
import type { LivePage } from './live-page.ts';
import { BilibiliLiveSession } from './live-session.ts';
import {
  AUTONOMOUS_MODE_PROMPT,
  COMMON_BLIVE_PROMPT,
  createRoomContextMessage,
  EXPLORE_LIVE_ROOMS_PROMPT,
  STANDARD_MODE_PROMPT,
} from './prompts.ts';
import { createToolCompatibleObjectOutput } from './tool-compatible-output.ts';
import { createBliveTools, createExploreTools } from './tools.ts';

interface RuntimeControllerEvents {
  state: [BliveDesktopState];
  vigilia: [AnyVigiliaEvent, VigiliaSnapshot];
}

const thoughtSchema = z.object({
  action: z.enum(['explore', 'stay']),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).max(5),
  reason: z.string(),
  score: z.number().min(0).max(100),
});
const VIGILIA_BRIDGE_HOST = '127.0.0.1';
const VIGILIA_BRIDGE_PORT = 3210;
const VIGILIA_ASSET_BASE_URL = `http://${VIGILIA_BRIDGE_HOST}:${VIGILIA_BRIDGE_PORT}/assets/`;
const EXPLORE_RETRY_AFTER_MS = 10_000;
const MAX_EXPLORE_PAGES = 10;

export class RuntimeController extends EventEmitter<RuntimeControllerEvents> {
  private readonly catalog = new AreaCatalog();
  private readonly accountManager = new BilibiliAccountManager();
  private readonly history = new DanmakuHistory();
  private readonly livePage: LivePage;
  private readonly userDataPath: string;
  private areaUrl?: string;
  private account?: BliveDesktopState['account'];
  private bridge?: CielBridge;
  private ciel?: Ciel<BliveThought>;
  private events: AnyVigiliaEvent[] = [];
  private exploring = false;
  private exploreRetryTimer?: ReturnType<typeof setTimeout>;
  private lastCandidates = new Set<number>();
  private lastError?: string;
  private mode: BliveMode = 'standard';
  private danmakuDelivery: BliveStartOptions['danmakuDelivery'] = 'simulate';
  private memory?: Memory;
  private liveSession?: BilibiliLiveSession;
  private room?: LiveRoomInfo;
  private roomStartedAt = 0;
  private snapshot: VigiliaSnapshot = emptySnapshot();
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
      ...(this.bridge ? { assetBaseUrl: VIGILIA_ASSET_BASE_URL } : {}),
      connected: true,
      danmakuDelivery: this.danmakuDelivery,
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
    this.danmakuDelivery = options.danmakuDelivery;
    this.areaUrl = options.areaUrl?.trim() || undefined;
    this.lastError = undefined;
    this.events = [];
    this.snapshot = emptySnapshot();
    try {
      await this.startRuntime();
      if (options.mode === 'autonomous') {
        await this.exploreRooms('initial').catch(() => undefined);
        return;
      }
      await this.openRoom(options.roomId, '打开用户指定的直播间');
    } catch (error) {
      const normalized = formatStartError(error);
      await this.stop();
      this.reportError(normalized);
      throw normalized;
    }
  }

  async stop(): Promise<void> {
    const bridge = this.bridge;
    this.bridge = undefined;
    const ciel = this.ciel;
    this.ciel = undefined;
    this.exploring = false;
    if (this.exploreRetryTimer) clearTimeout(this.exploreRetryTimer);
    this.exploreRetryTimer = undefined;
    const memory = this.memory;
    this.memory = undefined;
    this.liveSession = undefined;
    this.unsubscribeVigilia?.();
    this.unsubscribeVigilia = undefined;
    await bridge?.stop().catch(error => this.reportError(error));
    if (ciel) await ciel.stop().catch(error => this.reportError(error));
    await memory?.close().catch(error => this.reportError(error));
    this.room = undefined;
    this.roomStartedAt = 0;
    this.emitState();
  }

  async sendDanmaku(content: string): Promise<void> {
    const room = this.room;
    if (!room || !this.ciel) throw new Error('当前没有正在运行的直播间');
    const normalized = content.trim();
    if (!normalized || countCharacters(normalized) > MAX_DANMAKU_LENGTH) {
      throw new Error(`弹幕长度必须为 1～${MAX_DANMAKU_LENGTH} 个字符`);
    }
    if (this.history.hasRecentDuplicate(room.roomId, normalized)) {
      throw new Error('这条弹幕最近已经发送过');
    }
    await this.livePage.sendDanmaku(normalized);
    await this.recordSentDanmaku(normalized);
  }

  async close(): Promise<void> {
    await this.stop();
    this.catalog.close();
    this.removeAllListeners();
  }

  private async startRuntime(): Promise<void> {
    assertAurisModels();
    const ffmpegPath = process.env.BLIVE_FFMPEG_PATH?.trim();
    const liveSession = new BilibiliLiveSession(ffmpegPath);
    this.liveSession = liveSession;
    const { embedder, model } = createBliveAI();
    const memory = new Memory({
      embedder,
      model,
      path: join(this.userDataPath, 'memory.db'),
      resourceId: 'blive:desktop',
    });
    this.memory = memory;
    const tools = createBliveTools({
      sendDanmaku: content => this.sendDanmaku(content),
      simulateDanmaku: this.danmakuDelivery === 'simulate',
    });
    const ciel = new Ciel<BliveThought>(liveSession, {
      vigilia: {
        assetRoot: process.env.CIEL_DATA_DIR,
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
        memory,
        messages: [() => ({ role: 'user', content: this.createDynamicContext() })],
        minThinkInterval: 10_000,
        model,
        prepareStep: ({ steps }) => {
          const interactionResolved = steps.some(step =>
            step.toolCalls.some(call => call.toolName === 'send_danmaku'),
          );
          if (interactionResolved) {
            return {
              activeTools: [],
              toolChoice: 'none',
            };
          }
          return {
            activeTools: ['send_danmaku'],
            toolChoice: { toolName: 'send_danmaku', type: 'tool' },
          };
        },
        output: createToolCompatibleObjectOutput(thoughtSchema),
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
    liveSession.onStderr(message => {
      ffmpegErrors.push(message);
      if (ffmpegErrors.length > 4) ffmpegErrors.shift();
    });
    liveSession.onError(error => this.reportError(error));
    liveSession.onClose(event => {
      if (event.expected || event.code === 0 || this.ciel !== ciel) return;
      const normalizedCode = normalizeWindowsExitCode(event.code);
      const detail = ffmpegErrors.at(-1);
      this.reportError(
        new Error(
          `FFmpeg 异常退出（room=${event.roomId}, code=${String(normalizedCode)}, signal=${String(event.signal)}）${detail ? `：${detail}` : ''}`,
        ),
      );
      if (this.mode === 'autonomous') {
        setTimeout(() => void this.exploreRooms('stream-ended').catch(() => undefined), 0);
      }
    });
    let bridge: CielBridge | undefined;
    try {
      await ciel.start();
      bridge = createBridge(ciel).listen({
        hostname: VIGILIA_BRIDGE_HOST,
        port: VIGILIA_BRIDGE_PORT,
      });
      this.ciel = ciel;
      this.bridge = bridge;
      this.snapshot = ciel.vigilia.snapshot();
      this.unsubscribeVigilia = unsubscribeVigilia;
      this.emitState();
    } catch (error) {
      unsubscribeVigilia();
      await bridge?.stop();
      this.bridge = undefined;
      if (this.memory === memory) this.memory = undefined;
      await memory.close().catch(closeError => this.reportError(closeError));
      this.liveSession = undefined;
      this.room = undefined;
      this.snapshot = emptySnapshot();
      throw formatStartError(error);
    }
  }

  private async openRoom(requestedRoomId: number, _reason: string): Promise<LiveRoomInfo> {
    const liveSession = this.liveSession;
    if (!liveSession || !this.ciel) throw new Error('直播运行时尚未启动');
    if (!this.lastCandidates.has(requestedRoomId) && this.mode === 'autonomous') {
      throw new Error(`不能打开本次探索候选之外的直播间：${requestedRoomId}`);
    }
    const room = await fetchLiveRoomInfo(requestedRoomId);
    if (!room.live) throw new Error(`直播间 ${room.roomId} 当前未开播`);
    await this.livePage.open(room.roomId);
    await liveSession.open(room.roomId);
    this.room = room;
    this.roomStartedAt = Date.now();
    this.lastError = undefined;
    this.emitState();
    return room;
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
    if (page === 1) this.lastCandidates.clear();
    const candidates = result.candidates.filter(item => item.roomId !== this.room?.roomId);
    for (const candidate of candidates) this.lastCandidates.add(candidate.roomId);
    return {
      ...result,
      candidates,
    };
  }

  private async exploreRooms(reason: 'initial' | 'live-ended' | 'not-interested' | 'stream-ended') {
    const ciel = this.ciel;
    if (!ciel || this.mode !== 'autonomous') return;
    if (this.exploring) {
      this.scheduleExploreRetry(reason);
      return;
    }
    if (this.exploreRetryTimer) clearTimeout(this.exploreRetryTimer);
    this.exploreRetryTimer = undefined;
    this.exploring = true;
    const previousRoom = this.room;
    let openedRoom: LiveRoomInfo | undefined;
    try {
      await ciel.think({
        name: reason === 'initial' ? 'select-initial-live-room' : 'find-next-live-room',
        output: Output.text(),
        prepareStep: ({ steps }) => {
          const calls = steps.flatMap(step => step.toolCalls);
          const listCalls = calls.filter(call => call.toolName === 'list_live_rooms');
          if (listCalls.length === 0) {
            return {
              activeTools: ['list_live_rooms'],
              toolChoice: { toolName: 'list_live_rooms', type: 'tool' },
            };
          }
          if (!calls.some(call => call.toolName === 'open_live_room')) {
            if (listCalls.length < MAX_EXPLORE_PAGES) {
              return {
                activeTools: ['list_live_rooms', 'open_live_room'],
                toolChoice: 'required',
              };
            }
            return {
              activeTools: ['open_live_room'],
              toolChoice: { toolName: 'open_live_room', type: 'tool' },
            };
          }
          return { activeTools: [], toolChoice: 'none' };
        },
        prompt: [
          `探索原因：${explorationReason(reason)}`,
          previousRoom
            ? `当前房间 ${previousRoom.roomId}（${previousRoom.streamerName} / ${previousRoom.title}）已不适合继续停留，不得再选它。`
            : '当前还没有打开任何直播间。',
        ].join('\n'),
        system: [EXPLORE_LIVE_ROOMS_PROMPT],
        tools: createExploreTools({
          listLiveRooms: (page, limit) => this.listLiveRooms(page, limit),
          openLiveRoom: async (roomId, selectionReason) => {
            openedRoom = await this.openRoom(roomId, selectionReason);
            return openedRoom;
          },
        }),
      });
      if (this.ciel !== ciel) return;
      if (!openedRoom) throw new Error('自主探索未实际打开任何直播间');
      if (this.room?.roomId !== openedRoom.roomId)
        throw new Error('当前直播间与 open_live_room 工具结果不一致');
    } catch (error) {
      this.reportError(error);
      this.scheduleExploreRetry(reason);
      throw error;
    } finally {
      this.exploring = false;
    }
  }

  private scheduleExploreRetry(
    reason: 'initial' | 'live-ended' | 'not-interested' | 'stream-ended',
  ): void {
    if (this.exploreRetryTimer || !this.ciel || this.mode !== 'autonomous') return;
    this.exploreRetryTimer = setTimeout(() => {
      this.exploreRetryTimer = undefined;
      void this.exploreRooms(reason).catch(() => undefined);
    }, EXPLORE_RETRY_AFTER_MS);
  }

  private handleThought(thought: BliveThought): void {
    if (
      this.mode !== 'autonomous' ||
      thought.action !== 'explore' ||
      Date.now() - this.roomStartedAt < ROOM_REVIEW_AFTER_MS
    ) {
      return;
    }
    setTimeout(() => void this.exploreRooms('not-interested').catch(() => undefined), 0);
  }

  private async handlePageEvent(event: LivePageEvent): Promise<void> {
    if (event.type === 'danmaku-sent') {
      await this.recordSentDanmaku(event.content);
      return;
    }
    if (event.type === 'live-ended' && this.room && event.roomId === this.room.roomId) {
      if (this.mode === 'standard') await this.stop();
      else setTimeout(() => void this.exploreRooms('live-ended').catch(() => undefined), 0);
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

function explorationReason(
  reason: 'initial' | 'live-ended' | 'not-interested' | 'stream-ended',
): string {
  if (reason === 'initial') return '首次进入自主观看模式';
  if (reason === 'not-interested') return '对当前直播内容已不感兴趣';
  if (reason === 'live-ended') return '直播页面确认当前直播已下播';
  return '当前直播流已结束';
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
