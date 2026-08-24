import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  makePricingSystem,
  type PricingSystem,
} from '@pressly/pricing-system/testing/assembly';
import type { PricingChangeCommand } from '@pressly/pricing-system/models/pricing-change';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_PRICING_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const targetDatabaseName =
  process.env['PRESSLY_PRICING_CONFORMANCE_TARGET_DATABASE_NAME'] ??
  `pressly_pricing_target_conformance_test_${process.pid}_${Date.now().toString(36)}`;
const tableNames = [
  'pricing_change_events',
  'pricing_items',
  'pricing_sets',
  'pricing_services',
] as const;

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

const dropDatabase = (name: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    name,
  ]);
};

const createDatabase = (name: string): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    name,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'test',
  });
};

const databaseExists = (name: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${name}'`,
  ]).trim() === name;

type ConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

const makeDatabase = (name: string): ConformanceDatabase =>
  Object.freeze({
    name,
    url: databaseUrl(name),
    ...createTestDatabaseRuntime({
      databaseUrl: databaseUrl(name),
      tableNames,
      maxConnections: 4,
    }),
  });

const targetDatabase = makeDatabase(targetDatabaseName);
const publishedAt = new Date('2026-05-21T12:00:00.000Z');
const serviceId = '81000000-0000-4000-8000-000000000001';
const initialSetId = '82000000-0000-4000-8000-000000000001';
const author = {
  id: 'user_1',
  kind: 'human',
  displayName: 'steven',
} as const;
const change: PricingChangeCommand = {
  serviceSlug: 'wash-fold',
  reason: 'Update delivery fee',
  requestedBy: author,
  items: [{ code: 'delivery_fee', priceCents: 100 }],
};

const setupDatabase = async (database: ConformanceDatabase): Promise<void> => {
  dropDatabase(database.name);
  createDatabase(database.name);
  await database.check();
};

const removeFault = async (database: PostgresDatabase): Promise<void> => {
  await database.execute(
    sql`drop trigger if exists pricing_audit_fault on pricing_change_events`,
  );
  await database.execute(
    sql`drop function if exists pricing_reject_audit_insert()`,
  );
};

