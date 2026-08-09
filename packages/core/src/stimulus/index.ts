import { NanoEvents } from '#/events/index.ts';
import type { Echo, Script, Photon } from '#signals';

export interface StimulusEventMap {
  photon(data: Photon): void;
  echo(data: Echo): void;
  script(data: Script): void;
}

export abstract class Stimulus extends NanoEvents<StimulusEventMap> {
  abstract readonly prompt: string;
  abstract start(): void | Promise<void>;
  abstract stop(): void | Promise<void>;
}
