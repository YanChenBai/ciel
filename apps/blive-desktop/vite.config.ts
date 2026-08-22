import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite-plus';

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
    },
  },
  electron: {
    main: {
      entry: 'src/main/index.ts',
      externalize: true,
      format: 'es',
    },
    preload: {
      entry: {
        index: 'src/preload/index.ts',
        live: 'src/preload/live.ts',
      },
      externalize: true,
      format: 'es',
    },
    renderer: {
      root: 'src/renderer',
      server: {
        port: 3000,
      },
    },
  },
  lint: {
    ignorePatterns: ['out/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: ['out/**'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
