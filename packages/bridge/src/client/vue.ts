import { onBeforeUnmount } from 'vue';

import { createClient, type BridgeClient } from './client.ts';

type ClientArgs = Parameters<typeof createClient>;
type MessageListener = Parameters<BridgeClient['onMessage']>[0];

let client: BridgeClient | undefined;

export function createBridge(...args: ClientArgs) {
  function getClient() {
    if (!client) {
      client = createClient(...args);
    }

    return client;
  }

  function onMessage(listener: MessageListener) {
    const current = getClient();
    const off = current.onMessage(listener);
    const release = current.retain();
    const dispose = () => {
      off();
      release();
    };

    onBeforeUnmount(dispose);

    return dispose;
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
