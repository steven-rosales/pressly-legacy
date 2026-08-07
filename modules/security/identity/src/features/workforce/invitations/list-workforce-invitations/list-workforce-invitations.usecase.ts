import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import { requireIdentifier } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import { decodeWorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforceInvitationEntity } from '../../../../foundations/language/workforce-invitation/workforce-invitation.entity.ts';
import type { ListWorkforceInvitationsStore } from './list-workforce-invitations.port.ts';

export type ListWorkforceInvitationsCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  includeTerminal?: boolean;
  cursor?: string;
  limit?: number;
}>;

export type ListWorkforceInvitationsResult = Readonly<{
  invitations: readonly WorkforceInvitationEntity[];
  nextCursor: string | null;
}>;

export type ListWorkforceInvitations = (
  command: ListWorkforceInvitationsCommand,
) => Promise<Result<ListWorkforceInvitationsResult, WorkforceFailure>>;

export const makeListWorkforceInvitations =
  (deps: {
    store: ListWorkforceInvitationsStore;
    clock: Clock;
  }): ListWorkforceInvitations =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const limit = Math.min(Math.max(command.limit ?? 50, 1), 100);
    const cursor =
      command.cursor === undefined
        ? result.ok(undefined)
        : decodeWorkforceCursor(command.cursor);
    if (result.isErr(cursor)) return cursor;
    const listed = await deps.store.list({
      actor: command.actor,
      businessId: businessId.value,
      includeTerminal: command.includeTerminal ?? false,
      limit,
      ...(cursor.value === undefined ? {} : { cursor: cursor.value }),
      now: deps.clock.now(),
    });
    if (listed.status === 'rejected')
      return result.err(workforceStoreFailure(listed.reason));

    return result.ok({
      invitations: listed.invitations,
      nextCursor: listed.nextCursor,
    });
  };