const seed = async (database: PostgresDatabase): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.pricing.pricingServices)
    .values({
      id: serviceId,
      slug: 'wash-fold',
      kind: 'wash_fold',
      label: 'Wash & Fold',
      isActive: true,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.pricing.pricingSets)
    .values({
      id: initialSetId,
      serviceId,
      status: 'active',
      currency: 'USD',
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      createdAt: publishedAt,
      updatedAt: publishedAt,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.pricing.pricingItems)
    .values([
      {
        id: '83000000-0000-4000-8000-000000000001',
        pricingSetId: initialSetId,
        code: 'delivery_fee',
        service: 'wash_fold',
        category: 'Fee',
        name: 'Delivery Fee',
        unit: 'order',
        priceCents: 495,
        sortOrder: 30,
        metadata: {},
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
      {
        id: '83000000-0000-4000-8000-000000000002',
        pricingSetId: initialSetId,
        code: 'hang_dry',
        service: 'wash_fold',
        category: 'Other Services',
        name: 'Hang Dry',
        unit: 'item',
        priceCents: 295,
        sortOrder: 40,
        metadata: {},
        createdAt: publishedAt,
        updatedAt: publishedAt,
      },
    ]);
};

beforeAll(async () => {
  await setupDatabase(targetDatabase);
});

beforeEach(async () => {
  await removeFault(targetDatabase.db);
  await targetDatabase.reset();
  await seed(targetDatabase.db);
});

afterAll(async () => {
  await removeFault(targetDatabase.db);
  await targetDatabase.close();
  dropDatabase(targetDatabase.name);
  expect(databaseExists(targetDatabase.name)).toBe(false);
});

type CanonicalResponse = Readonly<{ status: number; body: unknown }>;

const canonicalError = (error: unknown) => {
  const value =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return {
    code: typeof value['code'] === 'string' ? value['code'] : 'unknown_error',
    status: typeof value['status'] === 'number' ? value['status'] : 500,
    safeMessage:
      typeof value['safeMessage'] === 'string' ? value['safeMessage'] : null,
    details:
      typeof value['details'] === 'object' && value['details'] !== null
        ? value['details']
        : null,
  };
};

const targetResponse = async (
  action: () => Promise<unknown>,
  present: (outcome: never) => Readonly<{ status: number; body?: unknown }>,
): Promise<CanonicalResponse> => {
  try {
    const outcome = await action();
    const response = present(outcome as never);
    return { status: response.status, body: response.body ?? null };
  } catch (error) {
    const canonical = canonicalError(error);
    return { status: canonical.status, body: canonical };
  }
};

const targetBoundaryFailure = (
  system: PricingSystem,
  body: unknown,
): CanonicalResponse => {
  const surface = system.cells.planPricingChange.surfaces[0];
  if (surface?.kind !== 'http')
    return { status: 500, body: { code: 'target_surface_missing' } };
  try {
    surface.validateRequest?.({ params: {}, query: {}, headers: {}, body });
    return { status: 200, body: { unexpected: 'valid' } };
  } catch (error) {
    const canonical = canonicalError(error);
    return { status: canonical.status, body: canonical };
  }
};

const targetOperation = async (
  system: PricingSystem,
  operation: 'load' | 'plan' | 'publish',
  input: PricingChangeCommand = change,
): Promise<CanonicalResponse> => {
  const cell =
    operation === 'load'
      ? system.cells.loadPricingCatalog
      : operation === 'plan'
        ? system.cells.planPricingChange
        : system.cells.publishPricingChange;
  const surface = cell.surfaces[0];
  if (surface?.kind !== 'http')
    return { status: 500, body: { code: 'target_surface_missing' } };
  return targetResponse(
    () =>
      operation === 'load'
        ? system.cells.loadPricingCatalog.execute({
            serviceSlug: input.serviceSlug,
          })
        : operation === 'plan'
          ? system.cells.planPricingChange.execute(input)
          : system.cells.publishPricingChange.execute(input),
    surface.present as (outcome: never) => Readonly<{
      status: number;
      body?: unknown;
    }>,
  );
};

const aliasesFrom = (
  published: CanonicalResponse,
): ReadonlyMap<string, string> => {
  const body = published.body as {
    ok?: boolean;
    data?: { newPricingSetId?: string; auditEventId?: string };
  };
  return new Map([
    [initialSetId, '$initial-set'],
    ...(typeof body.data?.newPricingSetId === 'string'
      ? ([[body.data.newPricingSetId, '$published-set']] as const)
      : []),
    ...(typeof body.data?.auditEventId === 'string'
      ? ([[body.data.auditEventId, '$audit-event']] as const)
      : []),
  ]);
};

const normalize = (
  value: unknown,
  aliases: ReadonlyMap<string, string>,
): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return aliases.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((item) => normalize(item, aliases));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalize(item, aliases)]),
  );
};

