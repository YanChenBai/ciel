<script setup lang="ts">
import { computed } from 'vue';
import VueJsonPretty from 'vue-json-pretty';

import 'vue-json-pretty/lib/styles.css';
import type { JSONDataType } from 'vue-json-pretty/types/utils';

const props = withDefaults(
  defineProps<{
    deep?: number;
    value?: unknown;
  }>(),
  {
    deep: 3,
  },
);

const data = computed<JSONDataType>(() => {
  if (props.value === undefined) return 'No captured data';
  if (typeof props.value === 'function' || typeof props.value === 'symbol') {
    return String(props.value);
  }
  return props.value as JSONDataType;
});
</script>

<template>
  <div class="object-inspector">
    <VueJsonPretty
      :data="data"
      :deep="deep"
      :collapsed-node-length="12"
      :collapsed-on-click-brackets="true"
      :show-double-quotes="true"
      :show-icon="true"
      :show-length="true"
      :show-line="true"
      theme="dark"
    />
  </div>
</template>

<style scoped>
.object-inspector {
  min-width: 0;
  overflow-x: auto;
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', monospace;
}

.object-inspector :deep(.vjs-tree) {
  min-width: max-content;
  color: #a1a1aa;
  font-size: 0.6875rem;
  line-height: 1.25rem;
}

.object-inspector :deep(.vjs-tree-node) {
  border-radius: 0.125rem;
  line-height: 1.25rem;
}

.object-inspector :deep(.vjs-tree-node.dark:hover) {
  background: rgb(255 255 255 / 0.04);
}

.object-inspector :deep(.vjs-indent-unit.has-line) {
  border-left-color: rgb(255 255 255 / 0.08);
  border-left-style: solid;
}

.object-inspector :deep(.vjs-key) {
  color: #9cdcfe;
}

.object-inspector :deep(.vjs-value-string) {
  color: #ce9178;
}

.object-inspector :deep(.vjs-value-number) {
  color: #b5cea8;
}

.object-inspector :deep(.vjs-value-boolean) {
  color: #569cd6;
}

.object-inspector :deep(.vjs-value-null),
.object-inspector :deep(.vjs-value-undefined) {
  color: #c586c0;
}

.object-inspector :deep(.vjs-tree-brackets) {
  color: #d4d4d4;
}

.object-inspector :deep(.vjs-tree-brackets:hover),
.object-inspector :deep(.vjs-carets:hover) {
  color: var(--primary);
}

.object-inspector :deep(.vjs-comment) {
  color: #71717a;
}
</style>
