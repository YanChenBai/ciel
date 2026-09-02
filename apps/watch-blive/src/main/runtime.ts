// @env node

import { EventEmitter } from 'node:events';
import { join } from 'node:path';

import { createInstrumenter } from '@ciels/interceptor';
import { memoryPlugin } from '@ciels/memory';
import { sensuPlugin } from '@ciels/sensu';
import { telemetry } from '@ciels/telemetry';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { defineCiel, defineCue, defineInterceptor } from 'corex';
import type { AgentFrame, Ciel, LLMContent } from 'corex';
import type { BrowserWindow } from 'electron';

import type {
  Account,
  AppState,
  ConfigurationStatus,
  RoomInfo,
  StartOptions,
} from '../shared/types.ts';
import { AccountManager } from './account.ts';
import { createWatchBliveAI } from './ai.ts';
import { fetchRoom, fetchRooms } from './bilibili.ts';
import { checkRuntimeConfiguration, configurationError } from './configuration.ts';
import { devtoolTransformers } from './devtool.ts';
import { LiveAudio, LiveMedia, liveMediaPlugin, LiveVideo } from './media.ts';
import {
  createInstructions,
  createRoomContextMessage,
  DANMAKU_PROMPT_HISTORY_LIMIT,
  EXPLORE_LIVE_ROOMS_PROMPT,
  ROOM_REVIEW_AFTER_MS,
  type SentDanmaku,
} from './prompts.ts';
import { RoomScorePolicy } from './room-score-policy.ts';
import { createRuntimeTools } from './tools.ts';

const Explore = defineCue({
  name: 'blive.explore',
  prompt: EXPLORE_LIVE_ROOMS_PROMPT,
});

const WatchBliveOperationTag = {
  Room: 'ROOM',
} as const;

const WatchBliveOperation = {
  RoomList: {
    name: 'watch-blive.room.list',
    label: 'Room List',
    tag: WatchBliveOperationTag.Room,
  },
  RoomOpen: {
    name: 'watch-blive.room.open',
    label: 'Room Open',
    tag: WatchBliveOperationTag.Room,
  },
} as const;

interface RuntimeEvents {
  state: [AppState];
}

export class RuntimeController extends EventEmitter<RuntimeEvents> {
  private readonly accountManager = new AccountManager();
  private readonly media = new LiveMedia(error => {
    this.fail(error);
    void this.stop().catch(stopError => this.fail(stopError));
  });
  private readonly roomScorePolicy = new RoomScorePolicy();
  private readonly danmakuHistory: SentDanmaku[] = [];
  private account?: Account;
  private areaId?: number;
  private candidates = new Set<number>();
  private ciel?: Ciel;
  private configuration?: ConfigurationStatus;
  private delivery: StartOptions['danmakuDelivery'] = 'simulate';
  private error?: string;
  private mode: StartOptions['mode'] = 'standard';
  private playbackUrl?: string;
  private room?: RoomInfo;
  private roomStartedAt = 0;

  constructor(private readonly userDataPath: string) {
    super();
  }

  get runtime(): Ciel | undefined {
    return this.ciel;
  }

  async initialize(): Promise<void> {
    [this.account, this.configuration] = await Promise.all([
      this.accountManager.current().catch(() => undefined),
      checkRuntimeConfiguration(),
    ]);
    this.publish();
  }

  state(): AppState {
    return {
      ...(this.account ? { account: this.account } : {}),
      ...(this.configuration ? { configuration: this.configuration } : {}),
      danmakuDelivery: this.delivery,
      ...(this.error ? { error: this.error } : {}),
      mode: this.mode,
      ...(this.room ? { room: this.room } : {}),
      ...(this.playbackUrl ? { playbackUrl: this.playbackUrl } : {}),
      running: this.ciel?.status === 'running',
    };
  }

  async login(parent: BrowserWindow): Promise<void> {
    this.account = await this.accountManager.login(parent);
    this.publish();
  }

  async logout(): Promise<void> {
    await this.stop();
    await this.accountManager.logout();
    this.account = undefined;
    this.publish();
  }