const observeState = async (
  database: PostgresDatabase,
  aliases: ReadonlyMap<string, string>,
) => {
  const sets = await database
    .select({
      id: presslyPostgresOwnerSchemas.pricing.pricingSets.id,
      serviceId: presslyPostgresOwnerSchemas.pricing.pricingSets.serviceId,
      status: presslyPostgresOwnerSchemas.pricing.pricingSets.status,
      currency: presslyPostgresOwnerSchemas.pricing.pricingSets.currency,
      effectiveFrom:
        presslyPostgresOwnerSchemas.pricing.pricingSets.effectiveFrom,
      effectiveTo: presslyPostgresOwnerSchemas.pricing.pricingSets.effectiveTo,
      createdAt: presslyPostgresOwnerSchemas.pricing.pricingSets.createdAt,
      updatedAt: presslyPostgresOwnerSchemas.pricing.pricingSets.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.pricing.pricingSets)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.pricing.pricingSets.effectiveFrom),
      asc(presslyPostgresOwnerSchemas.pricing.pricingSets.id),
    );
  const items = await database
    .select({
      pricingSetId:
        presslyPostgresOwnerSchemas.pricing.pricingItems.pricingSetId,
      code: presslyPostgresOwnerSchemas.pricing.pricingItems.code,
      service: presslyPostgresOwnerSchemas.pricing.pricingItems.service,
      category: presslyPostgresOwnerSchemas.pricing.pricingItems.category,
      name: presslyPostgresOwnerSchemas.pricing.pricingItems.name,
      unit: presslyPostgresOwnerSchemas.pricing.pricingItems.unit,
      priceCents: presslyPostgresOwnerSchemas.pricing.pricingItems.priceCents,
      sortOrder: presslyPostgresOwnerSchemas.pricing.pricingItems.sortOrder,
      metadata: presslyPostgresOwnerSchemas.pricing.pricingItems.metadata,
      createdAt: presslyPostgresOwnerSchemas.pricing.pricingItems.createdAt,
      updatedAt: presslyPostgresOwnerSchemas.pricing.pricingItems.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.pricing.pricingItems)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.pricing.pricingItems.pricingSetId),
      asc(presslyPostgresOwnerSchemas.pricing.pricingItems.sortOrder),
    );
  const events = await database
    .select()
    .from(presslyPostgresOwnerSchemas.pricing.pricingChangeEvents)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.pricing.pricingChangeEvents.createdAt),
    );
  const normalized = normalize({ sets, items, events }, aliases) as {
    sets: unknown[];
    items: Record<string, unknown>[];
    events: unknown[];
  };
  return {
    ...normalized,
    items: normalized.items.sort((left, right) =>
      `${String(left['pricingSetId'])}:${String(left['sortOrder'])}`.localeCompare(
        `${String(right['pricingSetId'])}:${String(right['sortOrder'])}`,
      ),
    ),
  };
};

const runTargetScenario = async (database: PostgresDatabase) => {
  const system = makePricingSystem({
    schema: presslyPostgresOwnerSchemas.pricing,
    db: database,
    clock: { now: () => publishedAt },
  });
  const catalog = await targetOperation(system, 'load');
  const invalidBoundary = targetBoundaryFailure(system, {
    serviceSlug: 'wash-fold',
    reason: 'missing items',
  });
  const plan = await targetOperation(system, 'plan');
  const publish = await targetOperation(system, 'publish');
  const replay = await targetOperation(system, 'publish');
  const after = await targetOperation(system, 'load');
  const aliases = aliasesFrom(publish);
  const state = await observeState(database, aliases);
  return normalize(
    { catalog, invalidBoundary, plan, publish, replay, after, state },
    aliases,
  );
};

const installAuditFault = async (database: PostgresDatabase): Promise<void> => {
  await database.execute(sql`
    create function pricing_reject_audit_insert()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'pricing audit fault';
    end;
    $$
  `);
  await database.execute(sql`
    create trigger pricing_audit_fault
    before insert on pricing_change_events
    for each row execute function pricing_reject_audit_insert()
  `);
};

