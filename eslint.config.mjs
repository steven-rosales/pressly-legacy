import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import path from 'node:path';
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

const moduleFoundationTargets = new Map([
  ['business/auth', new Set(['http', 'persistence'])],
  ['policy/access-control', new Set(['identity'])],
]);

const businessModuleSourceRoleSuffixes = [
  'command',
  'controller',
  'error',
  'mapper',
  'middleware',
  'policy',
  'port',
  'repo',
  'route',
  'usecase',
];

const businessModuleSourceRolePattern = `modules/business/*/src/**/*.{${businessModuleSourceRoleSuffixes.join(',')}}.ts`;

const isPathInside = (candidate, owner) =>
  candidate === owner || candidate.startsWith(`${owner}/`);

const importSpecifier = (node) => {
  const specifier = node.source?.value;

  return typeof specifier === 'string' ? specifier : undefined;
};

const importVisitors = (checkImport) => ({
  ImportDeclaration: checkImport,
  ImportExpression: checkImport,
  ExportAllDeclaration: checkImport,
  ExportNamedDeclaration: checkImport,
});

const architecturePlugin = {
  rules: {
    'module-capability-imports': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Keep module capability imports inside the capability or an explicit foundation.',
        },
        schema: [],
        messages: {
          crossCapability:
            'Capability "{{source}}" cannot import "{{target}}". Keep the dependency inside the capability or promote a narrow explicit foundation.',
          outsideModule:
            'Module internals cannot use relative imports outside their own module.',
          rootInternal:
            'Capability files may only import root-level module ports, not root composition or public files.',
        },
      },
      create(context) {
        const filename = path.resolve(context.filename);
        const normalizedFilename = filename.replaceAll(path.sep, '/');
        const match = normalizedFilename.match(
          /\/modules\/(business|policy|computation)\/([^/]+)\/src\/([^/]+)\//,
        );

        if (match === null) return {};

        const [, group, moduleName, sourceCapability] = match;
        const moduleKey = `${group}/${moduleName}`;
        const srcMarker = `/modules/${moduleKey}/src/`;
        const srcRoot = normalizedFilename.slice(
          0,
          normalizedFilename.indexOf(srcMarker) + srcMarker.length,
        );
        const foundations = moduleFoundationTargets.get(moduleKey) ?? new Set();

        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined || !specifier.startsWith('.')) return;

          const target = path
            .resolve(path.dirname(filename), specifier)
            .replaceAll(path.sep, '/');

          if (!target.startsWith(srcRoot)) {
            context.report({ node, messageId: 'outsideModule' });
            return;
          }

          const targetRelative = target.slice(srcRoot.length);
          const [targetCapability] = targetRelative.split('/');

          if (targetCapability === sourceCapability) return;

          if (!targetRelative.includes('/')) {
            if (/\.port\.(?:ts|js)$/.test(targetRelative)) return;

            context.report({ node, messageId: 'rootInternal' });
            return;
          }

          if (
            foundations.has(targetCapability) &&
            !foundations.has(sourceCapability)
          )
            return;

          context.report({
            node,
            messageId: 'crossCapability',
            data: {
              source: sourceCapability,
              target: targetCapability,
            },
          });
        };

        return importVisitors(checkImport);
      },
    },

    'web-zone-imports': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce dependency direction between web routes, features, UI primitives, and technical infrastructure.',
        },
        schema: [],
        messages: {
          zoneDependency: '{{reason}} Imported web path: "{{target}}".',
        },
      },
      create(context) {
        const filename = path.resolve(context.filename);
        const normalizedFilename = filename.replaceAll(path.sep, '/');
        const webSrcMarker = '/apps/web/src/';
        const webSrcIndex = normalizedFilename.indexOf(webSrcMarker);

        if (webSrcIndex === -1) return {};

        const webSrcRoot = normalizedFilename
          .slice(0, webSrcIndex + webSrcMarker.length)
          .replace(/\/$/, '');
        const sourceRelative = normalizedFilename.slice(webSrcRoot.length + 1);
        const sourceName = path.basename(normalizedFilename);
        const isFeatureServer = /^(?:server|.+\.server)\.[jt]sx?$/.test(
          sourceName,
        );
        const inZone = (relativePath, zone) =>
          relativePath === zone || relativePath.startsWith(`${zone}/`);

        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined) return;

          let target;

          if (specifier.startsWith('@/'))
            target = path.resolve(webSrcRoot, specifier.slice(2));
          else if (specifier.startsWith('.'))
            target = path.resolve(path.dirname(filename), specifier);
          else return;

          const normalizedTarget = target.replaceAll(path.sep, '/');

          if (!isPathInside(normalizedTarget, webSrcRoot)) return;

          const targetRelative = normalizedTarget.slice(webSrcRoot.length + 1);
          let reason;

          if (inZone(sourceRelative, 'common/core')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'features') ||
              inZone(targetRelative, 'common/adapters')
            )
              reason =
                'Web core cannot import routes, product features, or concrete adapters.';
          } else if (inZone(sourceRelative, 'common/adapters')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'features')
            )
              reason =
                'Concrete web adapters cannot import routes or product features.';
          } else if (inZone(sourceRelative, 'common')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'features')
            )
              reason =
                'Web common code cannot import routes or product features.';
          } else if (inZone(sourceRelative, 'features')) {
            if (inZone(targetRelative, 'app'))
              reason = 'Product features cannot import the Next route tree.';
            else if (
              !isFeatureServer &&
              inZone(targetRelative, 'common/adapters')
            )
              reason =
                'Product feature logic cannot select concrete adapters. Compose them in server.ts or the route boundary.';
          } else if (inZone(sourceRelative, 'components/ui')) {
            const targetWithoutExtension = targetRelative.replace(
              /\.[jt]sx?$/,
              '',
            );

            if (
              !inZone(targetWithoutExtension, 'components/ui') &&
              targetWithoutExtension !== 'styles/utils'
            )
              reason =
                'UI primitives may only import other UI primitives or the shared style utility.';
          } else if (inZone(sourceRelative, 'config')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'features') ||
              inZone(targetRelative, 'common/adapters')
            )
              reason =
                'Static web configuration cannot depend on routes, product behavior, or concrete adapters.';
          }

          if (reason !== undefined)
            context.report({
              node,
              messageId: 'zoneDependency',
              data: { reason, target: targetRelative },
            });
        };

        return importVisitors(checkImport);
      },
    },

    'web-private-route-imports': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Keep Next private route folders inside the route subtree that owns them.',
        },
        schema: [],
        messages: {
          privateRoute:
            'Private route code may only be imported from inside its owning route subtree.',
        },
      },
      create(context) {
        const filename = path.resolve(context.filename);
        const normalizedFilename = filename.replaceAll(path.sep, '/');
        const appMarker = '/apps/web/src/app/';
        const appIndex = normalizedFilename.indexOf(appMarker);
        const webSrcRoot =
          appIndex === -1
            ? normalizedFilename.slice(
                0,
                normalizedFilename.indexOf('/apps/web/src/') +
                  '/apps/web/src/'.length,
              )
            : normalizedFilename.slice(0, appIndex + '/apps/web/src/'.length);

        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined) return;

          let target;

          if (specifier.startsWith('@/'))
            target = path.resolve(webSrcRoot, specifier.slice(2));
          else if (specifier.startsWith('.'))
            target = path.resolve(path.dirname(filename), specifier);
          else return;

          const normalizedTarget = target.replaceAll(path.sep, '/');
          const targetAppIndex = normalizedTarget.indexOf(appMarker);

          if (targetAppIndex === -1) return;

          const targetSegments = normalizedTarget
            .slice(targetAppIndex + appMarker.length)
            .split('/');
          const privateIndex = targetSegments.findIndex((segment) =>
            /^_(?:components|lib|shared)$/.test(segment),
          );

          if (privateIndex === -1) return;

          const owner =
            `${normalizedTarget.slice(0, targetAppIndex + appMarker.length)}${targetSegments
              .slice(0, privateIndex)
              .join('/')}`.replace(/\/$/, '');

          if (isPathInside(normalizedFilename, owner)) return;

          context.report({ node, messageId: 'privateRoute' });
        };

        return importVisitors(checkImport);
      },
    },
  },
};

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

  {
    plugins: {
      architecture: architecturePlugin,
    },
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
    files: [
      'apps/**/*.{ts,tsx}',
      'modules/**/*.{ts,tsx}',
      'packages/**/*.{ts,tsx}',
    ],
    ignores: ['packages/db/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^drizzle-orm(?:/.*)?$',
              message:
                'Import database primitives through @pressly/db so SQL safety constraints cannot be bypassed.',
            },
          ],
        },
      ],
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
    files: ['modules/**/*.policy.ts', 'modules/**/*.machine.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)',
              message:
                'Intrinsic policy and state-machine files cannot import database, HTTP, or UI mechanisms.',
            },
            {
              regex:
                '^\\.(?!.*\\.(?:policy|machine|port|resource)(?:\\.(?:ts|js))?$).*',
              message:
                'Intrinsic policy and state-machine files may only import sibling policy, machine, port, or resource files.',
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
    files: ['modules/**/*.usecase.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)',
              message:
                'Usecases cannot import database, HTTP, or UI mechanisms.',
            },
            {
              regex:
                '^\\.(?!/?[^/]+\\.(?:usecase|policy|machine|port|error)(?:\\.(?:ts|js))?$).*',
              message:
                'Usecases may only import sibling usecases, policies, state machines, ports, or errors.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.port.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '.*',
              allowTypeImports: true,
              message: 'Ports may only import types.',
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
    files: [
      'modules/business/**/*.port.ts',
      'modules/computation/**/*.port.ts',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)',
              message:
                'Business and computation ports cannot expose database, HTTP, or UI mechanism types.',
            },
            {
              regex:
                '^(?!(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)).*',
              allowTypeImports: true,
              message: 'Ports may only import types.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/policy/access-control/src/auth.port.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '.*',
              allowTypeImports: true,
              message:
                'The access-control auth port may expose HTTP types but still cannot import runtime mechanisms.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.error.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)',
              message:
                'Error mapping files cannot import database, HTTP, or UI mechanisms.',
            },
            {
              regex:
                '^\\.(?!/?[^/]+\\.(?:policy|machine|error)(?:\\.(?:ts|js))?$).*',
              message:
                'Error mapping files may only import sibling policy, state-machine, or error files.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.route.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:drizzle-orm(?:/.*)?$|@pressly/db(?:/.*)?$)',
              message: 'Routes cannot import persistence mechanisms.',
            },
            {
              regex:
                '^\\.(?!/?[^/]+\\.(?:usecase|controller|middleware)(?:\\.(?:ts|js))?$).*',
              message:
                'Routes may only import sibling usecases, controllers, or middleware.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/*/*/src/main.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!express$|@pressly\\/|\\.).*',
              message:
                'Module main files may only import packages from express or @pressly/*.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.controller.ts', 'modules/**/*.middleware.ts'],
    ignores: ['modules/business/auth/src/http/**/*.middleware.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:drizzle-orm(?:/.*)?$|@pressly/db(?:/.*)?$)',
              message:
                'Controllers and middleware cannot import persistence mechanisms.',
            },
            {
              regex:
                '^\\.(?!/[^/]+\\.(?:usecase|port|error)(?:\\.(?:ts|js))?$|\\./http/[^/]+(?:\\.(?:ts|js))?$).*',
              message:
                'Controllers and middleware may only import sibling usecase, port, or error files, plus the explicit HTTP foundation.',
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
    files: ['modules/policy/**/*.guard.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:drizzle-orm(?:/.*)?$|@pressly/db(?:/.*)?$)',
              message: 'Policy guards cannot import persistence mechanisms.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.repo.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:express$|@pressly/http(?:/.*)?$|next(?:/.*)?$)',
              message: 'Repositories cannot import HTTP or UI mechanisms.',
            },
            {
              regex:
                '^\\.(?!.*\\.(?:port|policy|mapper)(?:\\.(?:ts|js))?$|\\./persistence/[^/]+(?:\\.(?:ts|js))?$).*',
              message:
                'Repositories may only import sibling ports or policies, plus the explicit persistence foundation.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/business/auth/src/http/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:drizzle-orm(?:/.*)?$|@pressly/db(?:/.*)?$)',
              message:
                'The auth HTTP foundation cannot import persistence mechanisms.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/business/auth/src/persistence/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:express$|@pressly/http(?:/.*)?$)',
              message:
                'The auth persistence foundation cannot import HTTP mechanisms.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/**/*.computation.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^(?:express$|drizzle-orm(?:/.*)?$|@pressly/(?:db|http)(?:/.*)?$|next(?:/.*)?$|react(?:/.*)?$)',
              message:
                'Computation files must remain deterministic and mechanism-free.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['modules/*/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'architecture/module-capability-imports': 'error',
    },
  },

  {
    files: [
      'modules/*/*/src/features/**/*.{ts,tsx}',
      'modules/*/*/src/adapters/**/*.{ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Module source is capability-first. Move this file into its owning top-level capability.',
    ),
  },

  {
    files: [
      'modules/*/*/src/**/common/**/*.{ts,tsx}',
      'modules/*/*/src/**/shared/**/*.{ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Module-local common/shared folders are forbidden. Name the capability or use an explicit technical foundation.',
    ),
  },

  {
    files: [
      'modules/*/*/src/**/*.{schema,parser,test,spec}.{js,jsx,mjs,cjs,ts,tsx}',
      'modules/*/*/src/**/__tests__/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Module src cannot contain tests, schemas, or parsers. Keep tests under test/, runtime schemas in @pressly/contracts, and parsing at the application adapter boundary.',
    ),
  },

  {
    files: ['modules/*/*/src/**/*.{js,jsx,mjs,cjs,tsx}'],
    rules: restrictedFileNameRule(
      'Module source files must use the .ts extension.',
    ),
  },

  {
    files: ['modules/business/*/src/**/*.ts'],
    ignores: [
      'modules/business/*/src/main.ts',
      'modules/business/*/src/public.ts',
      'modules/business/*/src/http/**/*.ts',
      'modules/business/*/src/persistence/**/*.ts',
      businessModuleSourceRolePattern,
    ],
    rules: restrictedFileNameRule(
      `Business capability files must use one of these architectural role suffixes: ${businessModuleSourceRoleSuffixes
        .map((suffix) => `*.${suffix}.ts`)
        .join(
          ', ',
        )}. Descriptive filenames are reserved for explicit http/ and persistence/ foundations.`,
    ),
  },

  {
    files: ['apps/web/src/common/core/**/*.{ts,tsx}'],
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
    files: ['apps/web/src/components/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?:@pressly/|next(?:/.*)?$)',
              message:
                'UI primitives cannot depend on application, protocol, or server capabilities.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'architecture/web-zone-imports': 'error',
      'architecture/web-private-route-imports': 'error',
    },
  },

  {
    files: [
      'apps/web/src/app/shared/**/*.{ts,tsx}',
      'apps/web/src/infra/**/*.{ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Web code is feature-oriented. Use a product feature, a bounded route-private folder, or common technical infrastructure.',
    ),
  },

  prettier,
);
