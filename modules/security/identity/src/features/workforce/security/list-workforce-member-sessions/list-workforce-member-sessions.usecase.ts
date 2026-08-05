import { result, type Result } from '@pressly/kernel';
import { utcIsoFromDate, type Clock } from '@pressly/time';
import { requireIdentifier } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { ListWorkforceMemberSessionsStore } from './list-workforce-member-sessions.port.ts';

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
    WorkforceFailure
  >
>;

export const makeListWorkforceMemberSessions =
  (deps: {
    store: ListWorkforceMemberSessionsStore;
    clock: Clock;
  }): ListWorkforceMemberSessions =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const membershipId = requireIdentifier(
      command.membershipId,
      'membership_id',
    );
    if (result.isErr(membershipId)) return membershipId;
    const listed = await deps.store.listMemberSessions({
      actor: command.actor,
      businessId: businessId.value,
      membershipId: membershipId.value,
      now: deps.clock.now(),
    });
    if (listed.status === 'rejected')
      return result.err(workforceStoreFailure(listed.reason));
    return result.ok({
      sessions: listed.sessions.map((session) => ({
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
