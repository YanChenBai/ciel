import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite-plus';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
  },
  plugins: [vue(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  electron: {
    main: {
      entry: 'src/main/index.ts',
      externalize: true,
      format: 'es',
    },
    preload: {
      entry: { index: 'src/preload/index.ts' },
      externalize: true,
      format: 'es',
    },
    renderer: {
      root: 'src/renderer',
    },
  },
  lint: {
    ignorePatterns: ['out/**'],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: ['out/**'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
  run: {
    tasks: {
      dev: {
        command: 'evp dev',
        cache: false,
        dependsOn: [{ task: 'build', from: 'dependencies' }],
      },
    },
  },
});
