<script setup lang="ts" vapor>
import type { VigiliaSnapshot } from '@ciels/bridge/protocol';
import { computed, ref } from 'vue';

import { onMessage } from './lib/client.ts';

interface TimelineEvent {
  readonly data: unknown;
  readonly sequence: number;
  readonly time: number;
  readonly type: string;
}

interface ThoughtRun {
  readonly operationId: string;
  readonly related: TimelineEvent[];
  readonly settlement?: TimelineEvent;
  readonly started: TimelineEvent;
}

const events = ref<TimelineEvent[]>([]);
const snapshot = ref<VigiliaSnapshot>({
  activeOperations: [],
  performance: { archiveDurationMs: 0, signalDurationMs: 0, thinkDurationMs: 0 },
  state: 'idle',
  throughSequence: 0,
  totals: {
    archives: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    percepts: 0,
    signals: 0,
    thoughts: 0,
  },
});
const connected = ref(false);
const selectedThinkId = ref('');

onMessage(message => {
  connected.value = true;
  snapshot.value = message.snapshot;
  if (message.type === 'vigilia.bootstrap') {
    events.value = [...message.events].slice(-200);
    selectedThinkId.value = latestThinkId(events.value);
    return;
  }
  if (events.value.some(event => event.sequence === message.event.sequence)) return;
  events.value = [...events.value, message.event].slice(-200);
  if (message.event.type === 'nucleus.think.started') {
    selectedThinkId.value = stringField(message.event.data, 'operationId');
  }
});

const recentEvents = computed(() => [...events.value].reverse());
const averageThink = computed(() => {
  const value = snapshot.value;
  if (value.totals.thoughts === 0) return 0;
  return Math.round(value.performance.thinkDurationMs / value.totals.thoughts);
});
const thoughtRuns = computed<ThoughtRun[]>(() =>
  [...events.value]
    .filter(event => event.type === 'nucleus.think.started')
    .reverse()
    .map(event => {
      const operationId = stringField(event.data, 'operationId');
      const related = events.value.filter(candidate => {
        const data = record(candidate.data);
        return data.operationId === operationId || data.parentOperationId === operationId;
      });
      const settlement = findLastEvent(
        related,
        candidate =>
          candidate.type === 'nucleus.think.completed' || candidate.type === 'nucleus.think.failed',
      );
      return { operationId, related, settlement, started: event };
    }),
);
const selectedThought = computed(() => {
  const runs = thoughtRuns.value;
  return runs.find(run => run.operationId === selectedThinkId.value) ?? runs[0];
});
const requestContext = computed(() => operationDetail('context', 'build-model-request'));
const thoughtResult = computed(() => {
  const data = record(selectedThought.value?.settlement?.data);
  return data.output;
});
const thoughtReasoning = computed(() => {
  const data = record(selectedThought.value?.settlement?.data);
  if (data.reasoning !== undefined) return data.reasoning;
  return selectedThought.value?.related
    .filter(event => {
      const data = record(event.data);
      return event.type === 'operation.completed' && data.category === 'model';
    })
    .map(event => record(record(event.data).detail).reasoning)
    .filter(value => value !== undefined);
});
const memoryResults = computed<TimelineEvent[]>(
  () =>
    selectedThought.value?.related.filter(event => record(event.data).category === 'memory') ?? [],
);
const toolResults = computed<TimelineEvent[]>(
  () =>
    selectedThought.value?.related.filter(event => record(event.data).category === 'tool') ?? [],
);
const latestArchive = computed(() =>
  findLastEvent(events.value, event => event.type === 'memory.archive.completed'),
);

function formatTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    fractionalSecondDigits: 3,
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

function eventTitle(event: TimelineEvent): string {
  return event.type
    .replace('nucleus.', '')
    .replace('memory.', '')
    .replace('processing.', '')
    .replaceAll('.', ' / ');
}

function eventTone(event: TimelineEvent): string {
  if (event.type.endsWith('failed') || event.type === 'error.observed') return 'danger';
  if (event.type.endsWith('completed')) return 'success';
  if (event.type.endsWith('started')) return 'active';
  return 'neutral';
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown, key: string): string {
  const field = record(value)[key];
  return typeof field === 'string' ? field : '';
}

function latestThinkId(source: readonly TimelineEvent[]): string {
  const event = findLastEvent(source, candidate => candidate.type === 'nucleus.think.started');
  return stringField(event?.data, 'operationId');
}

function shortId(value: string): string {
  return value ? value.slice(0, 8) : '—';
}

