import { NanoEvents } from '#/events/index.ts';
import { Photon, Echo } from '#signals';

export interface StimulusEventMap {
  photon(data: Photon): void;
  echo(data: Echo): void;
}

export abstract class Stimulus extends NanoEvents<StimulusEventMap> {
  abstract start(): void | Promise<void>;
}

export class BliveStimulus extends Stimulus {
  start() {}
}
