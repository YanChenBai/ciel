import { VigiliaChannel } from './channel.ts';
import type { VigiliaObservationSubscriber, VigiliaSource } from './types.ts';

/** 将模块及其子模块的观测源合并为一条可动态扩展的事实流。 */
export class VigiliaGroup implements VigiliaSource {
  private readonly channel = new VigiliaChannel();
  private readonly sources = new Map<VigiliaSource, () => void>();

  add(source: VigiliaSource): () => void {
    if (source === this) throw new Error('VigiliaGroup cannot contain itself');
    if (this.sources.has(source)) return () => undefined;
    const unsubscribe = source.subscribe(observation => this.channel.observe(observation));
    this.sources.set(source, unsubscribe);
    return () => this.remove(source);
  }

  subscribe(subscriber: VigiliaObservationSubscriber): () => void {
    return this.channel.subscribe(subscriber);
  }

  private remove(source: VigiliaSource): void {
    const unsubscribe = this.sources.get(source);
    if (!unsubscribe) return;
    this.sources.delete(source);
    unsubscribe();
  }
}
