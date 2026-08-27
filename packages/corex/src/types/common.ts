import type { MaybePromise } from './async.ts';

export type Dispose = () => MaybePromise<void>;

export interface CielMetadata {
  /**
   * 便于展示和调试的名称
   */
  readonly name: string;

  /**
   * 语义和用途说明
   */
  readonly description?: string;
}
