import type { AnyVigiliaEvent, VigiliaObservationCategory } from '@ciels/core';

export type VigiliaStepLane =
  | 'asr'
  | 'context'
  | 'memory'
  | 'model'
  | 'nucleus'
  | 'sensory'
  | 'tool'
  | 'vision';
export type VigiliaStepStatus = 'completed' | 'failed' | 'running';

export interface VigiliaStep {
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly events: readonly AnyVigiliaEvent[];
  readonly id: string;
  readonly input?: unknown;
  readonly lane: VigiliaStepLane;
  readonly name: string;
  readonly output?: unknown;
  readonly parentId?: string;
  readonly startedAt: number;
  readonly status: VigiliaStepStatus;
}

export interface VigiliaThoughtRun {
  readonly completedAt?: number;
  readonly durationMs?: number;
  readonly id: string;
  readonly inputPercepts: readonly VigiliaPerceptRecord[];
  readonly output?: unknown;
  readonly startedAt: number;
  readonly status: VigiliaStepStatus;
  readonly steps: readonly VigiliaStep[];
  readonly trigger: string;
}

export interface VigiliaPerceptRecord {
  readonly content?: unknown;
  readonly perceptType: string;
  readonly sequence: number;
  readonly signal: string;
  readonly stimulus: string;
  readonly time: number;
}

export type VigiliaConversationEntryKind = 'asr' | 'model' | 'percept' | 'reading' | 'visual';

export interface VigiliaConversationEntry {
  readonly content?: unknown;
  readonly id: string;
  readonly kind: VigiliaConversationEntryKind;
  readonly label: string;
  readonly metadata: string;
  readonly time: number;
}

