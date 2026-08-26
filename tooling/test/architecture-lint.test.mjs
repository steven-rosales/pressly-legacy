import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: repositoryRoot });

const lint = async (relativePath, source) => {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(repositoryRoot, relativePath),
  });

  return result.messages.filter((message) => message.severity === 2);
};

const ruleIds = (messages) => messages.map((message) => message.ruleId);

describe('repository language lint', () => {
  it('keeps type-aware promise and union exhaustiveness checks in the root lint gate', async () => {
    const manifest = JSON.parse(
      await import('node:fs/promises').then(({ readFile }) =>
        readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
      ),
    );
    const typeAwareConfig =
      await import('../../tooling/eslint/type-aware.config.mjs').then(
        ({ default: configuration }) => configuration,
      );
    const typeAwareRunner = await import('node:fs/promises').then(
      ({ readFile }) =>
        readFile(
          path.join(repositoryRoot, 'tooling/eslint/run-type-aware.mjs'),
          'utf8',
        ),
    );
    const typeAwareRules = typeAwareConfig.flatMap((entry) =>
      Object.entries(entry.rules ?? {}),
    );

    expect(manifest.scripts.lint).toContain('pnpm lint:type-aware');
    expect(manifest.scripts['lint:type-aware']).toContain(
      'tooling/eslint/run-type-aware.mjs',
    );
    expect(typeAwareRunner).toContain('tooling/eslint/type-aware.config.mjs');
    expect(typeAwareRules).toEqual(
      expect.arrayContaining([
        [
          '@typescript-eslint/no-floating-promises',
          ['error', { ignoreVoid: true }],
        ],
        ['@typescript-eslint/switch-exhaustiveness-check', 'error'],
      ]),
    );
  });

  it('keeps host source free of business imports and topology domain identities', async () => {
    expect(
      ruleIds(
        await lint(
          'hosts/jobs/src/domain-import.fixture.ts',
          `import { makeOrdersSystem } from '@pressly/orders-system'; export const assemble = makeOrdersSystem;`,
        ),
      ),
    ).toContain('no-restricted-imports');

    for (const value of [
      'control-cookie-session',
      'order_outbox',
      'production.apply-fulfillment-demand.v1',
      'bootstrap-owner',
      '00000000-0000-4000-8000-000000000100',
    ])
      expect(
        ruleIds(
          await lint(
            'hosts/jobs/src/domain-literal.fixture.ts',
            `export const selected = ${JSON.stringify(value)};`,
          ),
        ),
      ).toContain('pressly-language/host-domain-neutrality');

    expect(
      await lint(
        'hosts/jobs/src/topology-selection.fixture.ts',
        `import { observabilityOperationIdForJobLabel } from '@pressly/topology/observability'; export const select = (label: string) => observabilityOperationIdForJobLabel(label);`,
      ),
    ).toEqual([]);
  });

  it('keeps ambient browser, process, clock, and random effects out of live Experience source', async () => {
    for (const source of [
      `export const read = () => window.location.href;`,
      `export const read = () => document.documentElement.lang;`,
      `export const request = () => globalThis.fetch('/api');`,
      `export const later = () => setTimeout(() => undefined, 0);`,
    ])
      expect(
        ruleIds(
          await lint(
            'experiences/control/src/features/example/effect.fixture.ts',
            source,
          ),
        ),
      ).toContain('no-restricted-globals');

    for (const source of [
      `export const now = () => Date.now();`,
      `export const today = () => new Date();`,
      `export const random = () => Math.random();`,
      `export const api = import.meta.env.VITE_API_URL;`,
    ])
      expect(
        ruleIds(
          await lint(
            'experiences/processor/src/features/example/effect.fixture.ts',
            source,
          ),
        ),
      ).toContain('pressly-language/experience-effect-ownership');

    expect(
      await lint(
        'experiences/processor/src/features/example/injected.fixture.ts',
        `
          export const observe = (
            browser: { now: () => Date; schedule: (run: () => void) => () => void },
            window: string,
          ) => ({ at: browser.now(), parsed: new Date(window), cancel: browser.schedule(() => undefined) });
          export const protocol = 'json-document';
        `,
      ),
    ).toEqual([]);
  });

  it('requires explicit package subpaths for static and dynamic dependencies', async () => {
    for (const source of [
      `import '@pressly/contracts';`,
      `export { value } from '@pressly/postgres';`,
      `export * from '@pressly/errors';`,
    ])
      expect(
        ruleIds(await lint('hosts/http/src/package-root.fixture.ts', source)),
      ).toContain('no-restricted-imports');

    expect(
      ruleIds(
        await lint(
          'hosts/http/src/package-root.fixture.ts',
          `export const loadErrors = () => import('@pressly/errors');`,
        ),
      ),
    ).toContain('no-restricted-syntax');

    expect(
      await lint(
        'hosts/http/src/package-subpath.fixture.ts',
        `
          import { unexpectedError } from '@pressly/errors/factories';
          import type { PostgresRuntime } from '@pressly/postgres/client';
          export const makeFailure = (database: PostgresRuntime) =>
            database === undefined
              ? unexpectedError({ code: 'missing_database', message: 'Missing database.' })
              : null;
        `,
      ),
    ).toEqual([]);
  });

  it('keeps Experiences on explicit System capabilities and contracts', async () => {
    expect(
      ruleIds(
        await lint(
          'experiences/control/src/system-root.fixture.ts',
          `import type { AccessSystem } from '@pressly/access-system'; export type Input = AccessSystem;`,
        ),
      ),
    ).toContain('no-restricted-imports');

    expect(
      await lint(
        'experiences/control/src/system-capability.fixture.ts',
        `import type { AccessExperienceOperations } from '@pressly/access-system/capabilities/experience-access-v1'; export type Input = keyof AccessExperienceOperations;`,
      ),
    ).toEqual([]);
  });

  it('keeps verification and peer owners off aggregate business-owner roots', async () => {
    for (const [filePath, source] of [
      [
        'verification/orders/test/aggregate-root.fixture.ts',
        `import { makeOrdersSystem } from '@pressly/orders-system'; export const target = makeOrdersSystem;`,
      ],
      [
        'systems/production/src/testing/aggregate-root.fixture.ts',
        `import type { OrdersSystem } from '@pressly/orders-system'; export type Target = OrdersSystem;`,
      ],
      [
        'experiences/control/src/testing/aggregate-root.fixture.ts',
        `import type { CustomerExperience } from '@pressly/experience-customer'; export type Target = CustomerExperience;`,
      ],
    ])
      expect(ruleIds(await lint(filePath, source))).toContain(
        'no-restricted-imports',
      );

    expect(
      await lint(
        'verification/orders/test/exact-operation.fixture.ts',
        `import type { CreateOrderCommand } from '@pressly/orders-system/operations/lifecycle/create-order/types'; export type Target = CreateOrderCommand;`,
      ),
    ).toEqual([]);
  });

  it('keeps Production tests and live source off peer-owner SQL schema', async () => {
    for (const source of [
      `import { pgTable } from 'drizzle-orm/pg-core'; export const business = pgTable('business_accounts', {});`,
      "import { sql } from 'drizzle-orm'; export const rows = sql`select * from order_fulfillments`;",
      `export const read = (productionTestSchema: { orders: unknown }) => productionTestSchema.orders;`,
      `export const read = (peer: { authIdentities: unknown }) => peer.authIdentities;`,
      `import { makeOrdersSchema } from '@pressly/orders-system/schema'; export const schema = makeOrdersSchema();`,
    ])
      expect(
        ruleIds(
          await lint(
            'systems/production/src/testing/peer-schema.fixture.ts',
            source,
          ),
        ),
      ).toContain('pressly-language/production-peer-schema-isolation');

    expect(
      await lint(
        'systems/production/src/schema/owner-schema.fixture.ts',
        `import { pgTable } from 'drizzle-orm/pg-core'; export const location = pgTable('production_locations', {});`,
      ),
    ).toEqual([]);

    expect(
      ruleIds(
        await lint(
          'verification/scheduling/test/support/peer-schema.fixture.ts',
          `import { presslyPostgresSchema } from '@pressly/topology/postgres-schema'; export const rows = presslyPostgresSchema.orderFulfillments;`,
        ),
      ),
    ).toContain('pressly-language/production-peer-schema-isolation');

    expect(
      await lint(
        'verification/scheduling/test/support/owner-schema.fixture.ts',
        `import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema'; export const rows = presslyPostgresOwnerSchemas.production.productionOrders;`,
      ),
    ).toEqual([]);
  });

  it('requires System test support to consume its owner schema factory', async () => {
    for (const source of [
      `import { pgTable } from 'drizzle-orm/pg-core'; export const business = pgTable('business_accounts', {});`,
      `import * as postgresSchema from 'drizzle-orm/pg-core'; export const business = postgresSchema.pgTable('business_accounts', {});`,
    ])
      expect(
        ruleIds(
          await lint('systems/customers/src/testing/schema.fixture.ts', source),
        ),
      ).toContain('pressly-language/system-testing-owner-schema');

    expect(
      await lint(
        'systems/customers/src/testing/schema.fixture.ts',
        `import { makeCustomersSchema } from '../schema/customers.ts'; export const customersTestSchema = makeCustomersSchema();`,
      ),
    ).toEqual([]);
  });

  it('delegates native throwable construction to Errors ownership', async () => {
    const messages = await lint(
      'hosts/http/src/native-throwable.fixture.ts',
      `
        export class RuntimeAbort extends Error {}
        export const fail = () => TypeError('invalid');
      `,
    );

    expect(ruleIds(messages)).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
    expect(
      await lint(
        'hosts/http/src/owned-throwable.fixture.ts',
        `
          import { unexpectedError } from '@pressly/errors/factories';
          export const fail = () => {
            throw unexpectedError({ code: 'failed', message: 'Failed.' });
          };
        `,
      ),
    ).toEqual([]);
  });

  it('requires qualified synchronous mappers', async () => {
    expect(
      ruleIds(
        await lint(
          'hosts/http/src/http/orders/order.mapper.ts',
          'export const mapOrder = (value: unknown) => value;',
        ),
      ),
    ).toContain('pressly-language/mapper-role');
    expect(
      ruleIds(
        await lint(
          'hosts/http/src/http/orders/order.contract.mapper.ts',
          'export const mapOrder = async (load: () => Promise<unknown>) => await load();',
        ),
      ),
    ).toContain('pressly-language/mapper-role');
    expect(
      await lint(
        'hosts/http/src/http/orders/order.contract.mapper.ts',
        'export const mapOrder = (value: unknown) => ({ value });',
      ),
    ).toEqual([]);
  });

  it('keeps expected failures as non-throwable data', async () => {
    const messages = await lint(
      'systems/pricing/src/cells/example/example.failure.ts',
      `
        import { conflictError } from '@pressly/errors/factories';
        export const reject = () => { throw conflictError({ code: 'conflict', message: 'Conflict.' }); };
      `,
    );

    expect(ruleIds(messages)).toEqual(
      expect.arrayContaining([
        '@typescript-eslint/no-restricted-imports',
        'no-restricted-syntax',
      ]),
    );
    expect(
      await lint(
        'systems/pricing/src/cells/example/example.failure.ts',
        `export type ExampleFailure = Readonly<{ kind: 'not_found' }>;`,
      ),
    ).toEqual([]);
  });

  it('keeps cell decisions synchronous and free of ambient effects', async () => {
    const messages = await lint(
      'systems/production/src/cells/example/example/decide.ts',
      `
        import { readFileSync } from 'node:fs';
        export const decide = async () => ({ now: Date.now(), value: readFileSync('/tmp/value') });
      `,
    );

    expect(ruleIds(messages)).toContain(
      '@typescript-eslint/no-restricted-imports',
    );
    expect(
      ruleIds(messages).filter((rule) => rule === 'no-restricted-syntax'),
    ).toHaveLength(2);
    expect(
      await lint(
        'systems/production/src/cells/example/example/decide.ts',
        `export const normalize = (value: string) => new Date(value).toISOString();`,
      ),
    ).toEqual([]);

    expect(
      ruleIds(
        await lint(
          'systems/production/src/cells/example/example/policy.ts',
          `export const decide = () => Date.now();`,
        ),
      ),
    ).toContain('no-restricted-syntax');
  });

  it('keeps sibling cell implementations private', async () => {
    expect(
      ruleIds(
        await lint(
          'systems/orders/src/cells/orders/create-order/execute.ts',
          `import { cancelOrder } from '../cancel-order/execute.ts'; export const createOrder = cancelOrder;`,
        ),
      ),
    ).toContain('pressly-language/cell-isolation');

    expect(
      await lint(
        'systems/orders/src/cells/orders/create-order/execute.ts',
        `
          import type { CreateOrderInput } from './contract.ts';
          import type { CanonicalOrder } from '../../../model/canonical-order/model.ts';
          export const createOrder = (input: CreateOrderInput, order: CanonicalOrder) => ({ input, order });
        `,
      ),
    ).toEqual([]);
  });

  it('keeps owner schema and persistence behind the local cell adapter', async () => {
    for (const source of [
      `import { store } from '../../../postgres/order/store.ts'; export const execute = store;`,
      `import type { PostgresDatabase } from '@pressly/postgres/client'; export type Input = PostgresDatabase;`,
    ])
      expect(
        ruleIds(
          await lint(
            'systems/orders/src/cells/orders/create-order/execute.ts',
            source,
          ),
        ),
      ).toContain('pressly-language/cell-isolation');

    expect(
      await lint(
        'systems/orders/src/cells/orders/create-order/cell.ts',
        `import type { OrdersSchema } from '../../../schema/orders.ts'; export type Input = Readonly<{ schema: OrdersSchema }>;`,
      ),
    ).toEqual([]);
  });

  it('rejects non-null assertions and coercion through unknown in live source', async () => {
    expect(
      ruleIds(
        await lint(
          'systems/production/src/cells/example/example/execute.ts',
          'export const first = (values: readonly string[]) => values[0]!;',
        ),
      ),
    ).toContain('pressly-language/no-non-null-assertion');
    expect(
      ruleIds(
        await lint(
          'systems/production/src/cells/example/example/idempotency.ts',
          'export const replay = (value: object) => value as unknown as { id: string };',
        ),
      ),
    ).toContain('pressly-language/no-double-unknown-assertion');
    expect(
      await lint(
        'systems/production/src/cells/example/example/execute.ts',
        `
          export const first = (values: readonly string[]) => {
            const [value] = values;
            return value === undefined ? null : value;
          };
        `,
      ),
    ).toEqual([]);
  });

  it('keeps entities free of application and persistence representation names', async () => {
    for (const declaration of [
      'export type PricingSummary = Readonly<{ id: string }>;',
      'export interface StoredPricebookRecord { id: string }',
    ])
      expect(
        ruleIds(
          await lint(
            'systems/pricing/src/model/pricing.entity.ts',
            declaration,
          ),
        ),
      ).toContain('no-restricted-syntax');

    expect(
      await lint(
        'systems/pricing/src/model/pricing.entity.ts',
        'export type Pricebook = Readonly<{ id: string }>;',
      ),
    ).toEqual([]);
  });

  it('keeps symbol ownership direct and target surfaces explicit', async () => {
    for (const source of [
      `export type { Pricebook } from './pricebook.ts';`,
      `import type { Pricebook } from './pricebook.ts'; export type { Pricebook };`,
      `import type { Pricebook } from './pricebook.ts'; export type PricingResult = Pricebook;`,
      `import { pricebook } from './pricebook.ts'; export const pricingResult = pricebook;`,
      `import * as Pricing from './pricebook.ts'; const pricingResult = Pricing.pricebook; export { pricingResult };`,
      `const pricebook = { id: 'one' }; const pricingResult = pricebook; export { pricingResult };`,
      `type Pricebook = Readonly<{ id: string }>; type PricingResult = Pricebook; export type { PricingResult };`,
      `interface Pricebook { id: string } interface PricingResult extends Pricebook {} export type { PricingResult };`,
      `type Pricebook = Readonly<{ id: string }>; export type PricingResult = Pricebook;`,
      `const pricebook = { id: 'one' }; export const pricingResult = pricebook;`,
      `interface Pricebook { id: string } export interface PricingResult extends Pricebook {}`,
    ])
      expect(
        ruleIds(await lint('systems/pricing/src/model/internal.ts', source)),
      ).toContain('pressly-language/symbol-ownership');

    expect(
      await lint(
        'systems/pricing/src/model/internal.ts',
        `import type { Pricebook } from './pricebook.ts'; export type PricingResult = Readonly<{ pricebook: Pricebook }>;`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        'systems/pricing/src/model/internal.ts',
        `type Pricebook = Readonly<{ id: string }>; export type OptionalPricebook = Pricebook | null; export type PricebookId = string & Readonly<{ __brand: 'PricebookId' }>;`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        'systems/pricing/src/public.ts',
        `export type { Pricebook } from './model/pricebook.ts';`,
      ),
    ).toEqual([]);

    for (const source of [
      `export * from './model/pricebook.ts';`,
      `export type { Pricebook as PricingRecord } from './model/pricebook.ts';`,
      `type Pricebook = Readonly<{ id: string }>; export type PricingRecord = Pricebook;`,
      `const pricebook = { id: 'one' }; export const pricingRecord = pricebook;`,
    ])
      expect(
        ruleIds(await lint('systems/pricing/src/public.ts', source)),
      ).toContain('pressly-language/symbol-ownership');

    for (const [filePath, source] of [
      [
        'hosts/browser/customer/src/app/schedule/page.tsx',
        `import { customerWeb } from '../../../customer-web.ts'; export const viewport = customerWeb.schedule.viewport;`,
      ],
      [
        'hosts/browser/customer/src/instrumentation-client.ts',
        `import * as Sentry from '@sentry/nextjs'; export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;`,
      ],
    ])
      expect(await lint(filePath, source)).toEqual([]);
  });

  it('allows the declared Drizzle tooling surface to flatten composed schema instances', async () => {
    expect(
      await lint(
        'topology/pressly-drizzle-schema.ts',
        `
          import { presslyPostgresSchema } from './pressly-postgres-schema.ts';
          export const { users, orders } = presslyPostgresSchema;
        `,
      ),
    ).toEqual([]);
  });
});
