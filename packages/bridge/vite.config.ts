import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  pack: {
    exports: true,
    dts: {},
    entry: {
      index: './src/server/index.ts',
      protocol: './src/protocol/index.ts',
      client: './src/client/client.ts',
      vue: './src/client/vue.ts',
    },
  },
});
