import { runAgentLoop } from '@earendil-works/pi-agent-core';
import type {
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  StreamFn,
} from '@earendil-works/pi-agent-core';
import type { AssistantMessage, ImageContent, Message, TextContent } from '@earendil-works/pi-ai';
import { streamSimple as defaultStream } from '@earendil-works/pi-ai/compat';

import type { AnyCue } from '#model/cue/index.ts';
import { createEngramView, type Engram } from '#model/engram/index.ts';
import type { LLMContent } from '#model/llm/index.ts';

import { CielOperationName, type Instrument } from '../instrumentation.ts';
import type { ResolvedTool } from '../plugins.ts';
import { instrumentAgentOperations } from './instrumentation.ts';
import { createAgentSessionKey } from './session.ts';
import type {
  AgentEventHandler,
  AgentFrame,
  AgentMessageConverter,
  AgentContextBuilder,
  AgentPrompt,
  AgentRuntime,
  AgentRuntimeStatus,
  AgentSessionAddress,
  AgentSessionStore,
  CielAgentOptions,
} from './types.ts';

interface CreateAgentRuntimeOptions extends Omit<CielAgentOptions, 'sessionId'> {
  readonly cielId: string;
  readonly engram: Engram;
  readonly hasProjectors: boolean;
  readonly instrument: Instrument;
  readonly project: AgentContextBuilder;
  readonly sessionId: string;
  readonly tools: readonly ResolvedTool[] | undefined;
}

interface ResolvedAgentRuntimeOptions {
  readonly engram: Engram;
  readonly instrument: Instrument;
  readonly loopConfig: AgentLoopConfig;
  readonly onAgentEvent: AgentEventHandler | undefined;
  readonly project: AgentContextBuilder;
  readonly prompt: AgentPrompt;
  readonly sessionAddress: AgentSessionAddress;
  readonly sessionStore: AgentSessionStore | false | undefined;
  readonly stream: StreamFn;
  readonly instructions: string;
  readonly tools: readonly AgentTool<any>[] | undefined;
}

function resolveAgentRuntimeOptions(
  options: CreateAgentRuntimeOptions,
): ResolvedAgentRuntimeOptions {
  const {
    convertToLlm: customConvertToLlm,
    cielId,
    engram,
    hasProjectors,
    instrument,
    instructions,
    model,
    onAgentEvent,
    project,
    sessionId,
    sessionStore,
    prompt,
    stream = defaultStream,
    tools,
    ...loopOptions
  } = options;
  const convertToLlm: AgentMessageConverter =
    customConvertToLlm ?? (messages => messages as Message[]);
  const operations = instrumentAgentOperations({
    instrument,
    prompt: prompt ?? (frame => createDefaultPrompt(frame, hasProjectors)),
    stream,
    tools,
  });
  const sessionAddress = { cielId, sessionId };

  return {
    engram,
    instrument,
    loopConfig: {
      ...loopOptions,
      model,
      convertToLlm,
      sessionId: createAgentSessionKey(sessionAddress),
    },
    onAgentEvent,
    project,
    prompt: operations.prompt,
    sessionAddress,
    sessionStore,
    stream: operations.stream,
    instructions,
    tools: operations.tools,
  };
}

function convertContent(content: LLMContent): TextContent | ImageContent {
  if (content.type === 'text') {
    return content;
  }
  if (content.type === 'audio') {
    return {
      type: 'text',
      text: `[Audio omitted: ${content.mimeType ?? 'unknown media type'}]`,
    };
  }

  const data =
    typeof content.data === 'string'
      ? content.data
      : content.data instanceof URL
        ? content.data.toString()
        : Buffer.from(content.data).toString('base64');

  return {
    type: 'image',
    data,
    mimeType: content.mimeType ?? 'image/jpeg',
  };
}

