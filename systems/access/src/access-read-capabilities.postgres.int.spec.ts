import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeAccessSystem } from './system.ts';
import { accessTestSchema } from './testing/schema.ts';

const auth = accessTestSchema;
const business = accessTestSchema;

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const adminDatabaseUrl =
  process.env['PRESSLY_ACCESS_NATIVE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName =
  process.env['PRESSLY_ACCESS_NATIVE_DATABASE_NAME'] ??
  `pressly_access_native_test_${process.pid}_${Date.now().toString(36)}`;
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

const database = createTestDatabaseRuntime({
  databaseUrl,
  tableNames: [
    'auth_command_receipts',
    'auth_lifecycle_transitions',
    'auth_access_grants',
    'workforce_invitations',
    'workforce_memberships',
    'auth_audit_events',
    'auth_login_attempts',
    'auth_mfa_recovery_codes',
    'auth_mfa_challenges',
    'auth_mfa_credentials',
    'auth_password_credentials',
    'auth_sessions',
    'auth_identities',
    'access_production_locations',
    'business_accounts',
  ],
  maxConnections: 4,
});

const now = new Date('2026-08-22T16:00:00.000Z');
const businessId = '86000000-0000-4000-8000-000000000001';
const eastLocationId = 'access-native-east';
const westLocationId = 'access-native-west';
const password = 'StrongAccessPassword123!';

const system = makeAccessSystem({
  db: database.db,
  schema: accessTestSchema,
  clock: { now: () => now },
  tokenSecret: 'access-native-postgres-token-secret',
  sessionTtlMinutes: 30,
  sessionIdleTimeoutMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxFailures: 5,
  mfaChallengeTtlMinutes: 5,
  mfaChallengeMaxAttempts: 8,
  mfaEncryptionKey: Buffer.alloc(32, 1).toString('base64'),
  mfaIssuer: 'Pressly Access Native',
  policies: {
    pricing: { freshSessionMaxAgeMinutes: 15 },
    authSessions: { freshSessionMaxAgeMinutes: 15 },
    mfa: { freshSessionMaxAgeMinutes: 15 },
  },
});

const seedScope = async (): Promise<void> => {
  await database.db.insert(business.businessAccounts).values({
    id: businessId,
    slug: 'access-native',
    displayName: 'Access Native',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await database.db.insert(business.accessProductionLocations).values([
    {
      id: westLocationId,
      businessId,
      name: 'Access West',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: eastLocationId,
      businessId,
      name: 'Access East',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    },
  ]);
};

const successful = <Value>(
  outcome: Readonly<
    { kind: 'success'; value: Value } | { kind: 'failure'; failure: unknown }
  >,
): Value => {
  if (outcome.kind === 'success') return outcome.value;
  throw invariantViolationError({
    code: 'access_native_success_expected',
    message: 'Expected the Access native operation to succeed.',
    details: outcome.failure,
  });
};

beforeAll(() => {
  dropDatabase();
  createDatabase();
  return database.check();
});
beforeEach(database.reset);
afterAll(async () => {
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
});

describe('Access read operations and cross-owner scope capabilities', () => {
  it('executes actor and scope reads on the Access owner database', async () => {
    await seedScope();
    const aliceId = '86000000-0000-4000-8000-000000000011';
    const bobId = '86000000-0000-4000-8000-000000000012';
    await database.db.insert(auth.authIdentities).values([
      {
        id: bobId,
        kind: 'human',
        displayName: 'Bob Rivera',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: aliceId,
        kind: 'human',
        displayName: 'Alice Nguyen',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await expect(
      system.capabilities.productionActorReadV1.loadActors({
        actorIds: [bobId, aliceId, bobId],
      }),
    ).resolves.toEqual([
      { id: aliceId, displayName: 'Alice Nguyen' },
      { id: bobId, displayName: 'Bob Rivera' },
    ]);
    await expect(
      system.capabilities.productionActorReadV1.findActorIdsByDisplayName({
        query: 'ICE NG',
      }),
    ).resolves.toEqual([aliceId]);
    await expect(
      system.capabilities.productionScopeReconciliationV1.load({
        locationId: eastLocationId,
      }),
    ).resolves.toEqual({
      id: eastLocationId,
      businessId,
      name: 'Access East',
      timezone: 'America/New_York',
      isActive: true,
    });
  });

  it('loads effective grants before active locations with legacy ordering and filters', async () => {
    await seedScope();
    const bootstrapped = successful(
      await system.cells.bootstrapOwner.execute({
        businessId,
        businessSlug: 'access-native',
        businessDisplayName: 'Access Native',
        email: 'scope-owner@pressly.test',
        password,
        confirmation: 'bootstrap-first-owner',
      }),
    );
    const [membership] = await database.db
      .select()
      .from(auth.workforceMemberships)
      .where(eq(auth.workforceMemberships.identityId, bootstrapped.identityId));
    if (membership === undefined)
      throw invariantViolationError({
        code: 'access_native_membership_expected',
        message: 'Expected bootstrap membership for scope query proof.',
      });
    await database.db.insert(auth.authAccessGrants).values({
      id: '86000000-0000-4000-8000-000000000099',
      businessId,
      membershipId: membership.id,
      identityId: bootstrapped.identityId,
      role: 'operator',
      scopeKind: 'location',
      scopeId: eastLocationId,
      locationId: eastLocationId,
      state: 'active',
      version: 1,
      startsAt: null,
      endsAt: now,
      revokedAt: null,
      createdByIdentityId: bootstrapped.identityId,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      system.cells.listEffectiveAccessGrants.execute(bootstrapped.identityId),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        grants: [
          {
            businessId,
            businessName: 'Access Native',
            role: 'owner',
            scopeKind: 'business',
            scopeId: businessId,
          },
        ],
      },
    });
    await expect(
      system.cells.listActiveBusinessLocations.execute(businessId),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        locations: [
          {
            id: eastLocationId,
            name: 'Access East',
            timezone: 'America/New_York',
          },
          {
            id: westLocationId,
            name: 'Access West',
            timezone: 'America/New_York',
          },
        ],
      },
    });
  });

  it('lists one legacy-ordered read of locations from active businesses only', async () => {
    await seedScope();
    const activeBusinessId = '86000000-0000-4000-8000-000000000002';
    const inactiveBusinessId = '86000000-0000-4000-8000-000000000003';
    await database.db.insert(business.businessAccounts).values([
      {
        id: activeBusinessId,
        slug: 'access-native-second',
        displayName: 'Access Native Second',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: inactiveBusinessId,
        slug: 'access-native-inactive',
        displayName: 'Access Native Inactive',
        status: 'suspended',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.db.insert(business.accessProductionLocations).values([
      {
        id: 'access-native-alpha',
        businessId: activeBusinessId,
        name: 'Alpha',
        timezone: 'America/Chicago',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'access-native-zulu',
        businessId: activeBusinessId,
        name: 'Zulu',
        timezone: 'America/Chicago',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'access-native-disabled-location',
        businessId: activeBusinessId,
        name: 'Disabled',
        timezone: 'America/Chicago',
        isActive: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'access-native-inactive-business-location',
        businessId: inactiveBusinessId,
        name: 'Hidden',
        timezone: 'America/Denver',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await expect(
      system.cells.listActiveProductionLocations.execute(null),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        locations: [
          {
            id: eastLocationId,
            businessId,
            name: 'Access East',
            timezone: 'America/New_York',
          },
          {
            id: westLocationId,
            businessId,
            name: 'Access West',
            timezone: 'America/New_York',
          },
          {
            id: 'access-native-alpha',
            businessId: activeBusinessId,
            name: 'Alpha',
            timezone: 'America/Chicago',
          },
          {
            id: 'access-native-zulu',
            businessId: activeBusinessId,
            name: 'Zulu',
            timezone: 'America/Chicago',
          },
        ],
      },
    });
  });

  it('owns canonical location ancestry and deterministic visibility', async () => {
    await seedScope();

    await expect(
      system.cells.resolveLocationAncestry.execute(eastLocationId),
    ).resolves.toEqual({
      kind: 'success',
      value: { locationId: eastLocationId, businessId },
    });
    await expect(
      system.cells.resolveProductionVisibility.execute({
        principalAttributes: {
          assignments: [
            {
              role: 'manager',
              scope: { kind: 'business', id: businessId },
              state: 'active',
              version: 1,
            },
          ],
          identityActive: true,
          assuranceLevel: 'mfa',
        },
      }),
    ).resolves.toEqual({
      kind: 'success',
      value: [eastLocationId, westLocationId],
    });
  });

  it('reconciles canonical location scope through the owner-local cell', async () => {
    await seedScope();
    const createdLocationId = 'access-native-created';

    const facts = await system.capabilities.orderLocationFactsV1.execute({
      locationId: eastLocationId,
    });
    const updated = successful(
      await system.cells.reconcileProductionLocation.execute({
        location: {
          id: eastLocationId,
          businessId,
          name: 'Access East Updated',
          timezone: 'America/Chicago',
          isActive: true,
        },
        dryRun: false,
      }),
    );
    const created = successful(
      await system.cells.reconcileProductionLocation.execute({
        location: {
          id: createdLocationId,
          businessId,
          name: 'Access Created',
          timezone: 'America/New_York',
          isActive: true,
        },
        dryRun: false,
      }),
    );
    const rows = await database.db
      .select({
        id: business.accessProductionLocations.id,
        name: business.accessProductionLocations.name,
      })
      .from(business.accessProductionLocations)
      .where(
        sql`${business.accessProductionLocations.id} in (${eastLocationId}, ${createdLocationId})`,
      )
      .orderBy(business.accessProductionLocations.id);
    const activeLocations =
      await system.capabilities.productionScopeReconciliationV1.list({
        includeInactive: false,
        locationIds: null,
      });
    const selectedLocations =
      await system.capabilities.productionScopeReconciliationV1.list({
        includeInactive: true,
        locationIds: [westLocationId, eastLocationId],
      });
    const emptySelection =
      await system.capabilities.productionScopeReconciliationV1.list({
        includeInactive: true,
        locationIds: [],
      });
    const observed = {
      facts,
      updated,
      created,
      rows,
      activeLocations,
      selectedLocations,
      emptySelection,
    };

    expect(observed).toEqual({
      facts: { businessId, isActive: true },
      updated: expect.objectContaining({
        status: 'converged',
        applied: true,
        operation: expect.objectContaining({ outcome: 'updated' }),
      }),
      created: expect.objectContaining({
        status: 'converged',
        applied: true,
        operation: expect.objectContaining({ outcome: 'created' }),
      }),
      activeLocations: [
        {
          id: createdLocationId,
          businessId,
          name: 'Access Created',
          timezone: 'America/New_York',
          isActive: true,
        },
        {
          id: eastLocationId,
          businessId,
          name: 'Access East Updated',
          timezone: 'America/Chicago',
          isActive: true,
        },
        {
          id: westLocationId,
          businessId,
          name: 'Access West',
          timezone: 'America/New_York',
          isActive: true,
        },
      ],
      selectedLocations: [
        {
          id: eastLocationId,
          businessId,
          name: 'Access East Updated',
          timezone: 'America/Chicago',
          isActive: true,
        },
        {
          id: westLocationId,
          businessId,
          name: 'Access West',
          timezone: 'America/New_York',
          isActive: true,
        },
      ],
      emptySelection: [],
      rows: [
        {
          id: createdLocationId,
          name: 'Access Created',
        },
        {
          id: eastLocationId,
          name: 'Access East Updated',
        },
      ],
    });
  });
});
