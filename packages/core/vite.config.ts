import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    tsconfigPaths: true,
  },
  pack: {},
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
