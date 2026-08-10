# @ciels/webui

Vue development interface for observing Ciel through `@ciels/bridge`.

The app retains one shared bridge client while Vue consumers are mounted and
releases the WebSocket connection after the final consumer unmounts.

## Development

Run these commands from the repository root:

```bash
vp run --filter @ciels/webui dev
vp run --filter @ciels/webui preview
```

Build the workspace before previewing production output:

```bash
vp build
```
