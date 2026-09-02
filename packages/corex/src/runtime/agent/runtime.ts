import {
  convertToLlm as defaultConvertToLlm,
  runAgentLoop,
  runAgentLoopContinue,
} from '@earendil-works/pi-agent-core';
import type {
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  StreamFn,
} from '@earendil-works/pi-agent-core';
import {
  isContextOverflow,
  type AssistantMessage,
  type ImageContent,
  type TextContent,
} from '@earendil-works/pi-ai';
import { streamSimple as defaultStream } from '@earendil-works/pi-ai/compat';

import type { AnyCue } from '#model/cue/index.ts';
import { createEngramView, type Engram } from '#model/engram/index.ts';
import type { LLMContent } from '#model/llm/index.ts';

import { cielOperation, CielOperation, type Instrument } from '../instrumentation.ts';
import type { ResolvedTool } from '../plugins.ts';
import {
  compactProjectedContext,
  countContextTokens,
  readLastContextTokens,
  resolveCompactionOptions,
  type ResolvedCompactionOptions,
} from './compaction.ts';
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
  readonly compaction: ResolvedCompactionOptions | undefined;
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

interface PendingThought {
  cue: AnyCue;
  readonly promise: Promise<readonly AgentMessage[]>;
}

function resolveAgentRuntimeOptions(
  options: CreateAgentRuntimeOptions,
): ResolvedAgentRuntimeOptions {
  const {
    convertToLlm: customConvertToLlm,
    compaction,
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
  const convertToLlm: AgentMessageConverter = customConvertToLlm ?? defaultConvertToLlm;
  const operations = instrumentAgentOperations({
    instrument,
    prompt: prompt ?? (frame => createDefaultPrompt(frame, hasProjectors)),
    stream,
    tools,
  });
  const sessionAddress = { cielId, sessionId };
  const compactionOptions = resolveCompactionOptions(compaction, model);

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
    compaction: compactionOptions,
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

function assertSuccessful(messages: readonly AgentMessage[], contextWindow: number): void {
  const assistant = messages.findLast(
    (message): message is AssistantMessage => message.role === 'assistant',
  );

  if (assistant && isContextOverflow(assistant, contextWindow)) {
    throw new Error(assistant.errorMessage ?? 'Agent context still overflows after compaction');
  }

  if (assistant?.stopReason === 'error' || assistant?.stopReason === 'aborted') {
    throw new Error(assistant.errorMessage ?? `Agent stopped with ${assistant.stopReason}`);
  }
}

function overflowMessage(
  messages: readonly AgentMessage[],
  contextWindow: number,
): AssistantMessage | undefined {
  const assistant = messages.findLast(
    (message): message is AssistantMessage => message.role === 'assistant',
  );

  return assistant && isContextOverflow(assistant, contextWindow) ? assistant : undefined;
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntime {
  const {
    compaction,
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
  const pendingThoughts = new Map<string, PendingThought>();
  let status: AgentRuntimeStatus = 'idle';
  let queue = Promise.resolve();
  let history: AgentMessage[] = [];
  let contextTokens = 0;

  async function loadHistory(): Promise<void> {
    if (!sessionStore) return;
    history = [...(await sessionStore.load(sessionAddress))];
    contextTokens = readLastContextTokens(history) ?? 0;
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

    if (compaction) {
      const compacted = await compactProjectedContext({
        convertToLlm: loopConfig.convertToLlm,
        fallbackTokens: contextTokens,
        instructions,
        messages: history,
        model: loopConfig.model,
        options: compaction,
        pendingMessages: prompts,
        stream,
        tools,
      });
      history = compacted.messages;
      contextTokens = compacted.tokens;
    }

    const run = () =>
      runAgentLoop(
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
    let newMessages = await run();
    let persistedMessages = newMessages;
    const overflow = overflowMessage(newMessages, loopConfig.model.contextWindow);

    if (overflow && compaction) {
      const messagesBeforeOverflow = newMessages.slice(0, -1);
      const recovered = await compactProjectedContext({
        convertToLlm: loopConfig.convertToLlm,
        fallbackTokens: Math.max(contextTokens, loopConfig.model.contextWindow),
        force: true,
        instructions,
        messages: [...history, ...messagesBeforeOverflow],
        model: loopConfig.model,
        options: compaction,
        pendingMessages: [],
        stream,
        tools,
      });

      if (recovered.compacted) {
        history = recovered.messages;
        contextTokens = recovered.tokens;
        newMessages = await runAgentLoopContinue(
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
        persistedMessages = [...messagesBeforeOverflow, ...newMessages];
      }
    }

    assertSuccessful(newMessages, loopConfig.model.contextWindow);
    await persist(persistedMessages);
    history = [...history, ...newMessages];
    contextTokens =
      readLastContextTokens(history) ??
      (compaction
        ? await countContextTokens({
            convertToLlm: loopConfig.convertToLlm,
            fallbackTokens: contextTokens,
            instructions,
            messages: history,
            model: loopConfig.model,
            options: compaction,
            tools,
          })
        : contextTokens);
    consumer.commit(checkout);
    return persistedMessages;
  }

  function readStatus(): AgentRuntimeStatus {
    return status;
  }

  function readMessages(): readonly AgentMessage[] {
    return [...history];
  }

  function readContextTokens(): number {
    return contextTokens;
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

    const cueMetadata = {
      cueAt: cue.temporal.at,
      cueDefinitionId: cue.definition.id,
      cueDefinitionName: cue.definition.name,
    };
    const submitted = instrument(
      (value: AnyCue) => value,
      cielOperation(CielOperation.CueSubmit, cueMetadata),
    )(cue);
    const coalesceKey = submitted.definition.coalesce ? submitted.definition.id : undefined;
    const pending = coalesceKey ? pendingThoughts.get(coalesceKey) : undefined;
    if (pending) {
      pending.cue = submitted;
      return pending.promise;
    }

    let queued!: PendingThought;
    const thought = queue.then(() => {
      if (coalesceKey) pendingThoughts.delete(coalesceKey);
      if (status !== 'running') {
        throw new Error('Agent stopped before queued thought started');
      }

      const current = queued.cue;
      const run = instrument(
        execute,
        cielOperation(CielOperation.AgentRun, {
          cueAt: current.temporal.at,
          cueDefinitionId: current.definition.id,
          cueDefinitionName: current.definition.name,
        }),
      );
      return run(current);
    });

    queued = { cue: submitted, promise: thought };
    if (coalesceKey) pendingThoughts.set(coalesceKey, queued);

    queue = thought.then(
      () => undefined,
      () => undefined,
    );

    return thought;
  }

  const think = enqueue;

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
    get contextTokens() {
      return readContextTokens();
    },
    start,
    think,
    stop,
  };

  return agentRuntime;
}
