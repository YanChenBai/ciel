import postcssTailwindcss from '@tailwindcss/postcss';
import vue from '@vitejs/plugin-vue';
import postcssImport from 'postcss-import';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    css: {
      transformer: 'postcss',
      postcss: {
        plugins: [postcssImport(), postcssTailwindcss()],
      },
    },
    dts: {},
    entry: './src/index.ts',
    exports: true,
    plugins: [vue()],
    tsconfig: './tsconfig.app.json',
  },
  resolve: {
    tsconfigPaths: true,
  },
  run: {
    tasks: {
      typecheck: 'vue-tsc --build',
    },
  },
});
