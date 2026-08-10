import { onBeforeUnmount } from 'vue';

import { createClient, type BridgeClient } from './client.ts';

type ClientArgs = Parameters<typeof createClient>;
type MessageListener = Parameters<BridgeClient['onMessage']>[0];

let client: BridgeClient | undefined;

export function createBridge(...args: ClientArgs) {
  function getClient() {
    if (!client) {
      client = createClient(...args);
      client.connect();
    }

    return client;
  }

  function onMessage(listener: MessageListener) {
    const off = getClient().onMessage(listener);

    onBeforeUnmount(off);

    return off;
  }

  function destroy() {
    client?.disconnect();
    client = undefined;
  }

  return {
    onMessage,
    destroy,
  };
}
