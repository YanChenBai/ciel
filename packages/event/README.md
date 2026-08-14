# @ciels/event

Small, dependency-free typed event primitives shared by Ciel packages.

## EventEmitter

Use `EventEmitter` for composition:

```ts
const events = new EventEmitter<{
  message(value: string): void | Promise<void>;
}>();

const unsubscribe = events.on('message', value => console.log(value));
events.emit('message', 'fire-and-forget');
await events.emitAsync('message', 'wait for listeners');
unsubscribe();

events.$on.message(value => console.log(value));
events.$emit.message('fire-and-forget');
await events.$emitAsync.message('wait for listeners');
```

- `emit()` invokes listeners synchronously and does not wait for returned promises.
- `emitAsync()` invokes the current listener snapshot and waits for all results.
- `once()` removes its listener before invoking it.
- `clear()` removes one event or every listener.
- `$on`, `$once`, `$emit`, and `$emitAsync` provide the same operations with event-name
  completion.

## EventHost

Extend `EventHost` when consumers should subscribe publicly but only the class itself may emit:

```ts
class Channel extends EventHost<{ value(value: number): void }> {
  publish(value: number) {
    this.$emit.value(value);
  }

  publishAsync(value: number) {
    return this.$emitAsync.value(value);
  }
}

const channel = new Channel();
const off = channel.$on.value(value => console.log(value));
channel.$once.value(value => console.log('once', value));
off();
```

`$on.<event>()` and `$once.<event>()` provide event-name completion while preserving each
event's listener signature. The existing `on(event, listener)` and `once(event, listener)` APIs
remain available.

`$emit.<event>()` provides the same event-name completion to subclasses while remaining
protected. The existing `emit(event, ...args)` API remains available.

`$emitAsync.<event>()` provides the asynchronous counterpart and resolves after all current
listeners have completed. The existing `emitAsync(event, ...args)` API remains available.

`inheritEvents(source, ...events)` forwards selected same-name events from another typed event
source. Only events whose source parameters are compatible with the host event are accepted, and
the returned function stops all forwarding:

```ts
class Parent extends EventHost<{ error(error: Error): void }> {
  constructor(child: EventHost<{ error(error: Error): void }>) {
    super();
    this.inheritEvents(child, 'error');
  }
}
```

## Development

```bash
vp check
vp test
vp pack
```
