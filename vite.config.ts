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
    projects: ['./apps/webui', './packages/core'],
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
      'auris:install': {
        command: 'node ./packages/core/scripts/install-auris-models.ts',
        cache: false,
      },
      'auris:voiceprint': {
        command: 'node ./packages/core/scripts/create-voiceprint.ts',
        cache: false,
      },
    },
  },
});