function pretty(value: unknown): string {
  if (value === undefined) return '未捕获或尚未产生';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function operationDetail(category: string, name: string): unknown {
  const event = findLastEvent(selectedThought.value?.related ?? [], candidate => {
    const data = record(candidate.data);
    return (
      candidate.type === 'operation.completed' && data.category === category && data.name === name
    );
  });
  return record(event?.data).detail;
}

function findLastEvent(
  source: readonly TimelineEvent[],
  predicate: (event: TimelineEvent) => boolean,
): TimelineEvent | undefined {
  for (let index = source.length - 1; index >= 0; index--) {
    const event = source[index];
    if (event && predicate(event)) return event;
  }
  return undefined;
}
</script>

<template>
  <main class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">CIEL · CORE OBSERVABILITY</p>
        <h1>Vigilia</h1>
      </div>
      <div class="connection" :class="{ online: connected }">
        <span class="pulse"></span>
        {{ connected ? 'Live journal' : 'Waiting for bridge' }}
      </div>
    </header>

    <section class="hero">
      <div>
        <p class="hero-label">Runtime state</p>
        <strong>{{ snapshot.state }}</strong>
        <p class="sequence">Through sequence {{ snapshot.throughSequence }}</p>
      </div>
      <div class="metric-grid">
        <article>
          <span>Signals</span><b>{{ snapshot.totals.signals }}</b>
        </article>
        <article>
          <span>Percepts</span><b>{{ snapshot.totals.percepts }}</b>
        </article>
        <article>
          <span>Thoughts</span><b>{{ snapshot.totals.thoughts }}</b>
        </article>
        <article class="error-metric">
          <span>Errors</span><b>{{ snapshot.totals.errors }}</b>
        </article>
      </div>
    </section>

    <section class="thought-panel panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">CORRELATED BY UUID</p>
          <h2>Thought inspector</h2>
        </div>
        <select v-model="selectedThinkId" aria-label="选择一次思考">
          <option v-for="run in thoughtRuns" :key="run.operationId" :value="run.operationId">
            {{ shortId(run.operationId) }} · {{ formatTime(run.started.time) }}
          </option>
        </select>
      </div>
      <div v-if="selectedThought" class="thought-content">
        <div class="trace-summary">
          <code :title="selectedThought.operationId"
            >think {{ shortId(selectedThought.operationId) }}</code
          >
          <span>{{
            selectedThought.settlement?.type.endsWith('completed')
              ? 'completed'
              : selectedThought.settlement
                ? 'failed'
                : 'running'
          }}</span>
          <span>{{ selectedThought.related.length }} events</span>
        </div>
        <div class="detail-grid">
          <details open>
            <summary>Request context</summary>
            <pre>{{ pretty(requestContext) }}</pre>
          </details>
          <details open>
            <summary>Reasoning returned by model</summary>
            <pre>{{ pretty(thoughtReasoning) }}</pre>
          </details>
          <details open>
            <summary>Thought result</summary>
            <pre>{{ pretty(thoughtResult) }}</pre>
          </details>
          <details>
            <summary>Tools · {{ toolResults.length }} events</summary>
            <pre>{{ pretty(toolResults.map(event => event.data)) }}</pre>
          </details>
          <details>
            <summary>Memory reads · {{ memoryResults.length }} events</summary>
            <pre>{{ pretty(memoryResults.map(event => event.data)) }}</pre>
          </details>
          <details>
            <summary>Latest episode summary</summary>
            <pre>{{ pretty(record(latestArchive?.data).summary) }}</pre>
          </details>
        </div>
        <div class="operation-tree">
          <article v-for="event in selectedThought.related" :key="event.sequence">
            <code>{{ shortId(stringField(event.data, 'operationId')) }}</code>
            <span>{{ stringField(event.data, 'name') || eventTitle(event) }}</span>
            <small>{{
              record(event.data).durationMs === undefined
                ? 'started'
                : `${String(record(event.data).durationMs)} ms`
            }}</small>
          </article>
        </div>
      </div>
      <p v-else class="empty">等待第一次 Nucleus think。</p>
    </section>

    <section class="content-grid">
      <div class="timeline-panel panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">APPEND-ONLY STREAM</p>
            <h2>Timeline</h2>
          </div>
          <span>{{ events.length }} retained</span>
        </div>
        <div v-if="recentEvents.length" class="timeline">
          <article
            v-for="event in recentEvents"
            :key="event.sequence"
            class="event-row"
            @click="
              selectedThinkId =
                stringField(event.data, 'parentOperationId') ||
                (event.type.startsWith('nucleus.think.')
                  ? stringField(event.data, 'operationId')
                  : selectedThinkId)
            "
          >
            <div class="rail"><span :class="eventTone(event)"></span></div>
            <div class="event-main">
              <div class="event-title">
                <strong>{{ eventTitle(event) }}</strong>
                <time>{{ formatTime(event.time) }}</time>
              </div>
              <p>#{{ event.sequence }} · {{ JSON.stringify(event.data) }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty">Vigilia 正在等待第一条运行事实。</div>
      </div>

      <aside>
        <section class="panel side-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">IN FLIGHT</p>
              <h2>Active</h2>
            </div>
          </div>
          <div v-if="snapshot.activeOperations.length" class="operation-list">
            <article v-for="operation in snapshot.activeOperations" :key="operation.operationId">
              <span class="spinner"></span>
              <div>
                <strong>{{ operation.kind }}</strong>
                <p>{{ operation.operationId }}</p>
              </div>
            </article>
          </div>
          <p v-else class="quiet">No active operations</p>
        </section>

        <section class="panel side-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">PERFORMANCE</p>
              <h2>Runtime</h2>
            </div>
          </div>
          <dl class="details">
            <div>
              <dt>Avg. thought</dt>
              <dd>{{ averageThink }} ms</dd>
            </div>
            <div>
              <dt>Input tokens</dt>
              <dd>{{ snapshot.totals.inputTokens }}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{{ snapshot.totals.outputTokens }}</dd>
            </div>
            <div>
              <dt>Archives</dt>
              <dd>{{ snapshot.totals.archives }}</dd>
            </div>
          </dl>
        </section>

        <section v-if="snapshot.latestError" class="panel side-panel error-panel">
          <p class="eyebrow">LATEST ERROR</p>
          <h2>{{ snapshot.latestError.error.name }}</h2>
          <p>{{ snapshot.latestError.error.message }}</p>
          <small>{{ snapshot.latestError.source }} / {{ snapshot.latestError.phase }}</small>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  background: #080b0d;
  color: #ecf2ef;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
:global(body::before) {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 12% 0%, rgba(105, 244, 181, 0.09), transparent 29%),
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size:
    auto,
    32px 32px,
    32px 32px;
}
.shell {
  position: relative;
  max-width: 1460px;
  margin: 0 auto;
  padding: 38px 44px 64px;
}
.topbar,
.hero,
.panel-heading,
.event-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.eyebrow {
  margin: 0 0 7px;
  color: #799087;
  font:
    600 10px/1.2 ui-monospace,
    monospace;
  letter-spacing: 0.18em;
}
h1,
h2,
p {
  margin-top: 0;
}
h1 {
  margin-bottom: 0;
  font-size: 34px;
  letter-spacing: -0.04em;
}
h2 {
  margin-bottom: 0;
  font-size: 18px;
}
.connection {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #718078;
  font:
    600 12px ui-monospace,
    monospace;
}
.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4b5550;
}
.online {
  color: #a4e8c2;
}
.online .pulse {
  background: #69f4b5;
  box-shadow:
    0 0 0 5px rgba(105, 244, 181, 0.09),
    0 0 18px #69f4b5;
}
.hero {
  gap: 48px;
  margin: 38px 0 22px;
  padding: 26px 30px;
  border: 1px solid #223029;
  border-radius: 18px;
  background: linear-gradient(105deg, rgba(19, 30, 25, 0.92), rgba(12, 16, 16, 0.88));
}
.hero-label {
  margin-bottom: 6px;
  color: #7f9188;
  font-size: 12px;
}
.hero strong {
  color: #69f4b5;
  font:
    500 29px ui-monospace,
    monospace;
  text-transform: uppercase;
}
.sequence {
  margin: 7px 0 0;
  color: #65726c;
  font:
    11px ui-monospace,
    monospace;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr));
  gap: 12px;
  flex: 1;
  max-width: 720px;
}
.metric-grid article {
  padding: 15px 18px;
  border-left: 1px solid #29372f;
}
.metric-grid span {
  display: block;
  color: #74827b;
  font-size: 11px;
}
.metric-grid b {
  display: block;
  margin-top: 7px;
  font:
    500 25px ui-monospace,
    monospace;
}
.error-metric b {
  color: #ff8c7b;
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 22px;
}
.thought-panel {
  margin-bottom: 22px;
  overflow: hidden;
}
.thought-panel select {
  max-width: 260px;
  border: 1px solid #2a3b32;
  border-radius: 8px;
  padding: 8px 10px;
  background: #0b110e;
  color: #a9bbb2;
  font:
    11px ui-monospace,
    monospace;
}
.thought-content {
  padding: 20px 23px 24px;
}
.trace-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  color: #728078;
  font:
    11px ui-monospace,
    monospace;
}
.trace-summary code {
  color: #69f4b5;
}
.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.detail-grid details {
  min-width: 0;
  border: 1px solid #1e2c25;
  border-radius: 10px;
  background: #090d0b;
}
.detail-grid summary {
  cursor: pointer;
  padding: 12px 14px;
  color: #9aaba2;
  font:
    600 11px ui-monospace,
    monospace;
}
.detail-grid pre {
  max-height: 300px;
  overflow: auto;
  margin: 0;
  border-top: 1px solid #18231e;
  padding: 13px 14px;
  color: #7f9087;
  font:
    10px/1.55 ui-monospace,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.operation-tree {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 7px;
  margin-top: 14px;
}
.operation-tree article {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 8px;
  padding: 9px 10px;
  border-left: 2px solid #31513f;
  background: #0a0f0c;
  font:
    10px ui-monospace,
    monospace;
}
.operation-tree code {
  color: #6d8879;
}
.operation-tree span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-tree small {
  color: #59665f;
}
.panel {
  border: 1px solid #1e2924;
  border-radius: 16px;
  background: rgba(12, 16, 16, 0.9);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
}
.timeline-panel {
  min-height: 620px;
  overflow: hidden;
}
.panel-heading {
  padding: 21px 23px;
  border-bottom: 1px solid #1c2722;
}
.panel-heading > span {
  color: #617068;
  font:
    11px ui-monospace,
    monospace;
}
.timeline {
  max-height: 720px;
  overflow: auto;
}
.event-row {
  display: grid;
  grid-template-columns: 28px 1fr;
  padding: 0 22px;
  cursor: pointer;
}
.rail {
  position: relative;
  display: flex;
  justify-content: center;
}
.rail::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #202c26;
}
.rail span {
  z-index: 1;
  width: 9px;
  height: 9px;
  margin-top: 24px;
  border: 2px solid #0c1010;
  border-radius: 50%;
  background: #738179;
  box-shadow: 0 0 0 1px #435048;
}
.rail .success {
  background: #69f4b5;
  box-shadow: 0 0 0 1px #69f4b5;
}
.rail .danger {
  background: #ff695f;
  box-shadow: 0 0 0 1px #ff695f;
}
.rail .active {
  background: #e8be65;
  box-shadow: 0 0 0 1px #e8be65;
}
.event-main {
  min-width: 0;
  padding: 19px 0 18px 12px;
  border-bottom: 1px solid #171f1c;
}
.event-title strong {
  font:
    500 13px ui-monospace,
    monospace;
}
.event-title time {
  color: #58645e;
  font:
    10px ui-monospace,
    monospace;
}
.event-main p {
  overflow: hidden;
  margin: 8px 0 0;
  color: #748179;
  font:
    10px/1.55 ui-monospace,
    monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
aside {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.side-panel .panel-heading {
  border-bottom: 0;
  padding-bottom: 14px;
}
.quiet,
.empty {
  color: #5f6c65;
  font:
    12px ui-monospace,
    monospace;
}
.quiet {
  padding: 8px 22px 24px;
  margin: 0;
}
.empty {
  padding: 80px 24px;
  text-align: center;
}
.operation-list {
  padding: 0 20px 20px;
}
.operation-list article {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid #19221e;
}
.operation-list strong {
  font:
    12px ui-monospace,
    monospace;
}
.operation-list p {
  margin: 3px 0 0;
  color: #617068;
  font:
    10px ui-monospace,
    monospace;
}
.spinner {
  width: 10px;
  height: 10px;
  border: 1px solid #42614f;
  border-top-color: #69f4b5;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
.details {
  margin: 0;
  padding: 0 22px 22px;
}
.details div {
  display: flex;
  justify-content: space-between;
  padding: 11px 0;
  border-top: 1px solid #19221e;
}
dt {
  color: #75827c;
  font-size: 11px;
}
dd {
  margin: 0;
  font:
    11px ui-monospace,
    monospace;
}
.error-panel {
  padding: 20px 22px;
  border-color: #4a2825;
  background: rgba(42, 20, 18, 0.55);
}
.error-panel h2 {
  margin-bottom: 10px;
  color: #ff8c7b;
}
.error-panel > p:not(.eyebrow) {
  color: #bd9993;
  font-size: 12px;
  line-height: 1.55;
}
.error-panel small {
  color: #735f5c;
  font:
    10px ui-monospace,
    monospace;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 900px) {
  .shell {
    padding: 24px 18px;
  }
  .hero {
    align-items: flex-start;
    flex-direction: column;
  }
  .metric-grid {
    width: 100%;
    grid-template-columns: repeat(2, 1fr);
  }
  .content-grid {
    grid-template-columns: 1fr;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
