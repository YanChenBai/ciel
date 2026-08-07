import { createNanoEvents } from 'nanoevents';
import {} from 'sherpa-onnx-node';

import { Hearing } from '#perceptions';
import type { Echo } from '#signals';

export interface ASROptions {}

export class ASR {
  private readonly emitter = createNanoEvents<{
    result(data: Hearing): void;
  }>();

  constructor() {}

  write(_echo: Echo) {}

  on = this.emitter.on.bind(this.emitter);
}
