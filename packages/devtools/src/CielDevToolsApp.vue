<script setup lang="ts">
import type { AnyVigiliaEvent, VigiliaSnapshot } from '@ciels/bridge/protocol';
import { createBridge } from '@ciels/bridge/vue';
import { ref, shallowRef } from 'vue';

import CielDevTools from './CielDevTools.vue';

const props = defineProps<{
  endpoint: string;
}>();

const { onMessage } = createBridge(props.endpoint);

const demoMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
const demoEvents = demoMode ? createDemoEvents() : [];
const events = shallowRef<readonly AnyVigiliaEvent[]>(demoMode ? demoEvents : []);
const emptySnapshot: VigiliaSnapshot = {
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
};
const demoSnapshot: VigiliaSnapshot = {
  activeOperations: [],
  performance: { archiveDurationMs: 0, signalDurationMs: 174, thinkDurationMs: 2_180 },
  state: 'running',
  throughSequence: demoEvents.at(-1)?.sequence ?? 0,
  totals: {
    archives: 0,
    errors: 0,
    inputTokens: 1_842,
    outputTokens: 126,
    percepts: 1,
    signals: 1,
    thoughts: 1,
  },
};
const snapshot = shallowRef<VigiliaSnapshot>(demoMode ? demoSnapshot : emptySnapshot);
const connected = ref(demoMode);

onMessage(message => {
  connected.value = true;
  snapshot.value = message.snapshot;

  if (message.type === 'vigilia.bootstrap') {
    events.value = message.events.slice(-500);
    return;
  }

  if (events.value.some(event => event.sequence === message.event.sequence)) return;
  events.value = [...events.value, message.event].slice(-500);
});

function createDemoEvents(): readonly AnyVigiliaEvent[] {
  const time = Date.now() - 2_600;
  return [
    {
      data: {
        content: '帮我看看今天上海的天气，适合晚上出去散步吗？',
        perceptType: 'Hearing',
        sequence: 1,
        signal: 'Echo',
        stimulus: 'Microphone',
      },
      sequence: 1,
      time,
      type: 'percept.appended',
      version: 1,
    },
    {
      data: {
        fromSequence: 0,
        operationId: 'think-20260822-shanghai',
        throughSequence: 1,
        trigger: 'speech-end',
      },
      sequence: 2,
      time: time + 35,
      type: 'nucleus.think.started',
      version: 1,
    },
    operationStarted(
      3,
      time + 52,
      'memory',
      'read-long-term',
      'memory-long',
      'think-20260822-shanghai',
    ),
    operationStarted(
      4,
      time + 57,
      'memory',
      'read-recent',
      'memory-recent',
      'think-20260822-shanghai',
    ),
    operationCompleted(
      5,
      time + 146,
      'memory',
      'read-long-term',
      'memory-long',
      94,
      { profile: '喜欢安静的晚间活动' },
      'think-20260822-shanghai',
    ),
    operationCompleted(
      6,
      time + 181,
      'memory',
      'read-recent',
      'memory-recent',
      124,
      { entries: 3 },
      'think-20260822-shanghai',
    ),
    operationStarted(
      7,
      time + 190,
      'context',
      'resolve-percepts',
      'context-resolve',
      'think-20260822-shanghai',
    ),
    operationCompleted(
      8,
      time + 238,
      'context',
      'resolve-percepts',
      'context-resolve',
      48,
      { percepts: 1 },
      'think-20260822-shanghai',
    ),
    operationStarted(
      9,
      time + 246,
      'context',
      'build-model-request',
      'context-build',
      'think-20260822-shanghai',
      { trigger: 'speech-end' },
    ),
    operationCompleted(
      10,
      time + 332,
      'context',
      'build-model-request',
      'context-build',
      86,
      { messages: 4 },
      'think-20260822-shanghai',
    ),
    operationStarted(
      11,
      time + 346,
      'model',
      'generate',
      'model-generate',
      'think-20260822-shanghai',
      { model: 'deepseek-v4-flash' },
    ),
    operationStarted(12, time + 704, 'tool', 'get-weather', 'tool-weather', 'model-generate', {
      city: '上海',
    }),
    operationCompleted(
      13,
      time + 1_084,
      'tool',
      'get-weather',
      'tool-weather',
      380,
      { condition: '多云', temperature: '27°C', rain: '10%' },
      'model-generate',
    ),
    operationCompleted(
      14,
      time + 2_176,
      'model',
      'generate',
      'model-generate',
      1_830,
      { finishReason: 'stop', outputTokens: 126 },
      'think-20260822-shanghai',
    ),
    {
      data: {
        durationMs: 2_180,
        inputTokens: 1_842,
        operationId: 'think-20260822-shanghai',
        output:
          '上海今天傍晚多云，约 27°C，降雨概率较低。晚上散步挺合适，建议九点前出发，带一把轻便伞会更稳妥。',
        outputTokens: 126,
        reasoning: '用户询问天气与活动建议，需要先查询实时天气，再结合温度和降雨概率回答。',
        trigger: 'speech-end',
      },
      sequence: 15,
      time: time + 2_215,
      type: 'nucleus.think.completed',
      version: 1,
    },
  ] as AnyVigiliaEvent[];
}

function operationStarted(
  sequence: number,
  time: number,
  category: 'context' | 'memory' | 'model' | 'sensory' | 'tool',
  name: string,
  operationId: string,
  parentOperationId: string,
  detail?: Record<string, string>,
): AnyVigiliaEvent {
  return {
    data: { category, ...(detail ? { detail } : {}), name, operationId, parentOperationId },
    sequence,
    time,
    type: 'operation.started',
    version: 1,
  };
}

function operationCompleted(
  sequence: number,
  time: number,
  category: 'context' | 'memory' | 'model' | 'sensory' | 'tool',
  name: string,
  operationId: string,
  durationMs: number,
  detail: Record<string, boolean | number | string>,
  parentOperationId: string,
): AnyVigiliaEvent {
  return {
    data: { category, detail, durationMs, name, operationId, parentOperationId },
    sequence,
    time,
    type: 'operation.completed',
    version: 1,
  };
}
</script>

<template>
  <CielDevTools :connected="connected" :events="events" :snapshot="snapshot" />
</template>
