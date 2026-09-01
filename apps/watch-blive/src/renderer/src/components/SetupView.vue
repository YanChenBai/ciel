<script setup lang="ts">
import { Play, Radio } from '@lucide/vue';
import {
  AlertDescription,
  AlertRoot,
  AlertTitle,
  ButtonContent,
  ButtonRoot,
  InputControl,
  InputRoot,
  SelectActivator,
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectValue,
} from '@vuetify/v0/components';

import type {
  ConfigurationStatus,
  DanmakuDelivery,
  LiveArea,
  WatchMode,
} from '../../../shared/types.ts';

defineProps<{
  areas: readonly LiveArea[];
  canStart: boolean;
  configuration?: ConfigurationStatus;
  pending: boolean;
}>();
const areaId = defineModel<string>('areaId', { required: true });
const delivery = defineModel<DanmakuDelivery>('delivery', { required: true });
const mode = defineModel<WatchMode>('mode', { required: true });
const roomId = defineModel<string>('roomId', { required: true });
const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <section
    data-view="setup"
    class="bg-background grid min-h-0 flex-1 place-items-center overflow-auto px-6 pt-8 pb-14"
  >
    <form class="grid w-full max-w-[420px] gap-7" @submit.prevent="emit('start')">
      <div class="grid justify-items-center gap-2 text-center">
        <div
          class="border-primary/35 bg-primary/10 text-primary mb-1.5 grid size-[34px] place-items-center rounded-xl border"
        >
          <Radio class="size-[17px]" />
        </div>
        <h1 class="mt-2 text-xl font-semibold tracking-[-0.02em]">进入直播间</h1>
        <p class="text-muted-foreground m-0 max-w-[360px] text-[13px] leading-[1.65]">
          选择观看方式，Ciel 会在开始后接收直播内容并独立思考。
        </p>
      </div>

      <div class="grid gap-5">
        <div class="field-group">
          <label class="field-label">观看模式</label>
          <SelectRoot v-model="mode">
            <SelectActivator class="select-trigger">
              <SelectValue v-slot="{ selectedValue }">
                {{
                  selectedValue === 'autonomous'
                    ? '自主模式 · 从分区探索直播间'
                    : '标准模式 · 固定观看当前直播间'
                }}
              </SelectValue>
            </SelectActivator>
            <SelectContent class="select-content">
              <SelectItem class="select-item" value="standard">
                标准模式 · 固定观看当前直播间
              </SelectItem>
              <SelectItem class="select-item" value="autonomous">
                自主模式 · 从分区探索直播间
              </SelectItem>
            </SelectContent>
          </SelectRoot>
          <p class="field-help">
            {{
              mode === 'autonomous'
                ? 'Agent 会评估内容并决定继续停留或切换。'
                : '只观看指定直播间，不会自动切换。'
            }}
          </p>
        </div>

        <InputRoot
          v-if="mode === 'standard'"
          v-model="roomId"
          label="直播间 ID"
          class="field-group"
        >
          <label class="field-label">直播间 ID</label>
          <InputControl class="field-control" inputmode="numeric" placeholder="输入直播间 ID" />
        </InputRoot>

        <div v-else class="field-group">
          <label class="field-label">直播分区</label>
          <SelectRoot v-model="areaId">
            <SelectActivator class="select-trigger">
              <SelectValue v-slot="{ selectedValue }">
                {{
                  areas.find(area => String(area.id) === String(selectedValue))?.name ??
                  '选择直播分区'
                }}
              </SelectValue>
            </SelectActivator>
            <SelectContent class="select-content max-h-72 overflow-auto">
              <SelectItem
                v-for="area in areas"
                :key="area.id"
                class="select-item"
                :value="String(area.id)"
              >
                {{ area.name }}
              </SelectItem>
            </SelectContent>
          </SelectRoot>
          <p class="field-help">分区和直播间候选均通过 Bilibili API 实时获取。</p>
        </div>

        <div class="field-group">
          <label class="field-label">弹幕执行</label>
          <SelectRoot v-model="delivery">
            <SelectActivator class="select-trigger">
              <SelectValue v-slot="{ selectedValue }">
                {{ selectedValue === 'live' ? '真实发送到直播间' : '仅测试工具调用 · 不发送' }}
              </SelectValue>
            </SelectActivator>
            <SelectContent class="select-content">
              <SelectItem class="select-item" value="simulate">
                仅测试工具调用 · 不发送
              </SelectItem>
              <SelectItem class="select-item" value="live">真实发送到直播间</SelectItem>
            </SelectContent>
          </SelectRoot>
          <p class="field-help">
            {{
              delivery === 'live'
                ? 'Agent 调用工具后会操作直播网页发送弹幕。'
                : '保留完整工具调用与轨迹，但不会操作网页。'
            }}
          </p>
        </div>
      </div>

      <div class="grid justify-items-center gap-2.5">
        <AlertRoot
          v-if="configuration && !configuration.valid"
          class="w-full rounded-lg border border-amber-400/25 bg-amber-400/8 px-3.5 py-3 text-left"
        >
          <AlertTitle class="text-xs font-semibold text-amber-200">配置检查未通过</AlertTitle>
          <AlertDescription class="mt-2 grid gap-2 text-[11px] leading-5 text-amber-100/70">
            <div v-for="issue in configuration.issues" :key="issue.key">
              <strong class="font-mono text-amber-100">{{ issue.key }}</strong>
              · {{ issue.message }}
              <pre
                v-if="issue.detail"
                class="mt-1 max-h-24 overflow-auto text-[9px] whitespace-pre-wrap"
                >{{ issue.detail }}</pre>
            </div>
          </AlertDescription>
        </AlertRoot>
        <ButtonRoot class="primary-button" :disabled="pending || !canStart" @click="emit('start')">
          <ButtonContent>
            <Play class="size-4" />{{ pending ? '正在启动…' : '开始观看' }}
          </ButtonContent>
        </ButtonRoot>
        <span class="text-[10px] text-zinc-600">
          {{
            configuration?.valid
              ? `配置检查通过 · ${configuration.dataPath}`
              : configuration
                ? '修复配置后重新启动应用以再次检查'
                : '正在检查 AI、ASR、Node 与 FFmpeg 配置'
          }}
        </span>
      </div>
    </form>
  </section>
</template>
