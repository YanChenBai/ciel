import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    dts: {
      emitDtsOnly: true,
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
