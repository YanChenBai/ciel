import { SENSU_SYMBOL } from '#identity';
import type { Percept } from '#percept';
import type { Signal } from '#signal';

export interface Sensu<
  TSignal extends Signal = Signal,
  TPercept extends Percept<TSignal> = Percept<TSignal>,
> {
  readonly [SENSU_SYMBOL]: true;

  readonly name: string;

  readonly description: string;

  process(signal: TSignal): Promise<TPercept>;
}

export interface DefineSensuOptions<
  TSignal extends Signal = Signal,
  TPercept extends Percept<TSignal> = Percept<TSignal>,
> {
  name: string;

  description: string;

  process(signal: TSignal): Promise<TPercept>;
}

export function defineSensu<
  TSignal extends Signal = Signal,
  TPercept extends Percept<TSignal> = Percept<TSignal>,
>(options: DefineSensuOptions<TSignal, TPercept>): Sensu<TSignal, TPercept> {
  return {
    [SENSU_SYMBOL]: true,

    ...options,
  };
}
