import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import path from 'node:path';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { makeArchitectureEslintPlugin } from './tooling/architecture/architecture-eslint.plugin.ts';
import { presslyRepositoryRoot } from './tooling/architecture/architecture-discovery.ts';
import { presslyModuleArchitecture } from './tooling/architecture/pressly-module-architecture.ts';

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

const moduleGroupExpression = presslyModuleArchitecture.groupNames.join('|');
const moduleOwnerRootPattern = new RegExp(
  `^(.*\\/modules\\/(?:${moduleGroupExpression})\\/[^/]+)\\/src(?:\\/|$)`,
);

const modulePackageNames = new Set(
  presslyModuleArchitecture.modulePackageNames,
);

const moduleArchitectureV2Plugin = makeArchitectureEslintPlugin({
  architecture: presslyModuleArchitecture,
  repositoryRoot: presslyRepositoryRoot,
});

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

export const architecturePlugin = {
  rules: {
    ...moduleArchitectureV2Plugin.rules,
    'explicit-package-boundaries': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Require explicit Contracts, DB, and Errors package subpaths at every dependency boundary.',
        },
        schema: [],
        messages: {
          packageRoot:
            'Import "{{target}}" through an explicit public subpath; its package root is intentionally not exported.',
        },
      },
      create(context) {
        const forbiddenRoots = new Set([
          '@pressly/contracts',
          '@pressly/db',
          '@pressly/errors',
        ]);
        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined || !forbiddenRoots.has(specifier)) return;

          context.report({
            node,
            messageId: 'packageRoot',
            data: { target: specifier },
          });
        };

        return importVisitors(checkImport);
      },
    },
    'module-isolation': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Keep modules isolated peers; only application composition roots may connect them.',
        },
        schema: [],
        messages: {
          moduleDependency:
            'Module source cannot import sibling module package "{{target}}". Inject its public application surface from an app composition root.',
          outsideModule:
            'Module source cannot import another module by relative path. Inject its public application surface from an app composition root.',
        },
      },
      create(context) {
        const filename = path
          .resolve(context.filename)
          .replaceAll(path.sep, '/');
        const match = filename.match(moduleOwnerRootPattern);

        if (match === null) return {};

        const ownerRoot = match[1];
        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined) return;

          const moduleDependency = [...modulePackageNames].find(
            (name) => specifier === name || specifier.startsWith(`${name}/`),
          );

          if (moduleDependency !== undefined) {
            context.report({
              node,
              messageId: 'moduleDependency',
              data: { target: moduleDependency },
            });
            return;
          }

          if (!specifier.startsWith('.')) return;

          const target = path
            .resolve(path.dirname(filename), specifier)
            .replaceAll(path.sep, '/');

          if (!isPathInside(target, ownerRoot))
            context.report({ node, messageId: 'outsideModule' });
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

    'processor-zone-imports': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Enforce dependency direction between processor composition, feature, port, adapter, and UI zones.',
        },
        schema: [],
        messages: {
          zoneDependency: '{{reason}} Imported processor path: "{{target}}".',
        },
      },
      create(context) {
        const filename = path.resolve(context.filename);
        const normalizedFilename = filename.replaceAll(path.sep, '/');
        const srcMarker = '/apps/processor/src/';
        const srcIndex = normalizedFilename.indexOf(srcMarker);

        if (srcIndex === -1) return {};

        const srcRoot = normalizedFilename
          .slice(0, srcIndex + srcMarker.length)
          .replace(/\/$/, '');
        const sourceRelative = normalizedFilename.slice(srcRoot.length + 1);
        const inZone = (relativePath, zone) =>
          relativePath === zone || relativePath.startsWith(`${zone}/`);
        const featureName = (relativePath) =>
          inZone(relativePath, 'features')
            ? relativePath.slice('features/'.length).split('/')[0]
            : undefined;

        const checkImport = (node) => {
          const specifier = importSpecifier(node);

          if (specifier === undefined) return;

          let target;

          if (specifier.startsWith('@/'))
            target = path.resolve(srcRoot, specifier.slice(2));
          else if (specifier.startsWith('.'))
            target = path.resolve(path.dirname(filename), specifier);
          else return;

          const normalizedTarget = target.replaceAll(path.sep, '/');

          if (!isPathInside(normalizedTarget, srcRoot)) return;

          const targetRelative = normalizedTarget.slice(srcRoot.length + 1);
          let reason;

          if (inZone(sourceRelative, 'ports')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'adapters') ||
              inZone(targetRelative, 'features') ||
              inZone(targetRelative, 'components')
            )
              reason =
                'Processor ports are framework-free inward contracts and cannot depend on composition, adapters, features, or UI.';
          } else if (inZone(sourceRelative, 'adapters')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'features') ||
              inZone(targetRelative, 'components')
            )
              reason =
                'Processor adapters implement ports and cannot depend on app composition, product features, or UI.';
          } else if (inZone(sourceRelative, 'features')) {
            if (inZone(targetRelative, 'app'))
              reason =
                'Processor features cannot import the app composition root.';
            else if (inZone(targetRelative, 'adapters'))
              reason =
                'Processor features cannot select concrete adapters; receive ports from app composition.';
            else if (
              inZone(targetRelative, 'features') &&
              featureName(sourceRelative) !== featureName(targetRelative)
            )
              reason =
                'Processor feature slices cannot import peer features; compose them in app.';
          } else if (inZone(sourceRelative, 'components/ui')) {
            const targetWithoutExtension = targetRelative.replace(
              /\.[jt]sx?$/,
              '',
            );

            if (!inZone(targetWithoutExtension, 'components/ui'))
              reason =
                'Processor UI primitives may only import other UI primitives.';
          } else if (inZone(sourceRelative, 'components/layout')) {
            if (
              inZone(targetRelative, 'app') ||
              inZone(targetRelative, 'adapters') ||
              inZone(targetRelative, 'features') ||
              inZone(targetRelative, 'ports')
            )
              reason =
                'Processor layout primitives cannot depend on app composition, adapters, product features, or protocols.';
          } else if (sourceRelative === 'main.tsx') {
            if (
              targetRelative !== 'index.css' &&
              !inZone(targetRelative, 'app')
            )
              reason =
                'The Vite entrypoint may only load global CSS and invoke the app composition root.';
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
    rules: {
      'architecture/explicit-package-boundaries': 'error',
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
      'architecture/explicit-package-boundaries': 'error',
      'architecture/symbol-ownership': 'error',
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
      'architecture/module-isolation': 'error',
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
    files: [
      'apps/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'modules/*/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'packages/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    rules: {
      'architecture/qualified-mapper-role': 'error',
    },
  },

  {
    files: [
      'apps/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
      'packages/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}',
    ],
    ignores: ['packages/errors/src/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'architecture/owned-throwable': 'error',
    },
  },

  {
    files: [
      'apps/api/src/http/control/**/*.{ts,tsx}',
      'apps/control/src/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@pressly/contracts$',
              message:
                'Control surfaces must import the explicit Auth, Users, or Orders contract boundary instead of the package root.',
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
    files: ['modules/*/*/src/{main,public}.ts'],
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
    files: [
      'modules/security/identity/src/foundations/adapters/http/authentication-request/**/*.{ts,tsx}',
    ],
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
    files: [
      'modules/security/identity/src/foundations/adapters/postgres/identity-store/**/*.{ts,tsx}',
    ],
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
    files: ['modules/*/*/src/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    rules: {
      'architecture/module-v2-file-role': 'error',
      'architecture/module-v2-dependencies': 'error',
      'architecture/module-v2-failure-boundary': 'error',
      'architecture/module-v2-pure-role': 'error',
      'architecture/module-v2-port-shape': 'error',
      'architecture/module-v2-semantic-role': 'error',
      'architecture/module-v2-usecase-shape': 'error',
      'architecture/module-public-surface': 'error',
    },
  },

  {
    files: ['modules/*/*/src/*.{js,jsx,mjs,cjs,ts,tsx}'],
    ignores: ['modules/*/*/src/main.ts', 'modules/*/*/src/public.ts'],
    rules: restrictedFileNameRule(
      'Module src roots are sealed. Only main.ts and public.ts may be root files; move this file into its owning feature, foundation, or composition zone.',
    ),
  },

  {
    files: [
      'modules/*/*/src/**/common/**/*.{ts,tsx}',
      'modules/*/*/src/**/shared/**/*.{ts,tsx}',
    ],
    rules: restrictedFileNameRule(
      'Module-local common/shared folders are forbidden. Name the owning feature or use an explicit foundation.',
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
