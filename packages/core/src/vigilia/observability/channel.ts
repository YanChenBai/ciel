import type {
  VigiliaObservation,
  VigiliaObservationDataMap,
  VigiliaObservationSubscriber,
  VigiliaObservationType,
  VigiliaSink,
  VigiliaSource,
} from './types.ts';

/** 模块内部的同步事实通道；订阅者异常不能反向破坏业务执行。 */
export class VigiliaChannel implements VigiliaSink, VigiliaSource {
  private readonly subscribers = new Set<VigiliaObservationSubscriber>();

  emit<Type extends VigiliaObservationType>(
    type: Type,
    data: VigiliaObservationDataMap[Type],
  ): void {
    this.observe({ type, data } as VigiliaObservation);
  }

  observe(observation: VigiliaObservation): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(observation);
      } catch {
        // 可观测旁路不应改变模块本身的成功或失败结果。
      }
    }
  }

  subscribe(subscriber: VigiliaObservationSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }
}
