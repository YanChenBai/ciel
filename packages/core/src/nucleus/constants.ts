/**
 * 每轮默认最多注入八条长期记忆。
 */
export const DEFAULT_LONG_TERM_MEMORY_LIMIT = 8;
/**
 * 每轮默认最多注入八条近期情景记忆。
 */
export const DEFAULT_EPISODIC_MEMORY_LIMIT = 8;
/**
 * 活跃场景默认最多每十秒思考一次。
 */
export const DEFAULT_MIN_THINK_INTERVAL = 10_000;
/**
 * 无互动一分钟后默认触发一次主动思考。
 */
export const DEFAULT_MAX_THINK_INTERVAL = 60_000;
