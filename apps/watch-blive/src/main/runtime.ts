// @env node

import { EventEmitter } from 'node:events';
import { join } from 'node:path';

import { memoryPlugin } from '@ciels/memory';
import { sensuPlugin } from '@ciels/sensu';
import { telemetry } from '@ciels/telemetry';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { defineCiel, defineCue, defineInterceptor } from 'corex';
import type { AgentFrame, Ciel, LLMContent } from 'corex';
import type { BrowserWindow } from 'electron';

import type { Account, AppState, RoomInfo, StartOptions } from '../shared/types.ts';
import { AccountManager } from './account.ts';
import { createWatchBliveAI } from './ai.ts';
import { fetchRoom, fetchRooms } from './bilibili.ts';
import { LiveView } from './live-view.ts';
import { LiveAudio, LiveMedia, liveMediaPlugin, LiveVideo } from './media.ts';
import { createRuntimeTools } from './tools.ts';

const Explore = defineCue({
  name: 'blive.explore',
  prompt: '先调用 list_live_rooms 获取真实候选，再调用 open_live_room 进入最值得观察的新直播间',
});

const INSTRUCTIONS = `
你正在实时观看 Bilibili 直播。结合听觉、视觉、直播间信息和记忆理解现场。

每轮思考必须调用一次 send_danmaku。出现自然互动机会时发送简短口语化中文弹幕，没有机会时 defer。
优先使用主播昵称，昵称不自然时省略称呼或使用“主播”，避免直接使用“你”。
不得重复最近的表达，不得编造听到或看到的内容。模拟模式只记录工具结果，不操作网页。

自主模式允许在持续缺乏兴趣时输出 JSON：{"action":"explore","reason":"具体原因"}。
标准模式永远留在当前房间。自主探索必须通过 list_live_rooms 和 open_live_room 完成真实切换。
`.trim();

interface RuntimeEvents {
  state: [AppState];
}

export class RuntimeController extends EventEmitter<RuntimeEvents> {
  private readonly accountManager = new AccountManager();
  private readonly media = new LiveMedia();
  private account?: Account;
  private areaId?: number;
  private candidates = new Set<number>();
  private ciel?: Ciel;
  private delivery: StartOptions['danmakuDelivery'] = 'simulate';
  private error?: string;
  private mode: StartOptions['mode'] = 'standard';
  private room?: RoomInfo;

  constructor(
    private readonly liveView: LiveView,
    private readonly userDataPath: string,
  ) {
    super();
  }

  get runtime(): Ciel | undefined {
    return this.ciel;
  }

  async initialize(): Promise<void> {
    this.account = await this.accountManager.current().catch(() => undefined);
    this.publish();
  }

  state(): AppState {
    return {
      ...(this.account ? { account: this.account } : {}),
      danmakuDelivery: this.delivery,
      ...(this.error ? { error: this.error } : {}),
      mode: this.mode,
      ...(this.room ? { room: this.room } : {}),
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
    const { embedder, model, stream } = createWatchBliveAI();
    telemetry({ capture: { input: true, output: true } });
    telemetry.clear();
    const tools = createRuntimeTools({
      autonomous: options.mode === 'autonomous',
      listRooms: page => this.listRooms(page),
      openRoom: roomId => this.openRoom(roomId),
      sendDanmaku: content => this.liveView.sendDanmaku(content),
      simulate: options.danmakuDelivery === 'simulate',
    });
    const ciel = defineCiel({
      id: `watch-blive:${this.account?.uid ?? 'anonymous'}`,
      instructions: `${INSTRUCTIONS}\n\n当前模式：${options.mode === 'autonomous' ? '自主模式' : '标准模式'}`,
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
      if (options.mode === 'standard') await this.openRoom(options.roomId);
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
    if (ciel) await ciel.stop().catch(error => this.fail(error));
    this.room = undefined;
    this.candidates.clear();
    this.liveView.setVisible(false);
    this.publish();
  }

  async close(): Promise<void> {
    await this.stop();
    this.removeAllListeners();
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
    await this.media.open(room.roomId);
    await this.liveView.open(room.roomId);
    this.room = room;
    this.publish();
    return room;
  }

  private prompt(frame: AgentFrame): AgentMessage {
    const content = Object.entries(frame.context).flatMap(([name, values]) => [
      { type: 'text' as const, text: `Context: ${name}` },
      ...values.map(toAgentContent),
    ]);
    content.push({
      type: 'text',
      text: this.room
        ? `当前直播间：${this.room.streamerName} / ${this.room.title} / 房间 ${this.room.roomId}`
        : '当前尚未进入直播间',
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
    if (!/"action"\s*:\s*"explore"/u.test(text)) return;
    setTimeout(() => void this.ciel?.think(Explore.create({ kind: 'instant', at: Date.now() })), 0);
  }

  private fail(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error);
    this.publish();
  }

  private publish(): void {
    this.emit('state', this.state());
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
