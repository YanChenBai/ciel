import type { StreamFn } from '@earendil-works/pi-agent-core';
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from '@earendil-works/pi-ai';

export const testModel = {
  id: 'test',
  name: 'Test',
  api: 'openai-responses',
  provider: 'openai',
  baseUrl: 'https://example.invalid',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100_000,
  maxTokens: 4_096,
} as Model<any>;

export function assistantMessage(
  text = 'ok',
  stopReason: AssistantMessage['stopReason'] = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: testModel.api,
    provider: testModel.provider,
    model: testModel.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    errorMessage: stopReason === 'error' ? text : undefined,
    timestamp: Date.now(),
  };
}

export function streamResult(message = assistantMessage()): ReturnType<StreamFn> {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: { ...message, stopReason: 'pending' } });
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      stream.push({ type: 'error', reason: message.stopReason, error: message });
    } else {
      const reason = message.stopReason === 'pending' ? 'stop' : message.stopReason;
      stream.push({ type: 'done', reason, message: { ...message, stopReason: reason } });
    }
  });
  return stream;
}

export const testStream: StreamFn = () => streamResult();
