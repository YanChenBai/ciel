import { createBridge } from '@ciels/bridge/vue';

export const { onMessage } = createBridge('http://localhost:3000');
