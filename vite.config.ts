import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    ignorePatterns: ['AGENTS.md', 'CLAUDE.md'],
    singleQuote: true,
    sortImports: true,
    sortTailwindcss: true,
    sortPackageJson: true,
    arrowParens: 'avoid',
    embeddedLanguageFormatting: 'auto',
  },
  test: {
    projects: ['./apps/*', './packages/*'],
  },
  lint: {
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  run: {
    cache: true,
    tasks: {
      'asr:install': {
        command: 'oxnode ./packages/asr/src/cli/index.ts model',
        cache: false,
      },
      'asr:voiceprint': {
        command: 'oxnode ./packages/asr/src/cli/index.ts voiceprint',
        cache: false,
      },
    },
  },
});
