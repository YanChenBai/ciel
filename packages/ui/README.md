# @ciels/ui

Reusable Vue observability UI for Ciel. The package is transport-agnostic: consumers provide the
Vigilia event stream and snapshot while `@ciels/bridge` remains responsible for connectivity.

```vue
<script setup lang="ts">
import { VigiliaDebugger } from '@ciels/ui';
import '@ciels/ui/style.css';
</script>

<template>
  <VigiliaDebugger :connected="connected" :events="events" :snapshot="snapshot" />
</template>
```

The component renders a DevTools-style execution waterfall, an ordered step list, and a shadcn-vue
detail dialog for captured input, output, errors, and raw Vigilia events.
