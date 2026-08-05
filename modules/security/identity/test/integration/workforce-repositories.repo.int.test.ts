import { eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as business from '@pressly/db/schema/business';
import { invariantViolationError } from '@pressly/errors/factories';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeGrantWorkforceAccessStore } from '../../src/features/workforce/access/grant-workforce-access/grant-workforce-access.repo.ts';
import { makeRevokeWorkforceAccessStore } from '../../src/features/workforce/access/revoke-workforce-access/revoke-workforce-access.repo.ts';
import { makeIssueWorkforceInvitationStore } from '../../src/features/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.repo.ts';
import { makeTransitionWorkforceMembershipStore } from '../../src/features/workforce/memberships/transition-workforce-membership/transition-workforce-membership.repo.ts';
import { makeRevokeWorkforceMemberSessionsStore } from '../../src/features/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

const testDb = createAuthTestDatabase();
const now = new Date('2026-07-29T12:00:00.000Z');
const future = new Date('2026-07-29T20:00:00.000Z');
const businessId = '00000000-0000-4000-8000-000000000902';
const locationId = 'identity-workforce-repository-test';

const requireFixture = <T>(
  value: T | undefined,
  code: string,
  message: string,
): T => {
  if (value !== undefined) return value;

  throw invariantViolationError({ code, message });
};

