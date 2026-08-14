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

const ciel = new Ciel(new MicrophoneStimulus(), {
  nucleus: { model, memory },
});
await ciel.start();
```

Signal matching inside `Sensus` is automatic:

- `Echo` subclasses use an `Auris` processor.
- `Photon` subclasses use an `Oculus` processor.
- `Script` subclasses use a `Lectio` processor that aligns them as `Reading` percepts and emits them through Ciel's `data` event.

## Architecture

```mermaid
flowchart TD
  Stimulus --> Signals["Photon / Echo / Script"]
  Signals --> Sensus["Oculus / Auris / Lectio"]
  Sensus --> Percepts["Sight / Hearing / Reading"]
  Percepts --> PerceptStore["PerceptStore append"]

  PerceptStore -->|"independent checkout"| Context["Context projection"]
  Context --> Nucleus["Nucleus main agent"]
  Memory --> Nucleus
  Nucleus -->|"success"| NucleusCommit["commit nucleus cursor"]

  PerceptStore -->|"independent checkout"| Summarizer["summarizeEpisode"]
  Summarizer -->|"summary only"| Coordinator["deterministic append"]
  Coordinator --> Memory["Memory / LibSQL"]
  Coordinator -->|"success"| MemoryCommit["commit memory cursor"]
```

Both consumers receive stable checkouts. A failed call keeps its checkout for retry, while later
percepts continue to append. The episode summarizer is a replaceable function that receives multimodal
prompt parts but no tools or store handle; only deterministic Nucleus code appends the resulting Episode
and advances the memory cursor.

`Ciel.stop()` stops its stimulus, removes subscriptions, and closes its `Sensus`. Closing flushes stateful capabilities and releases their event listeners.

## Exports

- `Ciel`: lifecycle orchestration for the single Stimulus passed to its constructor.
- `Context`: trusted Stimulus/Signal definition and multimodal Percept prompt builder.
- `Memory`: Mastra Working Memory, date threads, and semantic recall backed by LibSQL and LibSQLVector.
- `Nucleus<TOutput>`: the thought and memory-summary scheduler.
- `PerceptStore`: the storage contract shared by context construction and memory archiving.
- `InMemoryPerceptStore`: the process-local append-only Percept store with independent consumer cursors.
- `Sensus`: unified signal routing, sensory capability, events, and lifecycle.
- `SensusBase<TSignal, TData>`: common signal binding and `data/error` event contract for sensory capabilities.
- `Stimulus`: typed event source with explicit `signals` and async `send()`.

Pass one Stimulus as the first `Ciel` constructor argument and its required Nucleus configuration
as the second argument. Ciel privately creates and owns both Nucleus and InMemoryPerceptStore; neither runtime
instance can be injected or retrieved. The Stimulus feeds that Nucleus while each realtime entry
retains its source Stimulus. `Context`
builds the trusted base definitions and chronological text/image Percept input. Ciel forwards
`thought` and `error` events and exposes only a projected snapshot through `getContext()`.

Oculus persists each sampled frame that differs enough from the last accepted frame. Every Sensus result
is first appended to `PerceptStore`; Nucleus and memory archiving then read it through independent cursors.
A checkout stays frozen until its consumer commits it, so failed calls retry the same input while records
arriving during the call remain pending for the next checkout. Nucleus composes up to nine visual frames
into each context image. Prompt image count is bounded, but original image paths remain in PerceptStore.

Nucleus privately adds `memory_update` for replacing refined global memory and `memory_recall` for
semantic search across historical date threads. Reaching the configured model-input token size, a quiet
period, or shutdown summarizes unread Percepts into the current date thread. Visual records are compacted
into bounded contact sheets for both thought and archive prompts. `Soul` and
`Identity` are protected strings on `Ciel`; subclasses may
override them, and Context adds their Markdown headings when assembling the model prompt.

- `Echo`, `Photon`, `Script`: immutable signal bases with static metadata.
- `Auris`, `Oculus`, `Lectio`: lower-level signal-bound sensory capabilities.
- `Percept`: the `Hearing | Reading | Sight` result union.
- `Hearing`, `Reading`, `Sight`: percepts retaining their single origin signal constructor.

After VAD closes a speech segment, ASR emits its result before `speechend`. Auris and Sensus preserve that
ordering, so Hearing is already in PerceptStore when Ciel calls `Nucleus.speechEnd()`. The first speech end can
think immediately; later speech ends are coalesced by `minThinkInterval`, while `maxThinkInterval` remains
the fallback when no speech ends. Other Percepts only enter context and do not trigger thought themselves.

The current PerceptStore implementation is process-local. Its record and cursor contract is deliberately
separate from Nucleus so a durable LibSQL adapter can replace the storage backend without changing the
context or memory consumers.

Memory uses `resourceId` as the namespace for working memory, daily thread IDs, semantic recall, and
idempotent message IDs. Multiple rooms can therefore share one LibSQL database without colliding or
reading each other's daily episodes.

## Development

```bash
vp check
vp test
vp pack
```
