import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
  defineRepository,
} from '../architecture/architecture-definition.factory.ts';
import { compileArchitecture } from '../architecture/architecture-compiler.ts';
import { makeArchitectureEslintPlugin } from '../architecture/architecture-eslint.plugin.ts';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const repository = defineRepository({
  name: 'eslint-fixture',
  moduleFamilies: ['business'],
  moduleRootFiles: ['main.ts', 'public.ts'],
  packageKinds: {},
  symbolSurfaces: ['apps/example/src/index.ts'],
});
const moduleDefinition = defineModule({
  id: 'business/pricing',
  packageName: '@example/pricing',
  features: defineNamespace({
    catalog: defineNamespace({
      'load-pricing': defineFeature.httpQuery({
        dependsOn: ['language/pricing'],
      }),
      'publish-pricing': defineFeature.headlessCommand(),
    }),
  }),
  foundations: {
    language: defineNamespace({
      pricing: defineFoundation.language(),
    }),
    ports: defineNamespace({
      catalog: defineFoundation.port({
        dependsOn: ['language/pricing'],
      }),
    }),
    adapters: defineNamespace({
      outbox: defineFoundation.adapter(),
    }),
  },
});
const architecture = compileArchitecture(repository, [moduleDefinition]);
const architecturePlugin = makeArchitectureEslintPlugin({
  architecture,
  repositoryRoot,
});
const linter = new Linter({ configType: 'flat', cwd: repositoryRoot });

const lint = (relativeFilePath, source) =>
  linter.verify(
    source,
    [
      {
        files: ['**/*.ts'],
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          parser: tseslint.parser,
        },
        plugins: { architecture: architecturePlugin },
        rules: {
          'architecture/module-v2-file-role': 'error',
          'architecture/module-v2-dependencies': 'error',
          'architecture/module-v2-failure-boundary': 'error',
          'architecture/module-v2-pure-role': 'error',
          'architecture/module-v2-port-shape': 'error',
          'architecture/module-v2-semantic-role': 'error',
          'architecture/symbol-ownership': 'error',
          'architecture/module-v2-usecase-shape': 'error',
          'architecture/module-public-surface': 'error',
          'architecture/qualified-mapper-role': 'error',
        },
      },
    ],
    {
      filename: path.join(
        repositoryRoot,
        'modules/business/pricing/src',
        relativeFilePath,
      ),
    },
  );

const ruleIds = (messages) => messages.map((message) => message.ruleId);

const lintOwnedThrowable = (source) =>
  linter.verify(
    source,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { architecture: architecturePlugin },
        rules: { 'architecture/owned-throwable': 'error' },
      },
    ],
    { filename: path.join(repositoryRoot, 'apps/api/src/example.ts') },
  );

const lintMapper = (relativeFilePath, source) =>
  linter.verify(
    source,
    [
      {
        files: ['**/*.ts'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { architecture: architecturePlugin },
        rules: { 'architecture/qualified-mapper-role': 'error' },
      },
    ],
    {
      filename: path.join(repositoryRoot, 'apps/api/src', relativeFilePath),
    },
  );

const lintSymbolOwnership = (relativeFilePath, source) =>
  linter.verify(
    source,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          parser: tseslint.parser,
        },
        plugins: { architecture: architecturePlugin },
        rules: { 'architecture/symbol-ownership': 'error' },
      },
    ],
    { filename: path.join(repositoryRoot, relativeFilePath) },
  );

