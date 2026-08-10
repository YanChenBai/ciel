import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
  pack: {
    dts: {},
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
