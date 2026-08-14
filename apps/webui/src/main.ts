import { createPinia } from 'pinia';
import { createVaporApp } from 'vue';
import type { VaporComponent } from 'vue';

import App from './App.vue';

// App.vue is explicitly compiled with the `vapor` SFC marker. The cast bridges Vite+'s generic
// .vue shim, while vue-tsc still verifies the actual Vapor component.
const app = createVaporApp(App as unknown as VaporComponent);

app.use(createPinia());

app.mount('#app');
