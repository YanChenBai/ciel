import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';
import { defineConfig } from 'vite-plus';
import { lazyPlugins } from 'vite-plus';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/app',
  },
  pack: {
    dts: {},
    entry: './src/index.ts',
    exports: true,
    outDir: 'dist/lib',
    plugins: [vue()],
    tsconfig: './tsconfig.app.json',
  },
  plugins: lazyPlugins(() => [vue(), tailwindcss(), vueDevTools()]),
  resolve: {
    tsconfigPaths: true,
  },
  run: {
    tasks: {
      typecheck: 'vue-tsc --build',
    },
  },
  server: {
    port: 4173,
  },
});