const insertIdentity = async (input: {
  displayName: string;
  email: string;
}) => {
  const [identity] = await testDb.db
    .insert(auth.authIdentities)
    .values({
      kind: 'human',
      displayName: input.displayName,
      email: input.email,
      emailNormalized: input.email,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return requireFixture(
    identity,
    'workforce_test_identity_missing',
    'Expected the workforce test identity insert to return a row.',
  );
};

const insertMembership = async (identityId: string) => {
  const [membership] = await testDb.db
    .insert(auth.workforceMemberships)
    .values({
      businessId,
      identityId,
      state: 'active',
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return requireFixture(
    membership,
    'workforce_test_membership_missing',
    'Expected the workforce test membership insert to return a row.',
  );
};

const insertGrant = async (input: {
  membershipId: string;
  identityId: string;
  role: 'owner' | 'operator';
  createdByIdentityId: string;
}) => {
  const businessScope = input.role === 'owner';
  const [grant] = await testDb.db
    .insert(auth.authAccessGrants)
    .values({
      businessId,
      membershipId: input.membershipId,
      identityId: input.identityId,
      role: input.role,
      scopeKind: businessScope ? 'business' : 'location',
      scopeId: businessScope ? businessId : locationId,
      locationId: businessScope ? null : locationId,
      startsAt: now,
      createdByIdentityId: input.createdByIdentityId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return requireFixture(
    grant,
    'workforce_test_grant_missing',
    'Expected the workforce test access-grant insert to return a row.',
  );
};

const insertSession = async (identityId: string, tokenHash: string) => {
  const [session] = await testDb.db
    .insert(auth.authSessions)
    .values({
      identityId,
      tokenHash,
      assuranceLevel: 'password',
      issuedAt: now,
      lastUsedAt: now,
      expiresAt: future,
    })
    .returning();

  return requireFixture(
    session,
    'workforce_test_session_missing',
    'Expected the workforce test session insert to return a row.',
  );
};

const seedOwnerActor = async () => {
  const identity = await insertIdentity({
    displayName: 'Owner',
    email: 'owner-workforce-repositories@pressly.test',
  });
  const membership = await insertMembership(identity.id);
  await insertGrant({
    membershipId: membership.id,
    identityId: identity.id,
    role: 'owner',
    createdByIdentityId: identity.id,
  });
  await testDb.db.insert(auth.authMfaCredentials).values({
    identityId: identity.id,
    encryptedSecret: 'encrypted-owner-secret',
    status: 'enabled',
    enabledAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const [session] = await testDb.db
    .insert(auth.authSessions)
    .values({
      identityId: identity.id,
      tokenHash: 'owner-workforce-repository-session',
      assuranceLevel: 'mfa',
      issuedAt: now,
      lastUsedAt: now,
      expiresAt: future,
    })
    .returning();

  return {
    identity,
    membership,
    session: requireFixture(
      session,
      'workforce_test_owner_session_missing',
      'Expected the workforce owner session insert to return a row.',
    ),
  };
};

const seedOperator = async (input: {
  email: string;
  withGrant: boolean;
  sessionHashes: readonly string[];
}) => {
  const identity = await insertIdentity({
    displayName: 'Operator',
    email: input.email,
  });
  const membership = await insertMembership(identity.id);
  const grant = input.withGrant
    ? await insertGrant({
        membershipId: membership.id,
        identityId: identity.id,
        role: 'operator',
        createdByIdentityId: identity.id,
      })
    : null;
  const sessions = await Promise.all(
    input.sessionHashes.map((tokenHash) =>
      insertSession(identity.id, tokenHash),
    ),
  );

  return { identity, membership, grant, sessions };
};

beforeAll(testDb.check);
beforeEach(async () => {
  await testDb.reset();
  await testDb.db
    .insert(business.businessAccounts)
    .values({
      id: businessId,
      slug: 'identity-workforce-repository-test',
      displayName: 'Identity Workforce Repository Test',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  await testDb.db
    .insert(business.productionLocations)
    .values({
      id: locationId,
      businessId,
      name: 'Identity Workforce Repository Test Location',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
});
afterAll(testDb.close);

describe('feature-owned workforce repositories', () => {
  it('issues one invitation atomically, replays it, and rolls back a late persistence failure', async () => {
    const owner = await seedOwnerActor();
    const store = makeIssueWorkforceInvitationStore(testDb.db);
    const command = {
      actor: {
        identityId: owner.identity.id,
        sessionId: owner.session.id,
      },
      businessId,
      emailNormalized: 'invited-operator@pressly.test',
      displayName: 'Invited Operator',
      intendedRole: 'operator' as const,
      intendedLocationId: locationId,
      tokenHash: 'a'.repeat(64),
      expiresAt: future,
      now,
      idempotencyKey: 'issue-workforce-invitation-1',
      commandHash: '1'.repeat(64),
    };

    const applied = await store.issue(command);
    const replayed = await store.issue(command);

    expect(applied.status).toBe('applied');
    expect(replayed.status).toBe('replayed');
    if (applied.status === 'rejected' || replayed.status === 'rejected')
      throw invariantViolationError({
        code: 'workforce_test_invitation_rejected',
        message: 'Expected invitation issue and replay to succeed.',
      });
    expect(replayed.value.id).toBe(applied.value.id);

    const invitations = await testDb.db
      .select()
      .from(auth.workforceInvitations)
      .where(
        eq(auth.workforceInvitations.emailNormalized, command.emailNormalized),
      );
    const receipts = await testDb.db
      .select()
      .from(auth.authCommandReceipts)
      .where(
        eq(auth.authCommandReceipts.idempotencyKey, command.idempotencyKey),
      );
    const audits = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(
        eq(auth.authAuditEvents.eventType, 'auth.workforce_invitation_issued'),
      );

    expect(invitations).toHaveLength(1);
    expect(receipts).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      businessId,
      principalIdentityId: owner.identity.id,
      resourceId: applied.value.id,
    });

    const rolledBackEmail = 'rolled-back-operator@pressly.test';
    await expect(
      store.issue({
        ...command,
        emailNormalized: rolledBackEmail,
        tokenHash: 'b'.repeat(64),
        idempotencyKey: 'issue-workforce-invitation-rollback',
        commandHash: 'invalid-command-hash',
      }),
    ).rejects.toMatchObject({ code: 'auth_database_failed' });

    const rolledBackInvitations = await testDb.db
      .select()
      .from(auth.workforceInvitations)
      .where(eq(auth.workforceInvitations.emailNormalized, rolledBackEmail));
    expect(rolledBackInvitations).toHaveLength(0);
  });

  it('suspends a membership with session revocation, transition, receipt, and audit in one commit', async () => {
    const owner = await seedOwnerActor();
    const operator = await seedOperator({
      email: 'membership-operator@pressly.test',
      withGrant: true,
      sessionHashes: ['membership-session-1', 'membership-session-2'],
    });
    const store = makeTransitionWorkforceMembershipStore(testDb.db);
    const command = {
      actor: {
        identityId: owner.identity.id,
        sessionId: owner.session.id,
      },
      membershipId: operator.membership.id,
      businessId,
      expectedVersion: 1,
      event: 'suspend' as const,
      reason: 'access review',
      now,
      idempotencyKey: 'suspend-workforce-membership-1',
      commandHash: '2'.repeat(64),
    };

    const applied = await store.transition(command);
    const replayed = await store.transition(command);

    expect(applied).toMatchObject({
      status: 'applied',
      value: {
        member: { state: 'suspended', version: 2 },
        revokedSessionCount: 2,
      },
    });
    expect(replayed.status).toBe('replayed');

    const [membership] = await testDb.db
      .select()
      .from(auth.workforceMemberships)
      .where(eq(auth.workforceMemberships.id, operator.membership.id));
    const sessions = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.identityId, operator.identity.id));
    const transitions = await testDb.db
      .select()
      .from(auth.authLifecycleTransitions)
      .where(
        eq(auth.authLifecycleTransitions.aggregateId, operator.membership.id),
      );
    const receipts = await testDb.db
      .select()
      .from(auth.authCommandReceipts)
      .where(
        eq(auth.authCommandReceipts.idempotencyKey, command.idempotencyKey),
      );
    const audits = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(
        eq(auth.authAuditEvents.eventType, 'auth.workforce_membership_suspend'),
      );

    expect(membership).toMatchObject({
      state: 'suspended',
      version: 2,
      suspendedAt: now,
      suspendedByIdentityId: owner.identity.id,
      suspensionReason: 'access review',
    });
    expect(sessions).toHaveLength(2);
    expect(
      sessions.every(
        (session) => session.revokedAt?.getTime() === now.getTime(),
      ),
    ).toBe(true);
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      fromState: 'active',
      toState: 'suspended',
      eventType: 'suspend',
      aggregateVersion: 2,
    });
    expect(receipts).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it('grants and revokes access through independent repositories without losing atomic session reduction', async () => {
    const owner = await seedOwnerActor();
    const operator = await seedOperator({
      email: 'access-operator@pressly.test',
      withGrant: false,
      sessionHashes: ['access-session-1'],
    });
    const actor = {
      identityId: owner.identity.id,
      sessionId: owner.session.id,
    };
    const grantStore = makeGrantWorkforceAccessStore(testDb.db);
    const granted = await grantStore.grant({
      actor,
      businessId,
      membershipId: operator.membership.id,
      identityId: operator.identity.id,
      role: 'operator',
      scope: { kind: 'location', id: locationId },
      startsAt: null,
      endsAt: null,
      now,
      idempotencyKey: 'grant-workforce-access-1',
      commandHash: '3'.repeat(64),
    });

    expect(granted).toMatchObject({
      status: 'applied',
      value: {
        role: 'operator',
        scope: { kind: 'location', id: locationId },
        effective: true,
      },
    });
    if (granted.status === 'rejected')
      throw invariantViolationError({
        code: 'workforce_test_access_grant_rejected',
        message: 'Expected the access grant to succeed.',
      });

    const revokeStore = makeRevokeWorkforceAccessStore(testDb.db);
    const revokeCommand = {
      actor,
      businessId,
      grantId: granted.value.id,
      expectedVersion: 1,
      reason: 'location access removed',
      now,
      idempotencyKey: 'revoke-workforce-access-1',
      commandHash: '4'.repeat(64),
    };
    const revoked = await revokeStore.revoke(revokeCommand);
    const replayed = await revokeStore.revoke(revokeCommand);

    expect(revoked).toMatchObject({
      status: 'applied',
      value: {
        grant: { state: 'revoked', version: 2, effective: false },
        revokedSessionCount: 1,
      },
    });
    expect(replayed.status).toBe('replayed');

    const [grant] = await testDb.db
      .select()
      .from(auth.authAccessGrants)
      .where(eq(auth.authAccessGrants.id, granted.value.id));
    const [session] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, operator.sessions[0]!.id));
    const transitions = await testDb.db
      .select()
      .from(auth.authLifecycleTransitions)
      .where(eq(auth.authLifecycleTransitions.aggregateId, granted.value.id));
    const audits = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.resourceId, granted.value.id));

    expect(grant).toMatchObject({
      state: 'revoked',
      version: 2,
      revokedAt: now,
      revokedByIdentityId: owner.identity.id,
      revocationReason: 'location access removed',
    });
    expect(session?.revokedAt).toEqual(now);
    expect(transitions).toHaveLength(1);
    expect(audits.map((audit) => audit.eventType).sort()).toEqual([
      'auth.workforce_access_granted',
      'auth.workforce_access_revoked',
    ]);
  });

  it('revokes only the selected member session and replays the persisted count', async () => {
    const owner = await seedOwnerActor();
    const operator = await seedOperator({
      email: 'security-operator@pressly.test',
      withGrant: true,
      sessionHashes: ['security-session-selected', 'security-session-kept'],
    });
    const store = makeRevokeWorkforceMemberSessionsStore(testDb.db);
    const selected = operator.sessions[0]!;
    const untouched = operator.sessions[1]!;
    const command = {
      actor: {
        identityId: owner.identity.id,
        sessionId: owner.session.id,
      },
      businessId,
      membershipId: operator.membership.id,
      sessionId: selected.id,
      idempotencyKey: 'revoke-workforce-member-session-1',
      commandHash: '5'.repeat(64),
      now,
    };

    const applied = await store.revokeMemberSessions(command);
    const replayed = await store.revokeMemberSessions(command);

    expect(applied).toEqual({
      status: 'applied',
      value: { revokedCount: 1 },
    });
    expect(replayed).toEqual({
      status: 'replayed',
      value: { revokedCount: 1 },
    });

    const sessions = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.identityId, operator.identity.id));
    const receipts = await testDb.db
      .select()
      .from(auth.authCommandReceipts)
      .where(
        eq(auth.authCommandReceipts.idempotencyKey, command.idempotencyKey),
      );
    const audits = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(
        eq(auth.authAuditEvents.eventType, 'auth.workforce_session_revoked'),
      );

    expect(
      sessions.find((session) => session.id === selected.id)?.revokedAt,
    ).toEqual(now);
    expect(
      sessions.find((session) => session.id === untouched.id)?.revokedAt,
    ).toBeNull();
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.resultMetadata).toEqual({ revokedCount: 1 });
    expect(audits).toHaveLength(1);
  });
});