describe('Pricing-system PostgreSQL conformance', () => {
  it('pins exact catalog, plan, publish, replay, audit, and durable bytes', async () => {
    const target = (await runTargetScenario(targetDatabase.db)) as Record<
      string,
      unknown
    >;
    expect(target['catalog']).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          serviceSlug: 'wash-fold',
          currency: 'USD',
          items: [
            {
              service: 'wash_fold',
              unit: 'order',
              category: 'Fee',
              name: 'Delivery Fee',
              priceCents: 495,
              sortOrder: 30,
              metadata: {},
            },
            {
              service: 'wash_fold',
              unit: 'item',
              category: 'Other Services',
              name: 'Hang Dry',
              priceCents: 295,
              sortOrder: 40,
              metadata: {},
            },
          ],
          updatedAt: publishedAt.toISOString(),
        },
      },
    });
    expect(target['invalidBoundary']).toEqual({
      status: 400,
      body: {
        code: 'invalid_body_type',
        status: 400,
        safeMessage: 'Invalid request input.',
        details: null,
      },
    });
    expect(target['plan']).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          serviceSlug: 'wash-fold',
          reason: change.reason,
          oldPricingSetId: '$initial-set',
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
      },
    });
    expect(target['publish']).toEqual({
      status: 200,
      body: {
        ok: true,
        data: {
          oldPricingSetId: '$initial-set',
          newPricingSetId: '$published-set',
          auditEventId: '$audit-event',
          changeItemCount: 1,
        },
      },
    });
    expect(target['replay']).toEqual({
      status: 409,
      body: {
        code: 'pricing_change_has_no_changes',
        status: 409,
        safeMessage: 'Pricing change has no differences to publish.',
        details: { violations: [{ code: 'pricing_change_has_no_changes' }] },
      },
    });
    expect(target['after']).toMatchObject({
      status: 200,
      body: {
        ok: true,
        data: {
          items: [
            { name: 'Delivery Fee', priceCents: 100 },
            { name: 'Hang Dry', priceCents: 295 },
          ],
          updatedAt: publishedAt.toISOString(),
        },
      },
    });
    const state = target['state'] as Readonly<{
      sets: readonly Record<string, unknown>[];
      items: readonly Record<string, unknown>[];
      events: readonly Record<string, unknown>[];
    }>;
    expect(state.sets).toEqual([
      expect.objectContaining({
        id: '$initial-set',
        status: 'archived',
        effectiveTo: publishedAt.toISOString(),
      }),
      expect.objectContaining({
        id: '$published-set',
        status: 'active',
        effectiveFrom: publishedAt.toISOString(),
        effectiveTo: null,
      }),
    ]);
    expect(
      state.items.map(({ pricingSetId, code, priceCents }) => ({
        pricingSetId,
        code,
        priceCents,
      })),
    ).toEqual([
      {
        pricingSetId: '$initial-set',
        code: 'delivery_fee',
        priceCents: 495,
      },
      {
        pricingSetId: '$initial-set',
        code: 'hang_dry',
        priceCents: 295,
      },
      {
        pricingSetId: '$published-set',
        code: 'delivery_fee',
        priceCents: 100,
      },
      {
        pricingSetId: '$published-set',
        code: 'hang_dry',
        priceCents: 295,
      },
    ]);
    expect(state.events).toEqual([
      expect.objectContaining({
        id: '$audit-event',
        kind: 'pricing.publish',
        actorId: author.id,
        actorKind: author.kind,
        actorDisplayName: author.displayName,
        serviceSlug: change.serviceSlug,
        reason: change.reason,
        oldPricingSetId: '$initial-set',
        newPricingSetId: '$published-set',
        input: change,
        createdAt: publishedAt.toISOString(),
      }),
    ]);
  });

  it('rolls back the durable state when audit insertion fails', async () => {
    await installAuditFault(targetDatabase.db);
    const beforeTarget = await observeState(
      targetDatabase.db,
      new Map([[initialSetId, '$initial-set']]),
    );
    const targetSystem = makePricingSystem({
      schema: presslyPostgresOwnerSchemas.pricing,
      db: targetDatabase.db,
      clock: { now: () => publishedAt },
    });
    const targetFailure = await targetOperation(targetSystem, 'publish');

    expect(targetFailure).toMatchObject({
      status: 503,
      body: { code: 'pricing_publish_failed' },
    });
    expect(
      await observeState(
        targetDatabase.db,
        new Map([[initialSetId, '$initial-set']]),
      ),
    ).toEqual(beforeTarget);
    expect(beforeTarget).toMatchObject({
      sets: [expect.objectContaining({ id: '$initial-set', status: 'active' })],
      items: [
        expect.objectContaining({
          pricingSetId: '$initial-set',
          code: 'delivery_fee',
          priceCents: 495,
        }),
        expect.objectContaining({
          pricingSetId: '$initial-set',
          code: 'hang_dry',
          priceCents: 295,
        }),
      ],
      events: [],
    });
  });
});
