// @env node

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

import type { RoomCandidate } from './bilibili.ts';

function result<T>(details: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(details) }], details };
}

export function createRuntimeTools(options: {
  readonly autonomous: boolean;
  readonly listRooms: (page: number) => Promise<readonly RoomCandidate[]>;
  readonly openRoom: (roomId: number) => Promise<unknown>;
  readonly sendDanmaku: (content: string) => Promise<void>;
  readonly simulate: boolean;
}): readonly AgentTool[] {
  const send: AgentTool = {
    name: 'send_danmaku',
    label: 'Send danmaku',
    description: '选择发送一条自然弹幕或暂缓互动，每轮最多调用一次',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('send'), Type.Literal('defer')]),
      content: Type.String({ maxLength: 40 }),
      reason: Type.String({ minLength: 1, maxLength: 120 }),
    }),
    executionMode: 'sequential',
    async execute(_id, input) {
      const request = input as { action: 'send' | 'defer'; content: string; reason: string };
      if (request.action === 'defer') return result({ sent: false, reason: request.reason });
      if (!request.content.trim()) throw new Error('弹幕不能为空');
      if (!options.simulate) await options.sendDanmaku(request.content.trim());
      return result({
        sent: !options.simulate,
        simulated: options.simulate,
        content: request.content,
      });
    },
  };
  if (!options.autonomous) return [send];
  const list: AgentTool = {
    name: 'list_live_rooms',
    label: 'List live rooms',
    description: '读取当前分区的真实直播间候选，探索时必须先调用',
    parameters: Type.Object({ page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })) }),
    async execute(_id, input) {
      return result(await options.listRooms((input as { page?: number }).page ?? 1));
    },
  };
  const open: AgentTool = {
    name: 'open_live_room',
    label: 'Open live room',
    description: '打开 list_live_rooms 返回的直播间，不得编造房间号',
    parameters: Type.Object({ roomId: Type.Integer({ minimum: 1 }) }),
    executionMode: 'sequential',
    async execute(_id, input) {
      return result(await options.openRoom((input as { roomId: number }).roomId));
    },
  };
  return [send, list, open];
}
