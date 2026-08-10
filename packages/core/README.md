# @ciels/core

Signals, stimuli, perception processors, and runtime orchestration for Ciel.

## Runtime

A stimulus declares every concrete signal class it can emit. `Ciel` discovers those classes when it starts and creates one isolated processor for each stimulus/signal pair.

```ts
import { Ciel, Echo, Stimulus } from '@ciels/core';

class MicrophoneEcho extends Echo.WithMeta({
  title: 'Microphone',
  description: 'Primary microphone audio',
}) {}

const signals = [MicrophoneEcho] as const;
const segment = { data: Buffer.alloc(320), startAt: new Date() };

class MicrophoneStimulus extends Stimulus<typeof signals> {
  readonly signals = signals;

  async start() {
    await this.send(new MicrophoneEcho(segment));
  }

  async stop() {}
}

const ciel = new Ciel();
ciel.use(new MicrophoneStimulus());
await ciel.start();
```

Signal matching is automatic:

- `Echo` subclasses use an `Auris` processor.
- `Photon` subclasses use an `Oculus` processor.
- `Script` subclasses are emitted directly as Ciel `script` events.

`Ciel.stop()` stops stimuli, waits for asynchronous processor queues, flushes stateful processors, and removes subscriptions.

## Exports

- `Ciel`: stimulus registration and lifecycle orchestration.
- `Stimulus`: typed event source with explicit `signals` and async `send()`.
- `Echo`, `Photon`, `Script`: immutable signal bases with static metadata.
- `Auris`, `Oculus`: signal-bound perception processors.
- `Hearing`, `Sight`: perception results retaining their signal class.

## Development

```bash
vp check
vp test
vp pack
```
