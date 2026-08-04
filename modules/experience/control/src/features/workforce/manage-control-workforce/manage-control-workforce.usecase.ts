import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type {
  ControlGrant,
  ControlMemberDetail,
  ControlMemberPage,
  ControlSessionRevocation,
  ControlWorkforceSessionList,
} from '../../../foundations/language/control-workforce/control-workforce.model.ts';
import type {
  ControlMembershipState,
  ControlWorkforceRole,
  ControlWorkforceScope,
} from '../../../foundations/language/control-workforce/control-workforce.value.ts';
import type {
  ControlWorkforcePort,
  ControlWorkforceRejection,
} from '../../../foundations/ports/control-workforce/control-workforce.port.ts';
import {
  toControlGrant,
  toControlMemberDetail,
  toControlMember,
} from './control-workforce.projection.mapper.ts';

type WorkforceResult<Value> = Promise<Result<Value, ControlWorkforceRejection>>;

export type ControlWorkforceApplication = Readonly<{
  listMembers: (input: {
    context: ControlRequestContext;
    states?: readonly ControlMembershipState[];
    query?: string;
    cursor?: string;
    limit: number;
  }) => WorkforceResult<ControlMemberPage>;
  getMember: (input: {
    context: ControlRequestContext;
    membershipId: string;
  }) => WorkforceResult<ControlMemberDetail>;
  listMemberSessions: (input: {
    context: ControlRequestContext;
    membershipId: string;
  }) => WorkforceResult<ControlWorkforceSessionList>;
  revokeMemberSessions: (input: {
    context: ControlRequestContext;
    membershipId: string;
    sessionId?: string;
    idempotencyKey: string;
  }) => WorkforceResult<ControlSessionRevocation>;
  transitionMembership: (input: {
    context: ControlRequestContext;
    transition: 'suspend' | 'reactivate' | 'end';
    membershipId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => WorkforceResult<
    Readonly<{
      member: ControlMemberDetail;
      revokedSessionCount: number;
    }>
  >;
  grantAccess: (input: {
    context: ControlRequestContext;
    membershipId: string;
    identityId: string;
    role: ControlWorkforceRole;
    scope: ControlWorkforceScope;
    startsAt?: string;
    endsAt?: string;
    idempotencyKey: string;
  }) => WorkforceResult<ControlGrant>;
  revokeAccess: (input: {
    context: ControlRequestContext;
    grantId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => WorkforceResult<
    Readonly<{
      grant: ControlGrant;
      revokedSessionCount: number;
    }>
  >;
}>;

export const makeControlWorkforceApplication = (
  workforce: ControlWorkforcePort,
): ControlWorkforceApplication => ({
  listMembers: async ({ context, ...query }) => {
    const page = await workforce.listMembers({
      ...query,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          members: page.value.members.map(toControlMember),
          nextCursor: page.value.nextCursor,
        });
  },
  getMember: async ({ context, membershipId }) => {
    const member = await workforce.getMember({
      actor: context.actor,
      businessId: context.access.business.id,
      membershipId,
    });
    return result.isErr(member)
      ? member
      : result.ok(toControlMemberDetail(member.value));
  },
  listMemberSessions: async ({ context, membershipId }) => {
    const sessions = await workforce.listMemberSessions({
      actor: context.actor,
      businessId: context.access.business.id,
      membershipId,
    });
    return sessions;
  },
  revokeMemberSessions: async ({ context, ...command }) => {
    const revoked = await workforce.revokeMemberSessions({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return revoked;
  },
  transitionMembership: async ({ context, ...command }) => {
    const transitioned = await workforce.transitionMembership({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(transitioned)
      ? transitioned
      : result.ok({
          member: toControlMemberDetail(transitioned.value.member),
          revokedSessionCount: transitioned.value.revokedSessionCount,
        });
  },
  grantAccess: async ({ context, startsAt, endsAt, ...command }) => {
    const granted = await workforce.grantAccess({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
      ...(startsAt === undefined ? {} : { startsAt: new Date(startsAt) }),
      ...(endsAt === undefined ? {} : { endsAt: new Date(endsAt) }),
    });
    return result.isErr(granted)
      ? granted
      : result.ok(toControlGrant(granted.value));
  },
  revokeAccess: async ({ context, ...command }) => {
    const revoked = await workforce.revokeAccess({
      ...command,
      actor: context.actor,
      businessId: context.access.business.id,
    });
    return result.isErr(revoked)
      ? revoked
      : result.ok({
          grant: toControlGrant(revoked.value.grant),
          revokedSessionCount: revoked.value.revokedSessionCount,
        });
  },
});
