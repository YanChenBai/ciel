import { createApp } from 'vue';

import CielDevToolsApp from './CielDevToolsApp.vue';

import './style.css';

createApp(CielDevToolsApp, {
  endpoint: import.meta.env.VITE_CIEL_BRIDGE_URL ?? 'http://localhost:3000',
}).mount('#app');
