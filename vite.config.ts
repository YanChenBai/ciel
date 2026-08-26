import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    ignorePatterns: ['AGENTS.md', 'CLAUDE.md', 'apps/blive-desktop/out/**'],
    singleQuote: true,
    sortImports: true,
    sortTailwindcss: true,
    sortPackageJson: true,
    arrowParens: 'avoid',
    embeddedLanguageFormatting: 'auto',
    jsdoc: {
      commentLineStrategy: 'multiline',
      descriptionWithDot: false,
    },
  },
  test: {
    projects: ['./apps/*', './packages/*'],
  },
  lint: {
    ignorePatterns: ['apps/blive-desktop/out/**'],
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
