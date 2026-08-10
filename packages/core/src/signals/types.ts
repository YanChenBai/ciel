import type { Echo } from './echo.ts';
import type { Photon } from './photon.ts';
import type { Script } from './script.ts';

export interface SignalMeta {
  title: string;
  description: string;
}

export type Signal = Echo | Photon | Script;

export type SignalConstructor<TSignal extends Signal = Signal> = (abstract new (
  ...args: any[]
) => TSignal) & {
  readonly meta: SignalMeta;
};
