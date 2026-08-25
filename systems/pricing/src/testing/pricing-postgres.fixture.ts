import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariantViolationError } from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, sql } from '@pressly/postgres/query';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import type { CommitPricingChangeInput } from '../cells/pricebook/publish-pricing-change/types.ts';
import { makePricingSchema } from '../schema/pricing.ts';
import { makePricingSystem } from '../system.ts';

export const pricingPostgresSchema = makePricingSchema();

const tableNames = [
  'pricing_change_events',
  'pricing_items',
  'pricing_sets',
  'pricing_services',
] as const;

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_PRICING_SYSTEM_TEST_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName = `pressly_pricing_system_native_test_${process.pid}_${Date.now().toString(36)}`;
const databaseUrl = (() => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
})();

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const dropDatabase = (): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    databaseName,
  ]);
};

const createDatabase = (): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    databaseName,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: 'test',
  });
};

const databaseExists = (): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${databaseName}'`,
  ]).trim() === databaseName;

export const pricingPostgresDatabase = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl: databaseUrl,
  tableNames,
  maxConnections: 4,
});

export const pricingPublishedAt = new Date('2026-05-21T12:00:00.000Z');
export const pricingAuthor = {
  id: 'user_1',
  kind: 'human',
  displayName: 'steven',
} as const;

const removeAuditFault = async (db: PostgresDatabase): Promise<void> => {
  await db.execute(
    sql`drop trigger if exists pricing_audit_fault on pricing_change_events`,
  );
  await db.execute(sql`drop function if exists pricing_reject_audit_insert()`);
};

export const registerPricingPostgresLifecycle = (): void => {
  beforeAll(async () => {
    dropDatabase();
    createDatabase();
    await pricingPostgresDatabase.check();
  });
  beforeEach(async () => {
    await removeAuditFault(pricingPostgresDatabase.db);
    await pricingPostgresDatabase.reset();
  });
  afterAll(async () => {
    await removeAuditFault(pricingPostgresDatabase.db);
    await pricingPostgresDatabase.close();
    dropDatabase();
    expect(databaseExists()).toBe(false);
  });
};

export const seedPricing = async (
  input: Readonly<{
    items?: readonly Readonly<{
      code: string;
      name: string;
      priceCents: number;
      sortOrder: number;
    }>[];
  }> = {},
) => {
  const [service] = await pricingPostgresDatabase.db
    .insert(pricingPostgresSchema.pricingServices)
    .values({
      slug: 'wash-fold',
      kind: 'wash_fold',
      label: 'Wash & Fold',
      isActive: true,
      createdAt: pricingPublishedAt,
      updatedAt: pricingPublishedAt,
    })
    .returning();
  if (service === undefined)
    throw invariantViolationError({
      code: 'pricing_test_service_missing',
      message: 'The Pricing test service was not inserted.',
    });
  const [set] = await pricingPostgresDatabase.db
    .insert(pricingPostgresSchema.pricingSets)
    .values({
      serviceId: service.id,
      status: 'active',
      currency: 'USD',
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      createdAt: pricingPublishedAt,
      updatedAt: pricingPublishedAt,
    })
    .returning();
  if (set === undefined)
    throw invariantViolationError({
      code: 'pricing_test_set_missing',
      message: 'The Pricing test set was not inserted.',
    });
  const items = input.items ?? [
    {
      code: 'delivery_fee',
      name: 'Delivery Fee',
      priceCents: 495,
      sortOrder: 30,
    },
    { code: 'hang_dry', name: 'Hang Dry', priceCents: 295, sortOrder: 40 },
  ];
  if (items.length > 0)
    await pricingPostgresDatabase.db
      .insert(pricingPostgresSchema.pricingItems)
      .values(
        items.map((item) => ({
          pricingSetId: set.id,
          code: item.code,
          service: 'wash_fold',
          category: item.code === 'delivery_fee' ? 'Fee' : 'Other Services',
          name: item.name,
          unit: item.code === 'delivery_fee' ? 'order' : 'item',
          priceCents: item.priceCents,
          sortOrder: item.sortOrder,
          metadata: {},
          createdAt: pricingPublishedAt,
          updatedAt: pricingPublishedAt,
        })),
      );
  return { service, set };
};

export const pricingPublishCommand = {
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  requestedBy: pricingAuthor,
  items: [{ code: 'delivery_fee', priceCents: 100 }],
} as const;

export const pricingCommitInput = (
  oldPricingSetId: string,
): CommitPricingChangeInput => ({
  command: pricingPublishCommand,
  publishedAt: pricingPublishedAt,
  plan: {
    serviceSlug: 'wash-fold',
    reason: 'Update delivery fee',
    oldPricingSetId,
    currency: 'USD',
    changes: [
      {
        code: 'delivery_fee',
        name: 'Delivery Fee',
        oldPriceCents: 495,
        newPriceCents: 100,
      },
    ],
  },
});

export const loadPricingDurableState = async () => ({
  sets: await pricingPostgresDatabase.db
    .select()
    .from(pricingPostgresSchema.pricingSets)
    .orderBy(
      asc(pricingPostgresSchema.pricingSets.createdAt),
      asc(pricingPostgresSchema.pricingSets.id),
    ),
  items: await pricingPostgresDatabase.db
    .select()
    .from(pricingPostgresSchema.pricingItems)
    .orderBy(
      asc(pricingPostgresSchema.pricingItems.sortOrder),
      asc(pricingPostgresSchema.pricingItems.id),
    ),
  events: await pricingPostgresDatabase.db
    .select()
    .from(pricingPostgresSchema.pricingChangeEvents)
    .orderBy(asc(pricingPostgresSchema.pricingChangeEvents.createdAt)),
});

export const makePricingPostgresSystem = () =>
  makePricingSystem({
    db: pricingPostgresDatabase.db,
    schema: pricingPostgresSchema,
    clock: { now: () => pricingPublishedAt },
  });
