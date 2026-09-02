import type { MemoryPrompts } from './types.ts';

function lines(...values: readonly string[]): string {
  return values.join('\n');
}

const BASE_INSTRUCTIONS = lines(
  '你是独立的 Memory Agent，只负责整理和检索可验证的记忆。',
  '',
  '通用规则：',
  '- 只使用当前任务提供的数据，不补充推测或外部知识。',
  '- 明确区分人物、来源、时间和场景。',
  '- 不继承主 Agent 的人格、对话历史或业务目标。',
  '- 不调用工具。',
  '- 严格遵循任务的输出协议，不添加解释、标题或 Markdown 围栏。',
);

export const MEMORY_PLUGIN_INSTRUCTIONS = lines(
  '# 记忆',
  '',
  '- 使用 memory_remember 主动保存真实发生、未来仍有价值的经历，不要依赖对话历史代替持久记忆。',
  '- 使用 memory_update 更正或更新已经变化的长期事实。',
  '- 当前上下文不足时，使用 memory_recall 回忆相关经历；需要按日期、类型或关键词精确查找时使用 memory_search。',
  '- current 只代表当前场景，global 代表跨场景事实；只有确实需要跨场景检索时才使用 all。',
  '- 已投影到上下文的记忆可以直接使用，不要为了确认已知内容重复调用工具。',
);

/**
 * 默认任务契约，每个提示词描述一项操作及其输出
 */
export const DEFAULT_MEMORY_PROMPTS: MemoryPrompts = {
  summarizeDaily: lines(
    '任务：把候选经历整理为一条简洁、客观、过去时的事实记录。',
    '输出：只输出记录正文；没有值得保留且可验证的事实时，只输出 __DISCARD__。',
  ),
  consolidateLongTerm: lines(
    '任务：根据现有长期记忆和指定日期的经历，生成新的完整长期记忆。',
    '规则：保留仍有效的事实，合并重复项，移除已被推翻的事实。',
    '输出：只输出完整正文；没有长期事实时，只输出 __EMPTY__。',
  ),
  reviseLongTerm: lines(
    '任务：根据更正说明和相关经历，生成新的完整长期记忆。',
    '规则：只修改被更正推翻的内容，保留其他仍有效的事实。',
    '输出：只输出完整正文；没有长期事实时，只输出 __EMPTY__。',
  ),
  recall: lines(
    '任务：选择真正能够回答查询的候选记录，并按相关性排序。',
    '规则：删除重复记录，但保留来自不同 Scope 的独立事实。',
    '输出：只输出记录 id 的 JSON 数组，例如 ["id-1", "id-2"]。',
  ),
};

/**
 * 合并固定记忆规则与可选的应用规则
 */
export function createMemoryInstructions(instructions?: string): string {
  const custom = instructions?.trim();
  return custom ? `${BASE_INSTRUCTIONS}\n\n业务约束：\n${custom}` : BASE_INSTRUCTIONS;
}

/**
 * 应用单项任务覆盖，调用方无需重复提供全部提示词
 */
export function resolveMemoryPrompts(prompts?: Partial<MemoryPrompts>): MemoryPrompts {
  return { ...DEFAULT_MEMORY_PROMPTS, ...prompts };
}
