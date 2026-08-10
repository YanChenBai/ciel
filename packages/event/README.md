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
```

- `emit()` invokes listeners synchronously and does not wait for returned promises.
- `emitAsync()` invokes the current listener snapshot and waits for all results.
- `once()` removes its listener before invoking it.
- `clear()` removes one event or every listener.

## EventHost

Extend `EventHost` when consumers should subscribe publicly but only the class itself may emit:

```ts
class Channel extends EventHost<{ value(value: number): void }> {
  publish(value: number) {
    this.emit('value', value);
  }
}
```

## Development

```bash
vp check
vp test
vp pack
```
