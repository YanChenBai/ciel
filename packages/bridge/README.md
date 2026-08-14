# @ciels/bridge

Typed WebSocket transport for Ciel, implemented with Elysia and Eden Treaty.

The server can expose a Core `Vigilia` journal. Each WebSocket connection first receives a
`vigilia.bootstrap` message containing the current projection and replay history, followed by
ordered `vigilia.event` increments. The browser client reconnects after transport loss and obtains
a fresh baseline, so consumers can deduplicate by sequence.

```ts
import { createBridge } from '@ciels/bridge';

const bridge = createBridge(ciel);
bridge.listen(3000);
```

## Exports

- `@ciels/bridge`: Elysia WebSocket server and `App` type.
- `@ciels/bridge/protocol`: transport message types.
- `@ciels/bridge/client`: retained browser/client connection.
- `@ciels/bridge/vue`: Vue integration for the retained client.

## Client

```ts
import { createClient } from '@ciels/bridge/client';

const client = createClient('http://localhost:3000');
const release = client.retain();
const unsubscribe = client.onMessage(message => console.log(message));

unsubscribe();
release();
```

The first retain opens the socket and the last release closes it. Message listeners use `@ciels/event`.

## Development

```bash
vp check
vp pack
```