  async start(options: StartOptions): Promise<void> {
    await this.stop();
    this.mode = options.mode;
    this.delivery = options.danmakuDelivery;
    this.areaId = options.mode === 'autonomous' ? options.areaId : undefined;
    this.error = undefined;
    this.configuration = await checkRuntimeConfiguration();
    if (!this.configuration.valid) {
      const error = configurationError(this.configuration);
      this.fail(error);
      throw error;
    }
    const { embedder, model, stream } = createWatchBliveAI();
    telemetry({ capture: { input: true, output: true }, transformers: devtoolTransformers });
    telemetry.clear();
    const instrument = createInstrumenter([telemetry]);
    const listRooms = instrument(
      (page: number) => this.listRooms(page),
      WatchBliveOperation.RoomList,
    );

    const openRoom = instrument(
      (roomId: number) => this.openRoom(roomId),
      WatchBliveOperation.RoomOpen,
    );

    const tools = createRuntimeTools({
      autonomous: options.mode === 'autonomous',
      listRooms,
      openRoom,
      sendDanmaku: content => this.sendDanmaku(content),
      simulate: options.danmakuDelivery === 'simulate',
      onSent: content => this.recordSentDanmaku(content),
    });

    const ciel = defineCiel({
      id: `watch-blive:${this.account?.uid ?? 'anonymous'}`,
      instructions: createInstructions(options.mode),
      model,
      stream,
      sessionStore: false,
      toolExecution: 'sequential',
      tools,
      extensions: [
        defineInterceptor({ name: 'telemetry', interceptor: telemetry }),
        sensuPlugin({
          name: 'blive-sensu',
          vision: { signals: [LiveVideo], differenceThreshold: 0.03, sampleInterval: 0 },
          hearing: { signals: [LiveAudio] },
          projector: { maxVisionFrames: 9 },
          onError: error => this.fail(error),
        }),
        memoryPlugin({
          name: 'blive-memory',
          id: `watch-blive:${this.account?.uid ?? 'anonymous'}`,
          scope: () =>
            this.room
              ? { id: `room:${this.room.roomId}`, label: `${this.room.streamerName} 的直播间` }
              : undefined,
          store: { path: join(this.userDataPath, 'memory') },
          embedder,
          projector: { recentDays: 3, maxEntriesPerDay: 20 },
          tools: { defaultRecallRange: 'all' },
        }),
        liveMediaPlugin(this.media),
      ],
      prompt: frame => this.prompt(frame),
      onAgentEvent: event => {
        if (event.type === 'agent_end') this.inspectDecision(event.messages);
      },
    });
    try {
      await ciel.start();
      this.ciel = ciel;
      this.publish();
      if (options.mode === 'standard') await openRoom(options.roomId);
      else await ciel.think(Explore.create({ kind: 'instant', at: Date.now() }));
    } catch (error) {
      await ciel.stop().catch(() => undefined);
      this.ciel = undefined;
      this.fail(error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    const ciel = this.ciel;
    this.ciel = undefined;
    await this.media.close().catch(error => this.fail(error));
    if (ciel) await ciel.stop().catch(error => this.fail(error));
    this.room = undefined;
    this.playbackUrl = undefined;
    this.roomStartedAt = 0;
    this.roomScorePolicy.reset();
    this.candidates.clear();
    this.publish();
  }

  async close(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
  }

  handlePlayback(request: Request): Response {
    return this.media.handlePlayback(request);
  }

  private async listRooms(page: number) {
    if (!this.areaId) throw new Error('自主模式尚未选择分区');
    const rooms = await fetchRooms(this.areaId, page);
    if (page === 1) this.candidates.clear();
    for (const room of rooms) this.candidates.add(room.roomId);
    return rooms.filter(room => room.roomId !== this.room?.roomId);
  }

  private async openRoom(roomId: number): Promise<RoomInfo> {
    if (this.mode === 'autonomous' && !this.candidates.has(roomId)) {
      throw new Error(`直播间 ${roomId} 不在当前候选中`);
    }
    const room = await fetchRoom(roomId);
    if (!room.live) throw new Error(`直播间 ${room.roomId} 当前未开播`);
    this.ciel?.engram.clear();
    this.playbackUrl = await this.media.open(room.roomId);
    this.room = room;
    this.roomStartedAt = Date.now();
    this.roomScorePolicy.reset();
    this.publish();
    return room;
  }

  private async sendDanmaku(content: string): Promise<void> {
    const roomId = this.room?.roomId;
    if (!roomId) throw new Error('当前尚未进入直播间');
    await this.accountManager.sendDanmaku(roomId, content);
  }

  private prompt(frame: AgentFrame): AgentMessage {
    const content = Object.entries(frame.context).flatMap(([name, values]) => [
      { type: 'text' as const, text: `Context: ${name}` },
      ...values.map(toAgentContent),
    ]);
    content.push({
      type: 'text',
      text: this.room ? this.createDynamicContext(this.room) : '当前尚未进入直播间',
    });
    if (frame.cue.definition.prompt)
      content.push({ type: 'text', text: frame.cue.definition.prompt });
    return { role: 'user', content, timestamp: Date.now() };
  }

  private inspectDecision(messages: readonly AgentMessage[]): void {
    if (this.mode !== 'autonomous' || !this.ciel) return;
    const assistant = messages.findLast(message => message.role === 'assistant');
    if (!assistant || assistant.role !== 'assistant') return;
    const text = assistant.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('');
    const thought = parseRoomDecision(text);
    if (!thought || Date.now() - this.roomStartedAt < ROOM_REVIEW_AFTER_MS) return;
    const decision = this.roomScorePolicy.evaluate({ ...thought, evaluatedAt: Date.now() });
    if (!decision.shouldSwitch) return;
    queueMicrotask(() => {
      void this.ciel
        ?.think(Explore.create({ kind: 'instant', at: Date.now() }))
        .catch(error => this.fail(error));
    });
  }

  private createDynamicContext(room: RoomInfo): string {
    return createRoomContextMessage({
      canSwitch:
        this.mode === 'autonomous' && Date.now() - this.roomStartedAt >= ROOM_REVIEW_AFTER_MS,
      history: this.danmakuHistory
        .filter(item => item.roomId === room.roomId)
        .slice(-DANMAKU_PROMPT_HISTORY_LIMIT),
      room,
      startedAt: this.roomStartedAt,
    });
  }

  private recordSentDanmaku(content: string): void {
    const roomId = this.room?.roomId;
    if (!roomId) return;
    const normalized = content.trim();
    if (!normalized) return;
    const duplicate = this.danmakuHistory
      .slice(-DANMAKU_PROMPT_HISTORY_LIMIT)
      .some(item => item.roomId === roomId && item.content.trim() === normalized);
    if (duplicate) return;
    this.danmakuHistory.push({ content: normalized, roomId, sentAt: Date.now() });
    if (this.danmakuHistory.length > 100)
      this.danmakuHistory.splice(0, this.danmakuHistory.length - 100);
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.publish();
  }

  private publish(): void {
    this.emit('state', this.state());
  }
}

function parseRoomDecision(
  text: string,
):
  | { readonly action: 'explore' | 'stay'; readonly confidence: number; readonly score: number }
  | undefined {
  try {
    const value = JSON.parse(text.trim()) as Record<string, unknown>;
    if (value.action !== 'explore' && value.action !== 'stay') return undefined;
    if (
      typeof value.confidence !== 'number' ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 ||
      value.confidence > 1 ||
      typeof value.score !== 'number' ||
      !Number.isFinite(value.score) ||
      value.score < 0 ||
      value.score > 100
    ) {
      return undefined;
    }
    return { action: value.action, confidence: value.confidence, score: value.score };
  } catch {
    return undefined;
  }
}

function toAgentContent(content: LLMContent) {
  if (content.type === 'text') return content;
  if (content.type === 'audio') return { type: 'text' as const, text: '[Audio omitted]' };
  const data =
    typeof content.data === 'string'
      ? content.data
      : content.data instanceof URL
        ? content.data.toString()
        : Buffer.from(content.data).toString('base64');
  return { type: 'image' as const, data, mimeType: content.mimeType ?? 'image/jpeg' };
}
