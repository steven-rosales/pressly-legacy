import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { utcIsoFromDate } from '@pressly/time';
import {
  commandFingerprint,
  requireIdentifier,
} from './workforce-validation.policy.ts';
import { workforceStoreFailure } from './workforce.error.ts';
import { decodeWorkforceCursor } from './workforce-pagination.policy.ts';
import type { WorkforceActorRef } from './workforce.model.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { WorkforceSecurityStore } from './workforce-security.port.ts';

export type ListWorkforceMemberSessions = (command: {
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
}) => Promise<
  Result<
    Readonly<{
      sessions: readonly Readonly<{
        id: string;
        issuedAt: string;
        lastUsedAt: string;
        expiresAt: string;
        revokedAt: string | null;
        current: boolean;
      }>[];
    }>,
    AppError
  >
>;

export type RevokeWorkforceMemberSessions = (command: {
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
}) => Promise<
  Result<Readonly<{ revokedCount: number; replayed: boolean }>, AppError>
>;

export type ListWorkforceSecurityEvents = (command: {
  actor: WorkforceActorRef;
  businessId: string;
  cursor?: string;
  limit?: number;
}) => Promise<
  Result<
    Readonly<{
      events: readonly Readonly<{
        id: string;
        eventType: string;
        resourceType: string;
        actorDisplayName: string | null;
        createdAt: string;
      }>[];
      nextCursor: string | null;
    }>,
    AppError
  >
>;

const requiredBusiness = (businessIdValue: string) =>
  requireIdentifier(businessIdValue, 'business_id');

const requiredBusinessMembership = (command: {
  businessId: string;
  membershipId: string;
}) => {
  const businessId = requireIdentifier(command.businessId, 'business_id');
  if (result.isErr(businessId)) return businessId;
  const membershipId = requireIdentifier(command.membershipId, 'membership_id');
  if (result.isErr(membershipId)) return membershipId;
  return result.ok({
    businessId: businessId.value,
    membershipId: membershipId.value,
  });
};

export const makeListWorkforceMemberSessions =
  (deps: {
    store: WorkforceSecurityStore;
    clock: WorkforceClock;
  }): ListWorkforceMemberSessions =>
  async (command) => {
    const scope = requiredBusinessMembership(command);
    if (result.isErr(scope)) return scope;
    const listed = await deps.store.listMemberSessions({
      actor: command.actor,
      businessId: scope.value.businessId,
      membershipId: scope.value.membershipId,
      now: deps.clock.now(),
    });
    if (result.isErr(listed)) return listed;
    if (listed.value.status === 'rejected')
      return result.err(workforceStoreFailure(listed.value.reason));
    return result.ok({
      sessions: listed.value.sessions.map((session) => ({
        id: session.id,
        issuedAt: utcIsoFromDate(session.issuedAt),
        lastUsedAt: utcIsoFromDate(session.lastUsedAt),
        expiresAt: utcIsoFromDate(session.expiresAt),
        revokedAt:
          session.revokedAt === null ? null : utcIsoFromDate(session.revokedAt),
        current: session.current,
      })),
    });
  };

export const makeRevokeWorkforceMemberSessions =
  (deps: {
    store: WorkforceSecurityStore;
    clock: WorkforceClock;
  }): RevokeWorkforceMemberSessions =>
  async (command) => {
    const scope = requiredBusinessMembership(command);
    if (result.isErr(scope)) return scope;
    const idempotencyKey = requireIdentifier(
      command.idempotencyKey,
      'idempotency_key',
    );
    if (result.isErr(idempotencyKey)) return idempotencyKey;
    const sessionId =
      command.sessionId === undefined
        ? result.ok(undefined)
        : requireIdentifier(command.sessionId, 'session_id');
    if (result.isErr(sessionId)) return sessionId;
    const commandHash = commandFingerprint('revoke_workforce_sessions', {
      businessId: scope.value.businessId,
      membershipId: scope.value.membershipId,
      sessionId: sessionId.value ?? null,
    });
    const revoked = await deps.store.revokeMemberSessions({
      actor: command.actor,
      businessId: scope.value.businessId,
      membershipId: scope.value.membershipId,
      ...(sessionId.value === undefined ? {} : { sessionId: sessionId.value }),
      idempotencyKey: idempotencyKey.value,
      commandHash,
      now: deps.clock.now(),
    });
    if (result.isErr(revoked)) return revoked;
    if (revoked.value.status === 'rejected')
      return result.err(workforceStoreFailure(revoked.value.reason));
    return result.ok({
      revokedCount: revoked.value.value.revokedCount,
      replayed: revoked.value.status === 'replayed',
    });
  };

export const makeListWorkforceSecurityEvents =
  (deps: {
    store: WorkforceSecurityStore;
    clock: WorkforceClock;
  }): ListWorkforceSecurityEvents =>
  async (command) => {
    const businessId = requiredBusiness(command.businessId);
    if (result.isErr(businessId)) return businessId;
    const cursor =
      command.cursor === undefined
        ? result.ok(undefined)
        : decodeWorkforceCursor(command.cursor);
    if (result.isErr(cursor)) return cursor;
    const listed = await deps.store.listSecurityEvents({
      actor: command.actor,
      businessId: businessId.value,
      limit: Math.min(Math.max(command.limit ?? 50, 1), 100),
      ...(cursor.value === undefined ? {} : { cursor: cursor.value }),
      now: deps.clock.now(),
    });
    if (result.isErr(listed)) return listed;
    if (listed.value.status === 'rejected')
      return result.err(workforceStoreFailure(listed.value.reason));
    return result.ok({
      events: listed.value.events.map((event) => ({
        ...event,
        createdAt: utcIsoFromDate(event.createdAt),
      })),
      nextCursor: listed.value.nextCursor,
    });
  };
