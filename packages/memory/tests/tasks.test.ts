import { describe, expect, it } from 'vite-plus/test';

import { DEFAULT_MEMORY_PROMPTS } from '../src/prompts.ts';
import {
  consolidateLongTermTask,
  recallTask,
  reviseLongTermTask,
  summarizeDailyTask,
} from '../src/tasks.ts';
import type { DailyMemoryEntry, MemoryRecall } from '../src/types.ts';

const dailyEntry: DailyMemoryEntry = {
  id: 'daily:1',
  date: '2026-08-30',
  scope: { id: 'room:1', label: '一号直播间' },
  content: '主播介绍了一只黑猫。',
  occurredAt: 1,
  createdAt: 2,
};

const recallCandidates: readonly MemoryRecall[] = [
  {
    id: 'daily:1',
    kind: 'daily',
    scope: dailyEntry.scope,
    content: dailyEntry.content,
    date: dailyEntry.date,
    occurredAt: dailyEntry.occurredAt,
    createdAt: dailyEntry.createdAt,
    score: 0.9,
  },
  {
    id: 'long-term:1',
    kind: 'long-term',
    scope: 'global',
    content: '主播养了一只黑猫。',
    revision: 1,
    createdAt: 3,
    score: 0.8,
  },
];

describe('Memory Agent tasks', () => {
  it('用明确的数据块构造每日总结提示词', () => {
    const task = summarizeDailyTask(DEFAULT_MEMORY_PROMPTS, '画面中出现了一只黑猫。');

    expect(task.prompt).toContain(DEFAULT_MEMORY_PROMPTS.summarizeDaily);
    expect(task.prompt).toContain(
      '<candidate_experience>\n画面中出现了一只黑猫。\n</candidate_experience>',
    );
    expect(task.parse('__DISCARD__')).toBeUndefined();
    expect(task.parse('主播介绍了一只黑猫。')).toBe('主播介绍了一只黑猫。');
  });

  it('以结构化 JSON 传递长期记忆结算数据', () => {
    const task = consolidateLongTermTask(DEFAULT_MEMORY_PROMPTS, undefined, '2026-08-30', [
      dailyEntry,
    ]);

    expect(task.prompt).toContain('<current_long_term_memory>\n(无)');
    expect(task.prompt).toContain('<settlement_date>\n2026-08-30');
    expect(task.prompt).toContain('"scope": {');
    expect(task.prompt).toContain('"id": "room:1"');
    expect(task.parse('__EMPTY__')).toBeUndefined();
  });

  it('把修订指令和证据分成独立数据块', () => {
    const task = reviseLongTermTask(DEFAULT_MEMORY_PROMPTS, '猫的名字应改为小黑。', undefined, [
      dailyEntry,
    ]);

    expect(task.prompt).toContain('<revision_instruction>\n猫的名字应改为小黑。');
    expect(task.prompt).toContain('<supporting_daily_entries>');
  });

  it('保守解析召回结果并保持模型给出的相关性顺序', () => {
    const task = recallTask(DEFAULT_MEMORY_PROMPTS, '主播养了什么？', recallCandidates, 2);

    expect(task.prompt).toContain('<candidate_records>');
    expect(
      task.parse('```json\n["long-term:1", "long-term:1", "unknown", "daily:1"]\n```'),
    ).toEqual([recallCandidates[1], recallCandidates[0]]);
    expect(task.parse('不是 JSON')).toEqual([]);
  });
});
