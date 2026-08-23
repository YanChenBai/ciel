import { jsonSchema, tool } from 'ai';
import type { ToolSet } from 'ai';

import type { LiveRoomCandidate } from '../shared/types.ts';

interface SendDanmakuInput {
  readonly action: 'defer' | 'send';
  readonly content: string;
  readonly reason: string;
}

interface ListLiveRoomsInput {
  readonly limit?: number;
  readonly page?: number;
}

interface OpenLiveRoomInput {
  readonly reason: string;
  readonly roomId: number;
}

export function createExploreTools(options: {
  readonly listLiveRooms: (
    page: number,
    limit: number,
  ) => Promise<{
    readonly candidates: readonly LiveRoomCandidate[];
    readonly hasMore: boolean;
    readonly page: number;
  }>;
  readonly openLiveRoom: (roomId: number, reason: string) => Promise<unknown>;
}): ToolSet {
  return {
    list_live_rooms: createListLiveRoomsTool(options.listLiveRooms),
    open_live_room: tool({
      description:
        '打开本次 list_live_rooms 真实返回的一个候选直播间。确认选择后必须调用，不得编造房间号。',
      inputSchema: jsonSchema<OpenLiveRoomInput>({
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: '选择该直播间的具体理由',
          },
          roomId: {
            type: 'integer',
            minimum: 1,
            description: '必须来自本次 list_live_rooms 结果的房间号',
          },
        },
        required: ['reason', 'roomId'],
        additionalProperties: false,
      }),
      execute: ({ reason, roomId }) => options.openLiveRoom(roomId, reason),
    }),
  };
}

export function createBliveTools(options: {
  readonly sendDanmaku: (content: string) => Promise<void>;
  readonly simulateDanmaku?: boolean;
}): ToolSet {
  const tools: ToolSet = {
    send_danmaku: tool({
      description:
        '决定本轮弹幕行动。action=send 时向当前直播间发送 content；没有自然互动机会时使用 action=defer 并说明 reason。出现演唱节点、问答、笑点、故事转折或首次自然互动机会时优先 send。',
      inputSchema: jsonSchema<SendDanmakuInput>({
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['send', 'defer'],
            description: '发送弹幕或暂缓本轮互动',
          },
          content: {
            type: 'string',
            maxLength: 40,
            description:
              'action=send 时填写要发送的简短中文弹幕，可以包含一个允许的 emoji 标签；action=defer 时传空字符串',
          },
          reason: {
            type: 'string',
            minLength: 1,
            maxLength: 120,
            description: '选择发送或暂缓的具体现场原因',
          },
        },
        required: ['action', 'content', 'reason'],
        additionalProperties: false,
      }),
      execute: async ({ action, content, reason }) => {
        if (action === 'defer') return { reason, sent: false };
        if (!content?.trim()) throw new Error('action=send 时必须提供弹幕 content');
        if (options.simulateDanmaku) {
          return { content, reason, sent: false, simulated: true };
        }
        await options.sendDanmaku(content);
        return { content, reason, sent: true, simulated: false };
      },
    }),
  };
  return tools;
}

function createListLiveRoomsTool(listLiveRooms: (page: number, limit: number) => Promise<unknown>) {
  return tool({
    description: '通过 Bilibili API 获取已选分区的真实直播间候选。每次探索必须从 page=1 开始。',
    inputSchema: jsonSchema<ListLiveRoomsInput>({
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: '最多返回多少个候选直播间，默认 20',
        },
        page: {
          type: 'integer',
          minimum: 1,
          description: '逻辑页码。page=1 重置，后续按 2、3 继续无限滚动',
        },
      },
      additionalProperties: false,
    }),
    execute: ({ limit, page }) => listLiveRooms(page ?? 1, limit ?? 20),
  });
}
