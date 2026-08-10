import { createBridge } from '@ciels/bridge/vue';

export const { onMessage } = createBridge('localhost:3000');
