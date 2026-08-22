import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';

import { createToolCompatibleObjectOutput } from './tool-compatible-output.ts';

type ParseContext = Parameters<
  ReturnType<typeof createToolCompatibleObjectOutput>['parseCompleteOutput']
>[1];

const context = {
  finishReason: 'stop' as const,
  response: {
    id: 'test',
    modelId: 'test',
    timestamp: new Date(0),
  },
  usage: {
    inputTokenDetails: {},
    inputTokens: 0,
    outputTokenDetails: {},
    outputTokens: 0,
    totalTokens: 0,
  },
} as ParseContext;

describe('createToolCompatibleObjectOutput', () => {
  it('does not send a structured response format to tool-calling models', async () => {
    const output = createToolCompatibleObjectOutput(z.object({ action: z.literal('stay') }));

    await expect(output.responseFormat).resolves.toEqual({ type: 'text' });
    await expect(
      output.parseCompleteOutput({ text: '{"action":"stay"}' }, context),
    ).resolves.toEqual({ action: 'stay' });
  });

  it('still validates the final text against the schema', async () => {
    const output = createToolCompatibleObjectOutput(z.object({ action: z.literal('stay') }));

    await expect(
      output.parseCompleteOutput({ text: '{"action":"switch"}' }, context),
    ).rejects.toMatchObject({ name: 'AI_NoObjectGeneratedError' });
  });

  it.each([
    ['markdown fences', '```json\n{"action":"stay"}\n```'],
    ['surrounding prose', '最终决策如下：\n{"action":"stay"}\n以上。'],
    [
      'nested objects and escaped quotes',
      'result: {"action":"stay","detail":{"reason":"他说\\"继续\\""}} done',
    ],
  ])('extracts JSON from %s', async (_name, text) => {
    const output = createToolCompatibleObjectOutput(
      z.object({
        action: z.literal('stay'),
        detail: z.object({ reason: z.string() }).optional(),
      }),
    );

    await expect(output.parseCompleteOutput({ text }, context)).resolves.toMatchObject({
      action: 'stay',
    });
  });
});