function createDefaultPrompt(frame: AgentFrame, useProjectors: boolean): AgentMessage {
  const content: (TextContent | ImageContent)[] = [];

  if (useProjectors) {
    for (const [name, projected] of Object.entries(frame.context)) {
      if (projected.length > 0) {
        content.push({ type: 'text', text: `Context: ${name}` }, ...projected.map(convertContent));
      }
    }
  } else {
    content.push(...frame.delta.flatMap(entry => entry.value.contents.map(convertContent)));
  }

  if (frame.cue.definition.prompt !== undefined) {
    content.push({ type: 'text', text: frame.cue.definition.prompt });
  }
  if (content.length === 0) {
    throw new Error(
      'Agent prompt is empty; write a Percept, install a Projector, or set Cue.prompt',
    );
  }

  return {
    role: 'user',
    content,
    timestamp: Date.now(),
  };
}

function assertSuccessful(messages: readonly AgentMessage[]): void {
  const assistant = messages.findLast(
    (message): message is AssistantMessage => message.role === 'assistant',
  );

  if (assistant?.stopReason === 'error' || assistant?.stopReason === 'aborted') {
    throw new Error(assistant.errorMessage ?? `Agent stopped with ${assistant.stopReason}`);
  }
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime {
  const {
    engram,
    instrument,
    instructions,
    loopConfig,
    onAgentEvent,
    project,
    prompt,
    sessionAddress,
    sessionStore,
    stream,
    tools,
  } = resolveAgentRuntimeOptions(options);
  const consumer = engram.createConsumer('agent');
  let status: AgentRuntimeStatus = 'idle';
  let queue = Promise.resolve();
  let history: AgentMessage[] = [];

  async function loadHistory(): Promise<void> {
    if (!sessionStore) return;
    history = [...(await sessionStore.load(sessionAddress))];
  }

  async function persist(messages: readonly AgentMessage[]): Promise<void> {
    if (!sessionStore) return;
    try {
      await sessionStore.append(sessionAddress, messages);
    } catch (error) {
      await loadHistory();
      throw error;
    }
  }

  async function execute(cue: AnyCue): Promise<readonly AgentMessage[]> {
    const checkout = consumer.checkout();
    const entries = engram.recent({ through: checkout.through });
    const frame: AgentFrame = {
      cue,
      checkout,
      engram: createEngramView(entries),
      delta: checkout.entries,
      context: await project(entries),
    };
    const produced = await prompt(frame);
    const prompts = Array.isArray(produced) ? [...produced] : [produced as AgentMessage];
    const newMessages = await runAgentLoop(
      prompts,
      {
        systemPrompt: instructions,
        messages: [...history],
        tools: tools ? [...tools] : undefined,
      },
      loopConfig,
      async event => onAgentEvent?.(event),
      undefined,
      stream,
    );

    assertSuccessful(newMessages);
    await persist(newMessages);
    history = [...history, ...newMessages];
    consumer.commit(checkout);
    return newMessages;
  }

  function readStatus(): AgentRuntimeStatus {
    return status;
  }

  function readMessages(): readonly AgentMessage[] {
    return [...history];
  }

  async function start(): Promise<void> {
    if (status === 'running') {
      return;
    }
    if (status !== 'idle') {
      throw new Error(`Cannot start Agent while it is ${status}`);
    }
    await loadHistory();
    status = 'running';
  }

  function enqueue(cue: AnyCue): Promise<readonly AgentMessage[]> {
    if (status !== 'running') {
      return Promise.reject(new Error(`Cannot think while Agent is ${status}`));
    }

    const thought = queue.then(() => {
      if (status !== 'running') {
        throw new Error('Agent stopped before queued thought started');
      }
      return execute(cue);
    });

    queue = thought.then(
      () => undefined,
      () => undefined,
    );

    return thought;
  }

  const think = instrument(enqueue, {
    name: CielOperationName.AgentThink,
  });

  async function stop(): Promise<void> {
    if (status === 'idle') {
      return;
    }
    status = 'stopping';
    try {
      await queue;
    } finally {
      status = 'idle';
    }
  }

  const agentRuntime: AgentRuntime = {
    get status() {
      return readStatus();
    },

    get messages() {
      return readMessages();
    },
    start,
    think,
    stop,
  };

  return agentRuntime;
}