describe('architecture compiler v2 ESLint adapter', () => {
  it('allows a v2 feature to import its explicitly declared foundation', () => {
    expect(
      lint(
        'features/catalog/load-pricing/load-pricing.usecase.ts',
        `import { pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export const makeLoadPricing = () => () => pricing;`,
      ),
    ).toEqual([]);
  });

  it('rejects sibling features and undeclared foundation dependencies', () => {
    const sibling = lint(
      'features/catalog/load-pricing/load-pricing.usecase.ts',
      `import { publish } from '../publish-pricing/publish-pricing.usecase.ts'; export const load = publish;`,
    );
    const undeclaredFoundation = lint(
      'features/catalog/publish-pricing/publish-pricing.usecase.ts',
      `import { pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export const publish = pricing;`,
    );

    expect(ruleIds(sibling)).toContain('architecture/module-v2-dependencies');
    expect(ruleIds(undeclaredFoundation)).toContain(
      'architecture/module-v2-dependencies',
    );
  });

  it('rejects module-internal symbol relays while preserving explicit root surfaces', () => {
    const directRelay = lint(
      'features/catalog/load-pricing/load-pricing.model.ts',
      `export type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts';`,
    );
    const importedRelay = lint(
      'features/catalog/load-pricing/load-pricing.model.ts',
      `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export type { Pricing };`,
    );
    const identityTypeAlias = lint(
      'features/catalog/load-pricing/load-pricing.model.ts',
      `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export type PricingResult = Pricing;`,
    );
    const identityValueAlias = lint(
      'features/catalog/load-pricing/load-pricing.model.ts',
      `import { pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export const pricingResult = pricing;`,
    );
    const emptyInterfaceAlias = lint(
      'features/catalog/load-pricing/load-pricing.model.ts',
      `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export interface PricingResult extends Pricing {}`,
    );

    for (const messages of [
      directRelay,
      importedRelay,
      identityTypeAlias,
      identityValueAlias,
      emptyInterfaceAlias,
    ])
      expect(ruleIds(messages)).toContain('architecture/symbol-ownership');

    expect(
      lint(
        'features/catalog/load-pricing/load-pricing.model.ts',
        `import type { Pricing } from '../../../foundations/language/pricing/pricing.model.ts'; export type PricingResult = Readonly<{ pricing: Pricing }>;`,
      ),
    ).toEqual([]);
    expect(
      lint(
        'public.ts',
        `export type { Pricing } from './foundations/language/pricing/pricing.model.ts';`,
      ),
    ).toEqual([]);
  });

  it('applies symbol ownership to app and package internals while preserving declared surfaces', () => {
    expect(
      ruleIds(
        lintSymbolOwnership(
          'apps/example/src/internal.ts',
          `import type { Result } from '@pressly/kernel'; export type ExampleResult = Result;`,
        ),
      ),
    ).toContain('architecture/symbol-ownership');
    expect(
      lintSymbolOwnership(
        'apps/example/src/index.ts',
        `export type { Example } from './example.ts';`,
      ),
    ).toEqual([]);
    expect(
      lintSymbolOwnership(
        'packages/time/src/index.ts',
        `export { systemClock } from './clock.ts';`,
      ),
    ).toEqual([]);
    expect(
      ruleIds(
        lintSymbolOwnership(
          'packages/time/src/new-york.ts',
          `import { instantFromUtcIso } from './convert.ts'; export const parseUtcIso = instantFromUtcIso;`,
        ),
      ),
    ).toContain('architecture/symbol-ownership');
    expect(
      lintSymbolOwnership(
        'apps/web/src/app/example/page.tsx',
        `import { pageMetadata } from './metadata.ts'; export const metadata = pageMetadata;`,
      ),
    ).toEqual([]);
  });

  it('rejects bare mappers and feature-local factories while allowing qualified mapper roles', () => {
    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/pricing.mapper.ts',
          'export const mapped = true;',
        ),
      ),
    ).toContain('architecture/module-v2-file-role');
    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/pricing.factory.ts',
          'export const definePricing = () => true;',
        ),
      ),
    ).toContain('architecture/module-v2-file-role');
    expect(
      lint(
        'features/catalog/load-pricing/pricing.contract.mapper.ts',
        'export const mapped = true;',
      ),
    ).toEqual([]);
  });

  it('requires qualified mapper names and keeps qualified mappers synchronous repo-wide', () => {
    expect(
      ruleIds(
        lintMapper(
          'http/orders/order.mapper.ts',
          'export const mapOrder = (value) => value;',
        ),
      ),
    ).toContain('architecture/qualified-mapper-role');
    expect(
      ruleIds(
        lintMapper(
          'http/orders/order.contract.mapper.ts',
          'export const mapOrder = async (load) => await load();',
        ),
      ),
    ).toContain('architecture/qualified-mapper-role');
    expect(
      lintMapper(
        'http/orders/order.contract.mapper.ts',
        'export const mapOrder = (value) => ({ ...value });',
      ),
    ).toEqual([]);
    expect(
      lintMapper(
        'http/orders/order.adapter.ts',
        'export const loadOrder = async (load) => await load();',
      ),
    ).toEqual([]);
  });

  it('allows earned foundation factories but keeps them pure', () => {
    expect(
      lint(
        'foundations/language/pricing/pricing.factory.ts',
        'export const definePricing = (value) => () => value;',
      ),
    ).toEqual([]);

    expect(
      ruleIds(
        lint(
          'foundations/language/pricing/pricing.factory.ts',
          'export const definePricing = () => Date.now();',
        ),
      ),
    ).toContain('architecture/module-v2-pure-role');
  });

  it('bans ambient effects from pure roles but allows deterministic Date conversion', () => {
    expect(
      ruleIds(
        lint(
          'foundations/language/pricing/pricing.policy.ts',
          'export const decide = () => Math.random();',
        ),
      ),
    ).toContain('architecture/module-v2-pure-role');
    expect(
      lint(
        'foundations/language/pricing/pricing.policy.ts',
        'export const normalize = (value) => new Date(value).toISOString();',
      ),
    ).toEqual([]);
  });

  it('keeps ports declaration-only', () => {
    expect(
      ruleIds(
        lint(
          'foundations/ports/catalog/catalog.port.ts',
          'export const loadCatalog = () => undefined;',
        ),
      ),
    ).toContain('architecture/module-v2-port-shape');
  });

  it('keeps expected failures as non-throwable data', () => {
    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/load-pricing.failure.ts',
          `import { conflictError } from '@pressly/errors/factories'; export const reject = () => { throw conflictError({ code: 'pricing_conflict', message: 'conflict' }); };`,
        ),
      ),
    ).toEqual(
      expect.arrayContaining([
        'architecture/module-v2-failure-boundary',
        'architecture/module-v2-failure-boundary',
      ]),
    );

    expect(
      lint(
        'features/catalog/load-pricing/load-pricing.failure.ts',
        `export const pricingNotFound = () => ({ code: 'pricing_not_found' });`,
      ),
    ).toEqual([]);
  });

  it('allows one exported use-case operation and its callable type', () => {
    expect(
      lint(
        'features/catalog/load-pricing/load-pricing.usecase.ts',
        `export type LoadPricing = (id: string) => Promise<string>; export const makeLoadPricing = (): LoadPricing => async (id) => id;`,
      ),
    ).toEqual([]);
  });

  it('allows type-only use-case exports alongside the constructor', () => {
    expect(
      lint(
        'features/catalog/load-pricing/load-pricing.usecase.ts',
        `export type LoadPricingInput = Readonly<{ id: string }>; export const makeLoadPricing = () => async (id: string) => id;`,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'constant',
      `export const pricingHash = 'hash'; export const makeLoadPricing = () => async () => pricingHash;`,
    ],
    [
      'helper function',
      `export function hashPricing(value: string) { return value; } export const makeLoadPricing = () => async () => hashPricing('pricing');`,
    ],
    [
      'runtime re-export',
      `export { pricingPolicy } from './load-pricing.policy.ts'; export const makeLoadPricing = () => async () => 'pricing';`,
    ],
    [
      'default export',
      `const loadPricing = () => 'pricing'; export default loadPricing; export const makeLoadPricing = () => async () => loadPricing();`,
    ],
  ])('rejects an additional %s from a use-case shell', (_label, source) => {
    expect(
      lint('features/catalog/load-pricing/load-pricing.usecase.ts', source).map(
        (message) => message.messageId,
      ),
    ).toContain('unexpectedRuntimeExport');
  });

  it('rejects multiple exported make operations in one use-case file', () => {
    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/load-pricing.usecase.ts',
          `export const makeLoadPricing = () => async () => 'loaded'; export const makePreviewPricing = () => async () => 'previewed';`,
        ),
      ),
    ).toContain('architecture/module-v2-usecase-shape');
  });

  it('rejects an exported multi-operation application facade', () => {
    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/load-pricing.usecase.ts',
          `export type PricingApplication = Readonly<{ list: () => Promise<string[]>; get: (id: string) => Promise<string> }>; export const makePricingApplication = (): PricingApplication => ({ list: async () => [], get: async (id) => id });`,
        ),
      ),
    ).toContain('architecture/module-v2-usecase-shape');
  });

  it('rejects anonymous native Error construction in v2 module source', () => {
    for (const throwable of [
      'AggregateError',
      'DOMException',
      'Error',
      'EvalError',
      'RangeError',
      'ReferenceError',
      'SyntaxError',
      'TypeError',
      'URIError',
    ]) {
      expect(
        ruleIds(
          lint(
            'features/catalog/load-pricing/load-pricing.usecase.ts',
            `export const load = () => { throw new ${throwable}('load failed'); };`,
          ),
        ),
      ).toContain('architecture/module-v2-failure-boundary');
    }

    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/load-pricing.usecase.ts',
          `class PricingAbort extends Error {}; export const load = () => { throw new PricingAbort(); };`,
        ),
      ),
    ).toContain('architecture/module-v2-failure-boundary');

    expect(
      ruleIds(
        lint(
          'features/catalog/load-pricing/load-pricing.usecase.ts',
          `export const load = () => TypeError('load failed');`,
        ),
      ),
    ).toContain('architecture/module-v2-failure-boundary');
  });

  it('keeps read and application shapes out of entity files', () => {
    expect(
      ruleIds(
        lint(
          'foundations/language/pricing/pricing.entity.ts',
          'export class PricingSummary {}',
        ),
      ),
    ).toContain('architecture/module-v2-semantic-role');
    expect(
      lint(
        'foundations/language/pricing/pricing.entity.ts',
        'export class Pricebook {}',
      ),
    ).toEqual([]);
    expect(
      ruleIds(
        lint(
          'foundations/language/pricing/pricing.entity.ts',
          'export class StoredPricebookRecord {}',
        ),
      ),
    ).toContain('architecture/module-v2-semantic-role');
  });

  it('requires app and package source to use the owned throwable factories', () => {
    expect(
      ruleIds(
        lintOwnedThrowable(
          `class RuntimeAbort extends Error {}; class BoundsAbort extends RangeError {}; throw new AggregateError([], 'failed'); TypeError('invalid');`,
        ),
      ),
    ).toEqual([
      'architecture/owned-throwable',
      'architecture/owned-throwable',
      'architecture/owned-throwable',
      'architecture/owned-throwable',
    ]);
    expect(
      lintOwnedThrowable(
        `import { unexpectedError } from '@pressly/errors/factories'; throw unexpectedError({ code: 'failed', message: 'failed' });`,
      ),
    ).toEqual([]);
  });

  it('allows composition roots to assemble persistence and HTTP mechanisms', () => {
    expect(
      lint(
        'composition/pricing.composition.ts',
        `import { createDatabaseRuntime } from '@pressly/db/client'; import { asyncRoute } from '@pressly/http/express'; export const compose = () => ({ createDatabaseRuntime, asyncRoute });`,
      ),
    ).toEqual([]);
  });

  it('allows a shared adapter foundation to map a durable wire contract', () => {
    expect(
      lint(
        'foundations/adapters/outbox/outbox.contract.mapper.ts',
        `import { eventSchema } from '@pressly/contracts/orders'; export const encode = (value) => eventSchema.parse(value);`,
      ),
    ).toEqual([]);
  });

  it('allows direct public policy exposure but rejects use-case construction reach-through', () => {
    expect(
      lint(
        'public.ts',
        `export { decidePricing } from './features/catalog/load-pricing/load-pricing.policy.ts';`,
      ),
    ).toEqual([]);
    expect(
      ruleIds(
        lint(
          'public.ts',
          `export { makeLoadPricing } from './features/catalog/load-pricing/load-pricing.usecase.ts';`,
        ),
      ),
    ).toContain('architecture/module-v2-dependencies');
  });

  it('requires explicit, canonical module public surfaces', () => {
    expect(
      lint(
        'public.ts',
        `export { makePricing } from './main.ts'; export type { Pricing } from './features/catalog/load-pricing/load-pricing.model.ts';`,
      ),
    ).toEqual([]);
    expect(ruleIds(lint('public.ts', `export * from './main.ts';`))).toContain(
      'architecture/module-public-surface',
    );
    expect(
      ruleIds(
        lint(
          'public.ts',
          `export type { Pricing as PricingRecord } from './features/catalog/load-pricing/load-pricing.model.ts';`,
        ),
      ),
    ).toContain('architecture/module-public-surface');
  });
});
