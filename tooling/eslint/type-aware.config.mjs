import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/dist-runtime/**',
      '**/coverage/**',
      '**/*.spec.{ts,tsx}',
      '**/*.spec-support.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.int.spec.{ts,tsx}',
      '**/src/testing/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: repositoryRoot,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
);
