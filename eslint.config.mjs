import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const commonGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  DOMException: 'readonly',
  fetch: 'readonly',
  HTMLElement: 'readonly',
  localStorage: 'readonly',
  module: 'readonly',
  NodeJS: 'readonly',
  process: 'readonly',
  React: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  caches: 'readonly',
  self: 'readonly',
  URL: 'readonly',
  window: 'readonly',
};

const testGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  jest: 'readonly',
  test: 'readonly',
};

const restrictedFileNameRule = (message) => ({
  'no-restricted-syntax': [
    'error',
    {
      selector: 'Program',
      message,
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      next: {
        rootDir: ['apps/web/'],
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/jest.setup.ts'],
    languageOptions: {
      globals: testGlobals,
    },
  },

  {
    files: ['**/*.policy.ts'],
    rules: {
      'no-restricted-imports': 'off',

      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@pressly/contracts',
              allowTypeImports: true,
              message:
                'Policy files may only import types from @pressly/contracts.',
            },
          ],
          patterns: [
            {
              regex: '^(?!@pressly/contracts$).*',
              allowTypeImports: false,
              message: 'Policy files may only import from @pressly/contracts.',
            },
          ],
        },
      ],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
    },
  },

  {
    files: ['**/*.usecase.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?!(?:@pressly/|.*\\.(?:policy|port|error)(?:\\.(?:ts|js))?$)).*',
              message:
                'Usecase files may only import @pressly/* packages, *.policy, *.port, or *.error files.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.port.ts'],
    rules: {
      'no-restricted-imports': 'off',

      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:@pressly\\/.*|.*\\.(?:policy)(?:\\.(?:ts|js))?)$',
              allowTypeImports: true,
              message:
                'Port files may only import types from @pressly/*, or *.policy files.',
            },
            {
              regex:
                '^(?!(?:@pressly\\/.*|.*\\.(?:policy)(?:\\.(?:ts|js))?$)).*',
              message:
                'Port files may only import from @pressly/* or *.policy files.',
            },
          ],
        },
      ],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
    },
  },

  {
    files: ['**/*.error.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@pressly\\/|\\.).*',
              message:
                'Error files may only import @pressly/* packages or *.policy files.',
            },
            {
              regex: '^\\.(?!.*\\.policy(?:\\.(?:ts|js))?$).*',
              message:
                'Relative imports in error files must target *.policy files.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.route.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^\\.(?!.*\\.(?:usecase|controller|middleware)(?:\\.(?:ts|js))?$).*',
              message:
                'Route files may only use relative imports for *.usecase, *.controller, or *.middleware files.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.controller.ts', '**/*.middleware.ts'],
    rules: {
      'no-restricted-imports': 'off',

      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!express$|@pressly\\/|\\.).*',
              message:
                'Controller and middleware files may only import packages from express or @pressly/*.',
            },
            {
              regex:
                '^\\.(?!.*(?:\\.usecase(?:\\.(?:ts|js))?$|\\/common\\/persistence\\/read-bearer(?:\\.(?:ts|js))?$)).*',
              message:
                'Controller and middleware files may only use relative imports for *.usecase files or the common bearer-token reader.',
            },
            {
              regex: '^\\..*\\.usecase(?:\\.(?:ts|js))?$',
              allowTypeImports: true,
              message:
                'Controller and middleware files may only type-import from *.usecase files.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.repo.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!@pressly\\/|\\.).*',
              message:
                'Repo files may only import @pressly/* packages, *.port files, or common persistence helpers.',
            },
            {
              regex:
                '^\\.(?!.*(?:\\.port(?:\\.(?:ts|js))?$|\\/common\\/persistence\\/)).*',
              message:
                'Relative imports in repo files must target *.port files or common persistence helpers.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/adapters/**/http/**/*.ts', '**/adapter/**/http/**/*.ts'],
    ignores: [
      '**/adapters/**/http/**/*.controller.ts',
      '**/adapters/**/http/**/*.route.ts',
      '**/adapters/**/http/**/*.middleware.ts',
      '**/adapter/**/http/**/*.controller.ts',
      '**/adapter/**/http/**/*.route.ts',
      '**/adapter/**/http/**/*.middleware.ts',
    ],
    rules: restrictedFileNameRule(
      'HTTP adapter files must end with .controller.ts, .route.ts, or .middleware.ts.',
    ),
  },

  {
    files: [
      '**/adapters/**/persistence/**/*.ts',
      '**/adapter/**/persistence/**/*.ts',
    ],
    ignores: [
      '**/adapters/common/persistence/**/*.ts',
      '**/adapters/**/persistence/**/*.repo.ts',
      '**/adapter/common/persistence/**/*.ts',
      '**/adapter/**/persistence/**/*.repo.ts',
    ],
    rules: restrictedFileNameRule(
      'Persistence adapter files must end with .repo.ts.',
    ),
  },

  {
    files: ['modules/*/src/features/**/*.ts'],
    ignores: [
      'modules/*/src/features/**/*.usecase.ts',
      'modules/*/src/features/**/*.port.ts',
      'modules/*/src/features/**/*.error.ts',
    ],
    rules: restrictedFileNameRule(
      'Feature files must end with .usecase.ts, .port.ts, or .error.ts.',
    ),
  },

  {
    files: ['**/domain/**/*.ts'],
    ignores: ['**/domain/**/*.machine.ts', '**/domain/**/*.policy.ts'],
    rules: restrictedFileNameRule(
      'Domain files must end with .machine.ts or .policy.ts.',
    ),
  },

  prettier,
);