export function buildVigiliaConversationEntries(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaConversationEntry[] {
  return buildVigiliaThoughtRuns(events)
    .flatMap(run => [
      ...run.inputPercepts
        .filter(percept => percept.perceptType.toLocaleLowerCase() !== 'sight')
        .map(percept => perceptConversationEntry(run.id, percept)),
      ...(run.output === undefined
        ? []
        : [
            {
              content: run.output,
              id: `model:${run.id}`,
              kind: 'model' as const,
              label: 'MODEL',
              metadata: `Final response${run.durationMs === undefined ? '' : ` · ${formatDuration(run.durationMs)}`}`,
              time: run.completedAt ?? run.startedAt,
            },
          ]),
    ])
    .sort((left, right) => left.time - right.time);
}

export function buildVigiliaThoughtRuns(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaThoughtRun[] {
  return splitJournals(events).flatMap(journal => buildJournalThoughtRuns(journal));
}

/** 将已经提交的转写和多帧合成事实转换为时间图上的即时信号。 */
export function buildVigiliaSignalSteps(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaStep[] {
  const steps: VigiliaStep[] = [];
  for (const [journalIndex, journal] of splitJournals(events).entries()) {
    for (const event of journal) {
      if (event.type === 'percept.appended' && event.data.perceptType.toLowerCase() === 'hearing') {
        const text = perceptText(event.data.content);
        if (text) {
          steps.push({
            completedAt: event.time,
            durationMs: 0,
            events: [event],
            id: `asr:${journalIndex}:${event.sequence}`,
            lane: 'asr' as const,
            name: 'ASR transcription',
            output: text,
            startedAt: event.time,
            status: 'completed' as const,
          });
        }
        continue;
      }
      if (event.type === 'vision.composed') {
        steps.push({
          completedAt: event.time,
          durationMs: 0,
          events: [event],
          id: `vision:${journalIndex}:${event.sequence}`,
          lane: 'vision' as const,
          name: `${event.data.frameCount}-frame mosaic`,
          output: event.data,
          startedAt: event.time,
          status: 'completed' as const,
        });
      }
    }
  }
  return steps;
}

function buildJournalThoughtRuns(events: readonly AnyVigiliaEvent[]): readonly VigiliaThoughtRun[] {
  const starts = events.filter(event => event.type === 'nucleus.think.started');

  return starts.map(start => {
    const operationId = start.data.operationId;
    const related = events.filter(event => operationIdOf(event) === operationId);
    const settlement = related.find(
      event => event.type === 'nucleus.think.completed' || event.type === 'nucleus.think.failed',
    );
    const operationStarts = events.filter(
      (event): event is Extract<AnyVigiliaEvent, { type: 'operation.started' }> =>
        event.type === 'operation.started',
    );
    const startsById = new Map(
      operationStarts.map(event => [event.data.operationId, event] as const),
    );
    const childStarts = operationStarts.filter(event =>
      belongsToThought(event, operationId, startsById),
    );
    const steps: VigiliaStep[] = [
      createRootStep(start, settlement),
      ...childStarts.map(childStart => createOperationStep(childStart, events)),
    ];
    const inputPercepts = events
      .filter(
        (event): event is Extract<AnyVigiliaEvent, { type: 'percept.appended' }> =>
          event.type === 'percept.appended' &&
          event.data.sequence > start.data.fromSequence &&
          event.data.sequence <= start.data.throughSequence,
      )
      .map(event => ({ ...event.data, time: event.time }));

    return {
      ...(settlement
        ? { completedAt: settlement.time, durationMs: settlement.data.durationMs }
        : {}),
      id: operationId,
      inputPercepts,
      ...(settlement?.type === 'nucleus.think.completed' ? { output: settlement.data.output } : {}),
      startedAt: start.time,
      status:
        settlement?.type === 'nucleus.think.failed'
          ? 'failed'
          : settlement
            ? 'completed'
            : 'running',
      steps: steps.sort((left, right) => left.startedAt - right.startedAt),
      trigger: start.data.trigger,
    };
  });
}

function splitJournals(events: readonly AnyVigiliaEvent[]): readonly AnyVigiliaEvent[][] {
  const journals: AnyVigiliaEvent[][] = [];
  for (const event of events) {
    const journal = journals.at(-1);
    const previous = journal?.at(-1);
    if (!journal || (previous && event.sequence <= previous.sequence)) journals.push([event]);
    else journal.push(event);
  }
  return journals;
}

function belongsToThought(
  start: Extract<AnyVigiliaEvent, { type: 'operation.started' }>,
  thoughtId: string,
  startsById: ReadonlyMap<string, Extract<AnyVigiliaEvent, { type: 'operation.started' }>>,
): boolean {
  let parentId = start.data.parentOperationId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    if (parentId === thoughtId) return true;
    visited.add(parentId);
    parentId = startsById.get(parentId)?.data.parentOperationId;
  }
  return false;
}

function createRootStep(
  start: Extract<AnyVigiliaEvent, { type: 'nucleus.think.started' }>,
  settlement: AnyVigiliaEvent | undefined,
): VigiliaStep {
  const completed =
    settlement?.type === 'nucleus.think.completed' || settlement?.type === 'nucleus.think.failed'
      ? settlement
      : undefined;

  return {
    ...(completed ? { completedAt: completed.time, durationMs: completed.data.durationMs } : {}),
    events: completed ? [start, completed] : [start],
    id: start.data.operationId,
    lane: 'nucleus',
    name: `think · ${start.data.trigger}`,
    ...(completed?.type === 'nucleus.think.completed'
      ? {
          output: {
            output: completed.data.output,
            reasoning: completed.data.reasoning,
            usage: {
              inputTokens: completed.data.inputTokens,
              outputTokens: completed.data.outputTokens,
            },
          },
        }
      : completed?.type === 'nucleus.think.failed'
        ? { output: completed.data.error }
        : {}),
    startedAt: start.time,
    status:
      completed?.type === 'nucleus.think.failed' ? 'failed' : completed ? 'completed' : 'running',
  };
}

function createOperationStep(
  start: Extract<AnyVigiliaEvent, { type: 'operation.started' }>,
  events: readonly AnyVigiliaEvent[],
): VigiliaStep {
  const settlement = events.find(
    event =>
      (event.type === 'operation.completed' || event.type === 'operation.failed') &&
      event.data.operationId === start.data.operationId,
  );
  const completed =
    settlement?.type === 'operation.completed' || settlement?.type === 'operation.failed'
      ? settlement
      : undefined;

  const common = {
    events: completed ? [start, completed] : [start],
    id: start.data.operationId,
    ...(start.data.detail === undefined ? {} : { input: start.data.detail }),
    lane: laneFor(start.data.category),
    name: start.data.name,
    ...(start.data.parentOperationId ? { parentId: start.data.parentOperationId } : {}),
    startedAt: start.time,
  };

  if (!completed) return { ...common, status: 'running' };

  const timing = {
    completedAt: completed.time,
    durationMs: completed.data.durationMs,
  };

  if (completed.type === 'operation.completed') {
    return {
      ...common,
      ...timing,
      output: completed.data.detail,
      status: 'completed',
    };
  }

  return {
    ...common,
    ...timing,
    output: completed.data.error,
    status: 'failed',
  };
}

function laneFor(category: VigiliaObservationCategory): VigiliaStepLane {
  return category;
}

function operationIdOf(event: AnyVigiliaEvent): string | undefined {
  return 'operationId' in event.data ? event.data.operationId : undefined;
}

function perceptConversationEntry(
  runId: string,
  percept: VigiliaPerceptRecord,
): VigiliaConversationEntry {
  const type = percept.perceptType.toLocaleLowerCase();
  const common = {
    content: percept.content,
    id: `percept:${runId}:${percept.sequence}`,
    metadata: `${percept.perceptType} · ${percept.stimulus} / ${percept.signal}`,
    time: percept.time,
  };
  if (type === 'hearing') return { ...common, kind: 'asr', label: 'ASR' };
  if (type === 'sight') {
    return {
      ...common,
      content: '直播画面已采集',
      kind: 'visual',
      label: '视觉',
    };
  }
  if (type === 'reading') return { ...common, kind: 'reading', label: '文本' };
  return { ...common, kind: 'percept', label: '感知' };
}

function formatDuration(duration: number): string {
  if (duration < 1_000) return `${duration} ms`;
  return `${(duration / 1_000).toFixed(2)} s`;
}

function perceptText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!content || typeof content !== 'object' || !('text' in content)) return '';
  const text = (content as { readonly text?: unknown }).text;
  return typeof text === 'string' ? text.trim() : '';
}
