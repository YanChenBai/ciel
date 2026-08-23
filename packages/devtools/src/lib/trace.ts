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
  readonly label: string;
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

export type VigiliaConversationEntryKind =
  | 'asr'
  | 'danmaku'
  | 'model'
  | 'percept'
  | 'reading'
  | 'visual';

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
  return splitJournals(events)
    .flatMap(journal =>
      buildJournalThoughtRuns(journal).flatMap(run => [
        ...run.inputPercepts
          .filter(percept => percept.perceptType.toLocaleLowerCase() !== 'sight')
          .map(percept => perceptConversationEntry(run.id, percept)),
        ...composedVisionConversationEntries(journal, run),
        ...run.steps.flatMap(step => {
          const entry = danmakuConversationEntry(run.id, step);
          return entry ? [entry] : [];
        }),
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
      ]),
    )
    .sort((left, right) => left.time - right.time);
}

export function buildVigiliaThoughtRuns(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaThoughtRun[] {
  return splitJournals(events).flatMap(journal => buildJournalThoughtRuns(journal));
}

/** 将已经提交的转写区间和多帧合成事实转换为时间图信号。 */
export function buildVigiliaSignalSteps(
  events: readonly AnyVigiliaEvent[],
): readonly VigiliaStep[] {
  const steps: VigiliaStep[] = [];
  for (const [journalIndex, journal] of splitJournals(events).entries()) {
    const capturedCompositions = new Set<number>();
    for (const event of journal) {
      if (event.type === 'percept.appended' && event.data.perceptType.toLowerCase() === 'hearing') {
        const text = perceptText(event.data.content);
        if (text) {
          steps.push({
            completedAt: event.data.endAt,
            durationMs: Math.max(0, event.data.endAt - event.data.startAt),
            events: [event],
            id: `asr:${journalIndex}:${event.sequence}`,
            label: 'ASR Transcription',
            lane: 'asr' as const,
            name: 'asr-transcription',
            output: text,
            startedAt: event.data.startAt,
            status: 'completed' as const,
          });
        }
        continue;
      }
      if (
        event.type === 'operation.started' &&
        event.data.category === 'sensory' &&
        event.data.name === 'vision'
      ) {
        const settlement = journal.find(
          candidate =>
            (candidate.type === 'operation.completed' || candidate.type === 'operation.failed') &&
            candidate.data.operationId === event.data.operationId,
        );
        const composition = journal.find(
          candidate =>
            candidate.type === 'vision.composed' &&
            candidate.time >= event.time &&
            candidate.time <= (settlement?.time ?? Number.POSITIVE_INFINITY),
        );
        if (composition?.type === 'vision.composed') capturedCompositions.add(composition.sequence);
        steps.push({
          ...(settlement
            ? {
                completedAt: settlement.time,
                durationMs:
                  settlement.type === 'operation.completed' ||
                  settlement.type === 'operation.failed'
                    ? settlement.data.durationMs
                    : Math.max(0, settlement.time - event.time),
              }
            : {}),
          events: [
            event,
            ...(composition ? [composition] : []),
            ...(settlement ? [settlement] : []),
          ],
          id: `vision:${journalIndex}:${event.data.operationId}`,
          label:
            composition?.type === 'vision.composed'
              ? `${composition.data.frameCount}-Frame Mosaic`
              : 'Vision',
          lane: 'vision' as const,
          name: 'vision',
          ...(composition?.type === 'vision.composed' ? { output: composition.data } : {}),
          startedAt: event.time,
          status:
            settlement?.type === 'operation.failed'
              ? ('failed' as const)
              : settlement
                ? ('completed' as const)
                : ('running' as const),
        });
        continue;
      }
      if (event.type === 'vision.composed' && !capturedCompositions.has(event.sequence)) {
        steps.push({
          completedAt: event.time,
          durationMs: 0,
          events: [event],
          id: `vision:${journalIndex}:${event.sequence}`,
          label: `${event.data.frameCount}-Frame Mosaic`,
          lane: 'vision' as const,
          name: 'vision-mosaic',
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
      trigger: thinkName(start) ?? start.data.trigger,
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
  const name = thinkName(start);
  const completed =
    settlement?.type === 'nucleus.think.completed' || settlement?.type === 'nucleus.think.failed'
      ? settlement
      : undefined;

  return {
    ...(completed ? { completedAt: completed.time, durationMs: completed.data.durationMs } : {}),
    events: completed ? [start, completed] : [start],
    id: start.data.operationId,
    label: name ? kebabCaseLabel(name) : 'Think',
    lane: 'nucleus',
    name: name ?? 'think',
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

function thinkName(
  start: Extract<AnyVigiliaEvent, { type: 'nucleus.think.started' }>,
): string | undefined {
  if (!('name' in start.data)) return undefined;
  return typeof start.data.name === 'string' ? start.data.name : undefined;
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
    label: kebabCaseLabel(start.data.name),
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

function kebabCaseLabel(name: string): string {
  return name
    .split('-')
    .map(word => `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');
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
  if (type === 'reading') return { ...common, kind: 'reading', label: '文本' };
  return { ...common, kind: 'percept', label: '感知' };
}

function composedVisionConversationEntries(
  events: readonly AnyVigiliaEvent[],
  run: VigiliaThoughtRun,
): readonly VigiliaConversationEntry[] {
  const completedAt = run.completedAt ?? Number.POSITIVE_INFINITY;
  return events.flatMap(event => {
    if (
      event.type !== 'vision.composed' ||
      event.time < run.startedAt ||
      event.time > completedAt
    ) {
      return [];
    }
    return [
      {
        content: { path: event.data.path, type: 'image' },
        id: `vision:${run.id}:${event.sequence}`,
        kind: 'visual' as const,
        label: 'VISION',
        metadata: `${event.data.frameCount}-Frame Mosaic · ${event.data.stimulus} / ${event.data.signal}`,
        time: event.time,
      },
    ];
  });
}

function danmakuConversationEntry(
  runId: string,
  step: VigiliaStep,
): VigiliaConversationEntry | undefined {
  if (step.lane !== 'tool' || step.name !== 'send-danmaku') return;
  const input = nestedRecord(step.input, 'input');
  if (input?.action !== 'send' || typeof input.content !== 'string' || !input.content.trim())
    return;
  const simulated = findBoolean(step.output, 'simulated');
  const sent = findBoolean(step.output, 'sent');
  const outcome =
    step.status === 'failed'
      ? '发送失败'
      : simulated
        ? '模拟发送'
        : sent
          ? '已发送'
          : '已调用发送工具';
  return {
    content: input.content.trim(),
    id: `danmaku:${runId}:${step.id}`,
    kind: 'danmaku',
    label: 'DANMAKU',
    metadata: `Agent 弹幕 · ${outcome}`,
    time: step.completedAt ?? step.startedAt,
  };
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || !(key in value)) return;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : undefined;
}

function findBoolean(value: unknown, key: string, depth = 0): boolean | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return;
  if (key in value && typeof (value as Record<string, unknown>)[key] === 'boolean') {
    return (value as Record<string, boolean>)[key];
  }
  for (const nested of Object.values(value)) {
    const match = findBoolean(nested, key, depth + 1);
    if (match !== undefined) return match;
  }
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
