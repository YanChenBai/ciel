import type { ASROptions, ASRResult } from '@ciels/asr';
import type { CielMetadata, SignalDefinition } from 'corex';

export interface PhotonPayload {
  /**
   * Sharp 可读取的图片字节。
   */
  readonly data: Buffer;
}

export interface EchoPayload {
  /**
   * 16 kHz、单声道、signed 16-bit little-endian PCM。
   */
  readonly data: Buffer;
}

export type PhotonDefinition = SignalDefinition<PhotonPayload>;
export type EchoDefinition = SignalDefinition<EchoPayload>;

export interface VisionOptions {
  readonly signals: readonly PhotonDefinition[];
  /**
   * 视觉来源的最小采样间隔，单位为毫秒。
   */
  readonly sampleInterval?: number;
  /**
   * 与上一张已保留画面的平均像素差异阈值，范围 0-1。
   */
  readonly differenceThreshold?: number;
}

export interface HearingOptions {
  readonly signals: readonly EchoDefinition[];
  /**
   * 直接传给 @ciels/asr 的 VAD、说话人和缓冲区配置。
   */
  readonly asr?: ASROptions;
}

export interface SensuProjectorOptions {
  /**
   * 每个视觉来源最多合并的变化帧数量，范围 1-9。
   */
  readonly maxVisionFrames?: number;
  /**
   * 合并后的视觉上下文提示词；空字符串表示不添加提示词。
   */
  readonly visionPrompt?: string;
  /**
   * 合并后的听觉上下文提示词；空字符串表示不添加提示词。
   */
  readonly hearingPrompt?: string;
}

export interface SensuErrorContext {
  readonly capability: 'hearing';
  readonly signal: EchoDefinition;
}

export interface SensuPluginOptions extends CielMetadata {
  readonly vision?: VisionOptions;
  readonly hearing?: HearingOptions;
  readonly projector?: SensuProjectorOptions;
  /**
   * 异步 ASR 错误通知；错误仍会在下一次处理或关闭时抛出。
   */
  readonly onError?: (error: Error, context: SensuErrorContext) => void;
}

export interface SpeechResultPayload {
  readonly origin: EchoDefinition;
  readonly result: ASRResult;
}
