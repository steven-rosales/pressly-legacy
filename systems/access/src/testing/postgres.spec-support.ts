import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import type { PostgresTransaction } from '@pressly/postgres/client';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { makeAccessSystem } from '../system.ts';
import { accessTestSchema } from './schema.ts';

const databaseUrl =
  process.env['PRESSLY_ACCESS_LOCAL_PROOF_DATABASE_URL'] ??
  (() => {
    throw invariantViolationError({
      code: 'access_local_proof_database_url_missing',
      message: 'Access PostgreSQL global setup did not provide a database URL.',
    });
  })();

export const accessPostgresProofDatabase = createTestDatabaseRuntime({
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

export const accessPostgresProofNow = new Date('2026-08-22T16:00:00.000Z');
export const accessPostgresProofFuture = new Date('2026-08-23T16:00:00.000Z');
export const accessPostgresProofBusinessId =
  '87000000-0000-4000-8000-000000000001';
export const accessPostgresProofBusinessSlug = 'access-write-proof';
export const accessPostgresProofBusinessDisplayName = 'Access Write Proof';
export const accessPostgresProofLocationId = 'access-write-location';
export const accessPostgresProofPassword = 'StrongAccessPassword123!';
export const accessPostgresProofHash = (character: string): string =>
  character.repeat(64);

export const requireAccessPostgresFixture = <Value>(
  value: Value | undefined,
  code: string,
): Value => {
  if (value !== undefined) return value;
  throw invariantViolationError({
    code,
    message: `Missing Access PostgreSQL proof fixture: ${code}.`,
  });
};

export const requireAccessPostgresSuccess = <Value>(
  outcome: Readonly<
    { kind: 'success'; value: Value } | { kind: 'failure'; failure: unknown }
  >,
): Value => {
  if (outcome.kind === 'success') return outcome.value;
  throw invariantViolationError({
    code: 'access_write_success_expected',
    message: 'Expected the Access write operation to succeed.',
    details: outcome.failure,
  });
};

export const seedAccessPostgresScope = async (): Promise<void> => {
  await accessPostgresProofDatabase.db
    .insert(accessTestSchema.businessAccounts)
    .values({
      id: accessPostgresProofBusinessId,
      slug: accessPostgresProofBusinessSlug,
      displayName: accessPostgresProofBusinessDisplayName,
      status: 'active',
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    });
  await accessPostgresProofDatabase.db
    .insert(accessTestSchema.accessProductionLocations)
    .values({
      id: accessPostgresProofLocationId,
      businessId: accessPostgresProofBusinessId,
      name: 'Access Write Location',
      timezone: 'America/New_York',
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    });
};

export const insertAccessPostgresIdentity = async (
  email: string,
  displayName = 'Operator',
) => {
  const [identity] = await accessPostgresProofDatabase.db
    .insert(accessTestSchema.authIdentities)
    .values({
      kind: 'human',
      displayName,
      email,
      emailNormalized: email,
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    })
    .returning();
  return requireAccessPostgresFixture(identity, 'identity');
};

export const insertAccessPostgresMembership = async (identityId: string) => {
  const [membership] = await accessPostgresProofDatabase.db
    .insert(accessTestSchema.workforceMemberships)
    .values({
      businessId: accessPostgresProofBusinessId,
      identityId,
      state: 'active',
      startedAt: accessPostgresProofNow,
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    })
    .returning();
  return requireAccessPostgresFixture(membership, 'membership');
};

export const insertAccessPostgresGrant = async (input: {
  membershipId: string;
  identityId: string;
  role: 'owner' | 'manager' | 'operator';
  createdByIdentityId: string;
}) => {
  const isBusinessScope = input.role !== 'operator';
  const [grant] = await accessPostgresProofDatabase.db
    .insert(accessTestSchema.authAccessGrants)
    .values({
      businessId: accessPostgresProofBusinessId,
      membershipId: input.membershipId,
      identityId: input.identityId,
      role: input.role,
      scopeKind: isBusinessScope ? 'business' : 'location',
      scopeId: isBusinessScope
        ? accessPostgresProofBusinessId
        : accessPostgresProofLocationId,
      locationId: isBusinessScope ? null : accessPostgresProofLocationId,
      startsAt: accessPostgresProofNow,
      createdByIdentityId: input.createdByIdentityId,
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    })
    .returning();
  return requireAccessPostgresFixture(grant, 'grant');
};

export const insertAccessPostgresSession = async (
  identityId: string,
  tokenHash: string,
  assuranceLevel: 'password' | 'mfa' = 'password',
) => {
  const [session] = await accessPostgresProofDatabase.db
    .insert(accessTestSchema.authSessions)
    .values({
      identityId,
      tokenHash,
      assuranceLevel,
      issuedAt: accessPostgresProofNow,
      lastUsedAt: accessPostgresProofNow,
      expiresAt: accessPostgresProofFuture,
    })
    .returning();
  return requireAccessPostgresFixture(session, 'session');
};

export const seedAccessPostgresOwnerActor = async () => {
  const identity = await insertAccessPostgresIdentity(
    'owner-write@pressly.test',
    'Owner',
  );
  const membership = await insertAccessPostgresMembership(identity.id);
  const grant = await insertAccessPostgresGrant({
    membershipId: membership.id,
    identityId: identity.id,
    role: 'owner',
    createdByIdentityId: identity.id,
  });
  await accessPostgresProofDatabase.db
    .insert(accessTestSchema.authMfaCredentials)
    .values({
      identityId: identity.id,
      encryptedSecret: 'encrypted-owner-secret',
      status: 'enabled',
      enabledAt: accessPostgresProofNow,
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    });
  const session = await insertAccessPostgresSession(
    identity.id,
    accessPostgresProofHash('o'),
    'mfa',
  );
  return {
    identity,
    membership,
    grant,
    session,
    actor: { identityId: identity.id, sessionId: session.id },
  };
};

export const seedAccessPostgresOperator = async (input: {
  email: string;
  withGrant?: boolean;
  sessionHashes?: readonly string[];
}) => {
  const identity = await insertAccessPostgresIdentity(input.email);
  const membership = await insertAccessPostgresMembership(identity.id);
  const grant =
    input.withGrant === true
      ? await insertAccessPostgresGrant({
          membershipId: membership.id,
          identityId: identity.id,
          role: 'operator',
          createdByIdentityId: identity.id,
        })
      : null;
  const sessions = await Promise.all(
    (input.sessionHashes ?? []).map((tokenHash) =>
      insertAccessPostgresSession(identity.id, tokenHash),
    ),
  );
  return { identity, membership, grant, sessions };
};

export const insertAccessPostgresInvitation = async (
  ownerIdentityId: string,
  input: Readonly<{
    email: string;
    tokenHash: string;
    role?: 'owner' | 'manager' | 'operator';
  }>,
) => {
  const role = input.role ?? 'operator';
  const [invitation] = await accessPostgresProofDatabase.db
    .insert(accessTestSchema.workforceInvitations)
    .values({
      businessId: accessPostgresProofBusinessId,
      emailNormalized: input.email,
      displayName: 'Invited Operator',
      intendedRole: role,
      intendedLocationId:
        role === 'operator' ? accessPostgresProofLocationId : null,
      tokenHash: input.tokenHash,
      expiresAt: accessPostgresProofFuture,
      createdByIdentityId: ownerIdentityId,
      createdAt: accessPostgresProofNow,
      updatedAt: accessPostgresProofNow,
    })
    .returning();
  return requireAccessPostgresFixture(invitation, 'invitation');
};

export const accessPostgresForcedRollbackUnitOfWork: UnitOfWork<PostgresTransaction> =
  {
    transaction: async (work) =>
      accessPostgresProofDatabase.db.transaction(async (transaction) => {
        await work(transaction);
        throw invariantViolationError({
          code: 'access_write_forced_rollback',
          message: 'Force a late failure to prove PostgreSQL rollback.',
        });
      }),
  };

export const accessPostgresProofSystem = makeAccessSystem({
  db: accessPostgresProofDatabase.db,
  schema: accessTestSchema,
  clock: { now: () => accessPostgresProofNow },
  tokenSecret: 'access-write-postgres-token-secret',
  sessionTtlMinutes: 30,
  sessionIdleTimeoutMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxFailures: 5,
  mfaChallengeTtlMinutes: 5,
  mfaChallengeMaxAttempts: 8,
  mfaEncryptionKey: Buffer.alloc(32, 2).toString('base64'),
  mfaIssuer: 'Pressly Access Write Proof',
  policies: {
    pricing: { freshSessionMaxAgeMinutes: 15 },
    authSessions: { freshSessionMaxAgeMinutes: 15 },
    mfa: { freshSessionMaxAgeMinutes: 15 },
  },
});

export const useAccessPostgresProof = (): void => {
  beforeAll(accessPostgresProofDatabase.check);
  beforeEach(accessPostgresProofDatabase.reset);
  afterAll(accessPostgresProofDatabase.close);
};
