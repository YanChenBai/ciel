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
/**
 * Context 默认保留最近一分钟内的实时感知。
 */
export const DEFAULT_PERCEPT_WINDOW = 60_000;
/** 单轮实时 Context 默认最多携带四张最近图片。 */
export const DEFAULT_CONTEXT_MAX_IMAGES = 4;
/** 一分钟没有新 Percept 后结束当前 Episode。 */
export const DEFAULT_EPISODE_IDLE_TIMEOUT = 60_000;
/** 每次 Episode 摘要最多注入四张代表性 Sight 拼图。 */
export const DEFAULT_EPISODE_MAX_IMAGES = 4;
/** 缓存十二张 Sight 后强制结束当前 Episode。 */
export const DEFAULT_EPISODE_MAX_BUFFERED_IMAGES = 12;
/** 缓存文字与运行轨迹超过 32K 字符后强制结束当前 Episode。 */
export const DEFAULT_EPISODE_MAX_TEXT_CHARS = 32_000;
/** 单轮模型实际输入达到 24K token 后强制结束当前 Episode。 */
export const DEFAULT_EPISODE_MAX_INPUT_TOKENS = 24_000;
/** 低于该灰度熵的画面视为空白或无有效视觉内容。 */
export const DEFAULT_EPISODE_MIN_VISUAL_ENTROPY = 0.05;
