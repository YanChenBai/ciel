import '@ciels/devtool-client/style.css';
import './style.css';
import { createApp } from 'vue';

import App from './App.vue';
import { watchBliveTheme } from './theme.ts';

createApp(App).use(watchBliveTheme).mount('#app');
