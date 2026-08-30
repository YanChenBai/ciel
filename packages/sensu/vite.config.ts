import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  pack: {
    dts: true,
    exports: true,
  },
});
