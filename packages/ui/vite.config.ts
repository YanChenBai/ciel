import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    dts: {},
    entry: './src/index.ts',
    exports: true,
    plugins: [vue()],
  },
  resolve: {
    tsconfigPaths: true,
  },
});
