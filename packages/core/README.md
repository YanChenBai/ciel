# @ciels/core

Signals, stimuli, percepts, sensory processors, and runtime orchestration for Ciel.

## Runtime

A stimulus declares every concrete signal class it can emit. `Ciel` creates one isolated `Sensus` for the stimulus, and `Sensus` binds every declared signal to its sensory capability.

```ts
import { Ciel, Echo, Stimulus } from '@ciels/core';

class MicrophoneEcho extends Echo.WithMeta({
  name: 'Microphone',
  description: 'Primary microphone audio',
}) {}

const signals = [MicrophoneEcho] as const;
const segment = { data: Buffer.alloc(320), startAt: new Date() };

class MicrophoneStimulus extends Stimulus<typeof signals> {
  static readonly meta = {
    name: 'Local microphone',
    description: 'The scene observed through the local microphone',
  };

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

Signal matching inside `Sensus` is automatic:

- `Echo` subclasses use an `Auris` processor.
- `Photon` subclasses use an `Oculus` processor.
- `Script` subclasses use a `Lectio` processor that aligns them as `Reading` percepts and emits them through Ciel's `data` event.

`Ciel.stop()` stops stimuli, removes subscriptions, and closes each `Sensus`. Closing flushes stateful capabilities and releases their event listeners.

## Exports

- `Ciel`: stimulus registration and lifecycle orchestration.
- `Memory`: Mastra-backed memory using local LibSQL persistence or `:memory:` mode, without a required embedding model.
- `Nucleus<TOutput>`: the many-stimuli cognition runtime, unified realtime Context, memory owner, tool runner, and min/max thought scheduler.
- `Sensus`: unified signal routing, sensory capability, events, and lifecycle.
- `SensusBase<TSignal, TData>`: common signal binding and `data/error` event contract for sensory capabilities.
- `Stimulus`: typed event source with explicit `signals` and async `send()`.

Pass `nucleus` to `Ciel` to create its single lifecycle-managed `Nucleus`. Every registered
Stimulus feeds the same Nucleus while each Context entry retains its source Stimulus. Ciel
forwards `thought` and `error` events and exposes the runtime through `getNucleus()` and its
assembled realtime-plus-memory state through `getContext()`.

Nucleus privately adds tools for long-term writes and history recall, plus runtime-managed episodic
summaries. A quiet period, buffered image/text pressure, actual input-token pressure, explicit
flush, or shutdown closes the current episode. Valid Oculus JPEGs are sent directly to the
multimodal model while the live context keeps only a configured number of recent images and blank
images are skipped. Applications provide the model, custom system/messages, and domain action
tools.

- `Echo`, `Photon`, `Script`: immutable signal bases with static metadata.
- `Auris`, `Oculus`, `Lectio`: lower-level signal-bound sensory capabilities.
- `Percept`: the `Hearing | Reading | Sight` result union.
- `Hearing`, `Reading`, `Sight`: percepts retaining their single origin signal constructor.

## Development

```bash
vp check
vp test
vp pack
```
