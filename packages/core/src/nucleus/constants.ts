const MINUTE = 60_000;

/** 活跃场景默认最多每三十秒思考一次。 */
export const DEFAULT_MIN_THINK_INTERVAL = 30_000;

/** 无互动五分钟后默认触发一次主动思考。 */
export const DEFAULT_MAX_THINK_INTERVAL = MINUTE * 5;

/** Context 默认保留最近三分钟内的实时感知。 */
export const DEFAULT_PERCEPT_WINDOW = MINUTE * 3;

/** 单轮实时 Context 默认最多携带四张变化帧拼图。 */
export const DEFAULT_CONTEXT_MAX_IMAGES = 4;

/** 一张 Context 拼图最多包含九个变化帧。 */
export const VISION_FRAMES_PER_IMAGE = 9;

/** 一分钟没有新 Percept 后总结当前经历。 */
export const DEFAULT_MEMORY_SUMMARY_IDLE_TIMEOUT = MINUTE;

/** 单轮模型输入达到 500K token 后总结当前经历，为 1M 上下文窗口留出一半空间。 */
export const DEFAULT_MEMORY_SUMMARY_MAX_TOKENS = 500_000;
