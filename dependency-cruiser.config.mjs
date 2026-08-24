/** @type {import('dependency-cruiser').IConfiguration} */

import { fileURLToPath } from 'node:url';

const dependencyCruiserSourceConfig = fileURLToPath(
  new URL(
    './tooling/typescript/dependency-cruiser.generated.json',
    import.meta.url,
  ),
);

const systemNames = [
  'access',
  'customers',
  'ingress',
  'orders',
  'pricing',
  'production',
];

const experienceNames = ['control', 'customer', 'processor'];

const testSourcePattern =
  '(?:^|/)(?:test|tests|__tests__|testing)(?:/|$)|[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$';

const peerInternalRules = systemNames.map((owner) => ({
  name: `no-${owner}-to-peer-internals`,
  severity: 'error',
  comment:
    'Systems collaborate through versioned public contracts, never peer runtime, model, cell, persistence, or schema files.',
  from: { path: `^systems/${owner}/` },
  to: {
    path: `^systems/(?!${owner}(?:/|$))[^/]+/`,
    pathNot: `^systems/[^/]+/(?:src/)?(?:capabilities|contracts)(?:/|$)`,
  },
}));

const peerAggregateRootRules = [
  ...systemNames.map((owner) => ({
    name: `no-${owner}-to-peer-aggregate-owner-roots`,
    severity: 'error',
    comment:
      'Systems consume exact peer contracts and capabilities, never aggregate owner roots.',
    from: { path: `^systems/${owner}/` },
    to: {
      path: `^(?:systems/(?!${owner}(?:/|$))[^/]+|experiences/[^/]+)/src/public[.]ts$`,
    },
  })),
  ...experienceNames.map((owner) => ({
    name: `no-experience-${owner}-to-peer-aggregate-owner-roots`,
    severity: 'error',
    comment:
      'Experiences consume exact peer contracts and capabilities, never aggregate owner roots.',
    from: { path: `^experiences/${owner}/` },
    to: {
      path: `^(?:systems/[^/]+|experiences/(?!${owner}(?:/|$))[^/]+)/src/public[.]ts$`,
    },
  })),
];

export default {
  forbidden: [
    {
      name: 'no-circular-runtime-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'workspace-imports-resolve-to-source',
      severity: 'error',
      comment:
        'Architecture edges must target checked source, never stale workspace build output.',
      from: {},
      to: {
        path: '^(?:hosts|systems|experiences|platform|topology|generated|verification)/(?:dist|dist-runtime)(?:/|$)',
      },
    },
    {
      name: 'hosts-are-domain-free',
      severity: 'error',
      from: { path: '^hosts/', pathNot: testSourcePattern },
      to: { path: '^(?:systems|experiences|topology|verification)/' },
    },
    {
      name: 'platform-has-no-business-knowledge',
      severity: 'error',
      from: { path: '^platform/' },
      to: {
        path: '^(?:systems|experiences|hosts|topology|generated|verification)/',
      },
    },
    {
      name: 'systems-do-not-depend-on-hosts-or-experiences',
      severity: 'error',
      from: { path: '^systems/' },
      to: {
        path: '^(?:hosts|experiences|topology|generated|verification)/',
      },
    },
    {
      name: 'experiences-use-system-public-surfaces',
      severity: 'error',
      from: { path: '^experiences/', pathNot: testSourcePattern },
      to: {
        path: '^systems/[^/]+/(?:src/)?(?:cells|model|schema)(?:/|$)',
        dependencyTypesNot: ['aliased-tsconfig-paths'],
      },
    },
    {
      name: 'experiences-do-not-depend-on-outer-roots',
      severity: 'error',
      from: { path: '^experiences/', pathNot: testSourcePattern },
      to: { path: '^(?:hosts|topology|generated|verification)/' },
    },
    {
      name: 'generated-code-does-not-depend-on-outer-runtime-roots',
      severity: 'error',
      from: { path: '^generated/', pathNot: '^generated/runtime/' },
      to: { path: '^(?:hosts|topology|verification)/' },
    },
    {
      name: 'generated-runtime-does-not-depend-on-hosts-or-verification',
      severity: 'error',
      from: { path: '^generated/runtime/' },
      to: { path: '^(?:hosts|verification)/' },
    },
    {
      name: 'production-code-does-not-depend-on-verification',
      severity: 'error',
      from: {
        path: '^(?:hosts|systems|experiences|platform|topology|generated)/',
      },
      to: { path: '^verification/' },
    },
    {
      name: 'verification-does-not-import-aggregate-owner-roots',
      severity: 'error',
      comment:
        'Verification imports exact operation, contract, capability, or testing surfaces instead of aggregate owner roots.',
      from: { path: '^verification/' },
      to: {
        path: '^(?:systems|experiences)/[^/]+/src/public[.]ts$',
      },
    },
    {
      name: 'production-source-does-not-import-tests',
      severity: 'error',
      from: {
        path: '^(?:hosts|systems|experiences|platform|topology|generated)/',
        pathNot: testSourcePattern,
      },
      to: {
        path: '(?:^|/)(?:test|tests|__tests__)(?:/|$)|[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$',
      },
    },
    {
      name: 'pure-decisions-have-no-node-effects',
      severity: 'error',
      from: {
        path: '^systems/.+/cells/.+/(?:decide|decision)[.](?:ts|tsx)$',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
    {
      name: 'pure-decisions-have-no-mechanism-effects',
      severity: 'error',
      from: {
        path: '^systems/.+/cells/.+/(?:decide|decision)[.](?:ts|tsx)$',
      },
      to: {
        path: '^platform/(?:auth|jobs|postgres)/',
      },
    },
    ...peerInternalRules,
    ...peerAggregateRootRules,
  ],
  options: {
    combinedDependencies: true,
    exclude:
      '(?:^|/)(?:dist|dist-runtime|build|coverage|[.]next|[.]turbo)(?:/|$)',
    doNotFollow: {
      path: [
        'node_modules',
        '(?:^|/)(?:dist|dist-runtime|build|coverage|\\.next|\\.turbo)(?:/|$)',
      ],
    },
    moduleSystems: ['cjs', 'es6'],
    extraExtensionsToScan: ['.css'],
    enhancedResolveOptions: {
      conditionNames: ['types', 'import', 'require', 'node', 'default'],
    },
    tsConfig: {
      fileName: dependencyCruiserSourceConfig,
    },
    tsPreCompilationDeps: 'specify',
  },
};
