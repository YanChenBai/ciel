import { OculusComposer } from '#sensus';
import type { PerceptRecord } from '#src/percepts/index.ts';
import type { Photon, SignalConstructor } from '#src/signals/index.ts';
import type { Stimulus } from '#src/stimulus/index.ts';

const FRAMES_PER_IMAGE = 9;

interface VisionBatch {
  readonly data: readonly PerceptRecord[];
  readonly signal: SignalConstructor<Photon>;
  readonly stimulus: Stimulus;
}

export interface VisionProjection {
  readonly data: readonly PerceptRecord[];
  readonly record?: PerceptRecord;
}

/** 将同一视觉来源的 Sight 记录分组、采样并合成为有界视觉证据。 */
export class VisionProjector {
  private readonly composer = new OculusComposer();

  constructor(private readonly defaultLimit: number) {}

  get limit(): number {
    return this.defaultLimit;
  }

  async project(
    records: readonly PerceptRecord[],
    limit: number = this.defaultLimit,
  ): Promise<readonly VisionProjection[]> {
    return Promise.all(
      this.createBatches(records, limit).map(async batch => {
        try {
          return { data: batch.data, record: await this.compose(batch) };
        } catch {
          return { data: batch.data };
        }
      }),
    );
  }

  private async compose(batch: VisionBatch): Promise<PerceptRecord> {
    const first = batch.data[0]!;
    const sight = await this.composer.compose(
      batch.data.map(record => {
        if (record.percept.type !== 'sight') {
          throw new Error('Vision batches can only contain Sight percepts');
        }
        return record.percept;
      }),
    );
    return {
      ...first,
      time: { startAt: sight.startAt, endAt: sight.endAt },
      content: { type: 'image', path: sight.path },
      percept: sight,
    };
  }

  private createBatches(records: readonly PerceptRecord[], limit: number): readonly VisionBatch[] {
    if (limit === 0) return [];

    const sources: Array<{
      data: PerceptRecord[];
      signal: SignalConstructor<Photon>;
      stimulus: Stimulus;
    }> = [];
    for (const record of records) {
      if (record.percept.type !== 'sight') continue;
      let source = sources.find(
        value => value.stimulus === record.stimulus && value.signal === record.percept.originSignal,
      );
      if (!source) {
        source = {
          data: [],
          signal: record.percept.originSignal,
          stimulus: record.stimulus,
        };
        sources.push(source);
      }
      source.data.push(record);
    }

    const batches = sources
      .flatMap(source => {
        const batches: VisionBatch[] = [];
        for (let index = 0; index < source.data.length; index += FRAMES_PER_IMAGE) {
          batches.push({
            signal: source.signal,
            stimulus: source.stimulus,
            data: source.data.slice(index, index + FRAMES_PER_IMAGE),
          });
        }
        return batches;
      })
      .toSorted(
        (left, right) =>
          left.data[0]!.time.startAt.getTime() - right.data[0]!.time.startAt.getTime(),
      );
    return this.selectBatches(batches, limit);
  }

  /** 保留首尾并在时间线上均匀取样，避免长段视觉只剩最后几秒。 */
  private selectBatches(batches: readonly VisionBatch[], limit: number): readonly VisionBatch[] {
    if (batches.length <= limit) return batches;
    if (limit === 1) return [batches.at(-1)!];

    const selected = new Set<number>();
    for (let index = 0; index < limit; index += 1) {
      selected.add(Math.round((index * (batches.length - 1)) / (limit - 1)));
    }
    return [...selected].map(index => batches[index]!);
  }
}
