import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAccessSystem } from '@pressly/access-system/testing/assembly';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
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
  process.env['PRESSLY_ACCESS_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const databaseName =
  process.env['PRESSLY_ACCESS_CONFORMANCE_DATABASE_NAME'] ??
  `pressly_access_session_conformance_test_${process.pid}_${Date.now().toString(36)}`;
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
  dropDatabase();
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

const tableNames = [
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
] as const;

const database: TestDatabaseRuntime = createTestDatabaseRuntime({
  databaseUrl,
  tableNames,
  maxConnections: 1,
});
const now = new Date('2026-08-22T16:00:00.000Z');
const businessId = '87000000-0000-4000-8000-000000000001';
const password = 'StrongConformancePassword123!';

const target = makeAccessSystem({
  db: database.db,
  schema: presslyPostgresOwnerSchemas.access,
  clock: { now: () => now },
  tokenSecret: 'access-public-conformance-token-secret',
  sessionTtlMinutes: 30,
  sessionIdleTimeoutMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxFailures: 5,
  mfaChallengeTtlMinutes: 5,
  mfaChallengeMaxAttempts: 8,
  mfaEncryptionKey: Buffer.alloc(32, 2).toString('base64'),
  mfaIssuer: 'Pressly Access Conformance',
  policies: {
    pricing: { freshSessionMaxAgeMinutes: 15 },
    authSessions: { freshSessionMaxAgeMinutes: 15 },
    mfa: { freshSessionMaxAgeMinutes: 15 },
  },
});

const seedBusiness = () =>
  database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: businessId,
      slug: 'access-conformance',
      displayName: 'Access Conformance',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

beforeAll(async () => {
  createDatabase();
  await database.check();
}, 180_000);
beforeEach(async () => {
  await database.reset();
  await seedBusiness();
});
afterAll(async () => {
  await database.close();
  dropDatabase();
  expect(databaseExists()).toBe(false);
}, 60_000);

describe('Access public session PostgreSQL conformance', () => {
  it('pins bootstrap, login, load, challenge failure, revoke, and reload outcomes', async () => {
    const bootstrapped = await target.cells.bootstrapOwner.execute({
      businessId,
      businessSlug: 'access-conformance',
      businessDisplayName: 'Access Conformance',
      email: 'Owner@Pressly.Test',
      password,
      confirmation: 'bootstrap-first-owner',
    });
    expect(bootstrapped).toMatchObject({
      kind: 'success',
      value: {
        email: 'owner@pressly.test',
        role: 'owner',
      },
    });
    if (bootstrapped.kind === 'failure') return;
    expect(bootstrapped.value.identityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );

    const login = await target.cells.login.execute({
      email: 'owner@pressly.test',
      password,
    });
    expect(login.kind).toBe('success');
    if (login.kind === 'failure' || 'status' in login.value) return;
    expect(login.value).toMatchObject({
      expiresAt: new Date('2026-08-22T16:30:00.000Z'),
      principal: {
        identityId: bootstrapped.value.identityId,
        displayName: 'Owner@Pressly.Test',
        email: 'Owner@Pressly.Test',
        roles: ['owner'],
      },
    });
    expect(login.value.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    const loaded = await target.cells.loadSession.execute({
      bearerToken: login.value.accessToken,
    });
    expect(loaded).toMatchObject({
      kind: 'success',
      value: {
        principal: {
          identityId: bootstrapped.value.identityId,
          kind: 'human',
          displayName: 'Owner@Pressly.Test',
          email: 'Owner@Pressly.Test',
          sessionIssuedAt: now,
          sessionExpiresAt: new Date('2026-08-22T16:30:00.000Z'),
        },
        principalAttributes: {
          identityActive: true,
          assuranceLevel: 'password',
        },
      },
    });
    if (loaded.kind === 'failure') return;
    expect(loaded.value.principalAttributes.assignments).toEqual([]);

    await expect(
      target.cells.completeMfaChallenge.execute({
        challengeToken: 'missing-challenge-token',
        method: 'totp',
        code: '000000',
      }),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'authentication',
        code: 'invalid_mfa_challenge',
        message: 'The MFA challenge is invalid. Sign in again.',
      },
    });

    await expect(
      target.cells.revokeSession.execute({
        bearerToken: login.value.accessToken,
      }),
    ).resolves.toEqual({ kind: 'success', value: { revoked: true } });
    await expect(
      target.cells.loadSession.execute({
        bearerToken: login.value.accessToken,
      }),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'authentication',
        code: 'invalid_session',
        message: 'Authentication is required.',
      },
    });
  });
});
