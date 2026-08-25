import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { fileURLToPath } from 'node:url';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import {
  aggregatePackageRootDynamicSyntax,
  aggregatePackageRootRestrictions,
  entityLanguageSyntax,
  expectedFailureImportRestrictions,
  expectedFailureSyntax,
  makePresslyLanguagePlugin,
  nativeThrowableSyntax,
  pureDecisionImportRestrictions,
  pureDecisionSyntax,
} from './tooling/eslint/pressly-language-rules.mjs';

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

const aggregateBusinessOwnerRootPattern = {
  regex:
    '^@pressly/(?:(?:access|customers|ingress|orders|pricing|production)-system|experience-(?:control|customer|processor))$',
  message:
    'Import an exact owner operation, contract, capability, assembly, or testing subpath instead of the aggregate business-owner root.',
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

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

export const presslyLanguagePlugin = makePresslyLanguagePlugin({
  repositoryRoot,
});

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/dist-runtime/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },

  {
    plugins: {
      'pressly-language': presslyLanguagePlugin,
    },
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: repositoryRoot,
      },
    },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
    },
    rules: {
      'no-restricted-imports': ['error', aggregatePackageRootRestrictions],
      'no-restricted-syntax': ['error', ...aggregatePackageRootDynamicSyntax],
      'pressly-language/mapper-role': 'error',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: commonGlobals,
      parserOptions: {
        tsconfigRootDir: repositoryRoot,
      },
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
      'no-restricted-imports': ['error', aggregatePackageRootRestrictions],
      'no-restricted-syntax': ['error', ...aggregatePackageRootDynamicSyntax],
      'pressly-language/mapper-role': 'error',
      'pressly-language/symbol-ownership': 'error',
    },
  },

  {
    files: ['experiences/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [aggregateBusinessOwnerRootPattern],
        },
      ],
    },
  },

  {
    files: ['experiences/*/src/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.int.spec.{ts,tsx}',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'clearInterval',
          'clearTimeout',
          'crypto',
          'document',
          'fetch',
          'globalThis',
          'localStorage',
          'navigator',
          'performance',
          'process',
          'requestAnimationFrame',
          'setInterval',
          'setTimeout',
          'window',
        ].map((name) => ({
          name,
          message:
            'Experience source receives process and browser effects through an Experience-owned capability implemented by its host.',
        })),
      ],
      'pressly-language/experience-effect-ownership': 'error',
    },
  },

  {
    files: ['systems/*/src/**/*.{ts,tsx}'],
    ignores: [
      'systems/*/src/testing/**/*.{ts,tsx}',
      'systems/*/src/**/*.spec.{ts,tsx}',
      'systems/*/src/**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [
            aggregateBusinessOwnerRootPattern,
            {
              regex: '^(?![.]|@pressly/|zod$|drizzle-orm(?:/|$)).+',
              message:
                'Systems may use owner source, Pressly Platform contracts, Zod contracts, and Drizzle schema declarations only; vendor and process mechanisms belong outside Systems.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['verification/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [aggregateBusinessOwnerRootPattern],
        },
      ],
    },
  },

  {
    files: [
      'verification/queries/test/load-board.conformance.int.test.ts',
      'verification/queries/test/preview-order-backlog.conformance.int.test.ts',
      'verification/queries/test/preview-order-route.conformance.int.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [
            aggregateBusinessOwnerRootPattern,
            {
              regex:
                '^@pressly/access-system/assembly/production-capabilities$',
              message:
                'Production-only query verification uses data-only assembly dependencies, not the real Access PostgreSQL capability adapter.',
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'systems/*/src/testing/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'systems/*/src/**/*.spec.{js,jsx,mjs,cjs,ts,tsx}',
      'systems/*/src/**/*.test.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [aggregateBusinessOwnerRootPattern],
        },
      ],
    },
  },

  {
    files: ['systems/*/src/testing/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'pressly-language/system-testing-owner-schema': 'error',
    },
  },

  {
    files: [
      'systems/production/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'verification/scheduling/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'verification/queries/test/load-board.conformance.int.test.ts',
      'verification/queries/test/preview-order-backlog.conformance.int.test.ts',
      'verification/queries/test/preview-order-route.conformance.int.test.ts',
    ],
    rules: {
      'pressly-language/production-peer-schema-isolation': 'error',
    },
  },

  {
    files: ['hosts/**/src/**/*.{ts,tsx}'],
    rules: {
      'pressly-language/host-domain-neutrality': 'error',
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [
            {
              regex: '^drizzle-orm(?:/.*)?$',
              message:
                'Import database runtime primitives through explicit @pressly/postgres subpaths.',
            },
            {
              regex:
                '^@pressly/(?:experience-[^/]+|[^/]+-system|topology)(?:/.*)?$',
              message:
                'Hosts consume generated runtime bindings and Platform mechanisms, never business owners directly.',
            },
            {
              regex: '^(?:\\.\\./)+(?:systems|experiences|topology)(?:/.*)?$',
              message:
                'Hosts consume generated runtime bindings and never reach into business roots by relative path.',
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'topology/runtime/**/*.{ts,tsx}',
      'topology/src/runtime/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [
            {
              regex:
                '^(?:express|cors|helmet|dotenv|@sentry(?:/.*)?|node:(?:fs|os|child_process|process))(?:/.*)?$',
              message:
                'Topology assembles injected structural capabilities; protocol frameworks and process effects belong to hosts.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['generated/runtime/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message:
            'Generated bindings receive browser effects from their owning host.',
        },
        {
          name: 'document',
          message:
            'Generated bindings receive browser effects from their owning host.',
        },
        {
          name: 'localStorage',
          message:
            'Generated bindings receive browser effects from their owning host.',
        },
        {
          name: 'process',
          message:
            'Generated bindings receive process effects from their owning host.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          ...aggregatePackageRootRestrictions,
          patterns: [
            {
              regex:
                '^(?:dotenv|@sentry(?:/.*)?|node:(?:fs|os|child_process|process))(?:/.*)?$',
              message:
                'Generated runtime binds injected effects; vendor and process mechanisms belong to hosts.',
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'experiences/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'hosts/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'hosts/browser/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'platform/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'systems/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'topology/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    ignores: ['platform/errors/src/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...aggregatePackageRootDynamicSyntax,
        ...nativeThrowableSyntax,
      ],
    },
  },

  {
    files: [
      'experiences/customer/src/web/**/*.{ts,tsx}',
      'hosts/browser/customer/**/*.{ts,tsx}',
    ],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      next: {
        rootDir: ['hosts/browser/customer/'],
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
    files: [
      'experiences/customer/src/web/actions/**/*.{ts,tsx}',
      'experiences/customer/src/web/composition/model/**/*.{ts,tsx}',
      'experiences/customer/src/web/telemetry/model/**/*.{ts,tsx}',
      'experiences/customer/src/web/transport/model/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:next(?:/.*)?$|react(?:/.*)?$|react-dom(?:/.*)?$|@sentry/.*|posthog-js$|sonner$)',
              message:
                'Web core owns technical contracts and policies, not framework or vendor implementations.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['experiences/customer/src/web/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:@pressly/(?!errors/factories$)|next(?:/.*)?$)',
              message:
                'UI primitives may only depend on the pure error factory package, not application, protocol, or server capabilities.',
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'experiences/*/src/cells/**/*.{ts,tsx}',
      'systems/*/src/cells/**/*.{ts,tsx}',
    ],
    rules: {
      'pressly-language/cell-isolation': 'error',
    },
  },

  {
    files: [
      'hosts/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'systems/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'experiences/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'platform/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'topology/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'generated/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    ignores: ['hosts/**/test/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'host', pattern: 'hosts/*/**' },
        { type: 'system', pattern: 'systems/*/**' },
        { type: 'experience', pattern: 'experiences/*/**' },
        { type: 'platform', pattern: 'platform/*/**' },
        { type: 'topology', pattern: 'topology/**' },
        { type: 'generated', pattern: 'generated/**' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'host' } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ['system', 'experience', 'topology'] },
                  },
                },
              },
            },
            {
              from: { element: { type: 'platform' } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        'host',
                        'system',
                        'experience',
                        'topology',
                        'generated',
                      ],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'system' } },
              disallow: {
                to: {
                  element: {
                    types: {
                      anyOf: ['host', 'experience', 'topology', 'generated'],
                    },
                  },
                },
              },
            },
            {
              from: { element: { type: 'experience' } },
              disallow: {
                to: {
                  element: {
                    types: { anyOf: ['host', 'topology', 'generated'] },
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },

  {
    files: [
      'experiences/*/src/**/*.{ts,tsx}',
      'generated/**/*.{ts,tsx}',
      'hosts/*/src/**/*.{ts,tsx}',
      'platform/*/src/**/*.{ts,tsx}',
      'systems/*/src/**/*.{ts,tsx}',
      'topology/src/**/*.{ts,tsx}',
      'topology/tooling/**/*.{ts,tsx}',
    ],
    ignores: [
      '**/*.int.spec.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      'platform/cells/src/state-machine.ts',
    ],
    rules: {
      'pressly-language/no-double-unknown-assertion': 'error',
      'pressly-language/no-non-null-assertion': 'error',
    },
  },

  {
    files: [
      'systems/**/cells/**/{algorithm,confirmation,decide,decision,idempotency,lifecycle,policy}.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        pureDecisionImportRestrictions,
      ],
      'no-restricted-syntax': [
        'error',
        ...aggregatePackageRootDynamicSyntax,
        ...nativeThrowableSyntax,
        ...pureDecisionSyntax,
      ],
    },
  },

  {
    files: [
      'experiences/**/*.failure.{ts,tsx}',
      'systems/**/*.failure.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        expectedFailureImportRestrictions,
      ],
      'no-restricted-syntax': [
        'error',
        ...aggregatePackageRootDynamicSyntax,
        ...nativeThrowableSyntax,
        ...expectedFailureSyntax,
      ],
    },
  },

  {
    files: ['experiences/**/*.entity.{ts,tsx}', 'systems/**/*.entity.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...aggregatePackageRootDynamicSyntax,
        ...nativeThrowableSyntax,
        ...entityLanguageSyntax,
      ],
    },
  },

  {
    files: [
      'hosts/**/{common,shared,utils,services}/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'systems/**/{common,shared,utils,services}/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'experiences/**/{common,shared,utils,services}/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'platform/**/{common,shared,utils,services}/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Cellular code requires a precise semantic owner; generic common, shared, utils, and services buckets are forbidden.',
    ),
  },

  {
    files: [
      'hosts/browser/customer/src/app/shared/**/*.{ts,tsx}',
      'hosts/browser/customer/src/deploy/**/*.{ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Web code is feature-oriented. Use a product feature, a bounded route-private folder, or common technical infrastructure.',
    ),
  },

  prettier,
);
