import { createNanoEvents } from 'nanoevents';

import { Photon, Echo } from '#signals';

export class Stimulus {
  private readonly emitter = createNanoEvents<{
    photon(data: Photon): void;
    echo(data: Echo): void;
  }>();

  on = this.emitter.on.bind(this.emitter);

  start() {}
}
