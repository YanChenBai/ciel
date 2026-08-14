import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { defineConfig } from 'vite-plus';
import { lazyPlugins } from 'vite-plus';

// https://vite.dev/config/
export default defineConfig({
  plugins: lazyPlugins(() => [vue(), tailwindcss(), vueDevTools()]),
  resolve: {
    tsconfigPaths: true,
  },
  run: {
    tasks: {
      typecheck: 'vue-tsc --build',
      build: {
        command: 'vp build',
        dependsOn: ['typecheck'],
      },
    },
  },
});
