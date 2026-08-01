import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import { requireIdentifier } from './workforce-validation.policy.ts';
import { decodeWorkforceCursor } from './workforce-pagination.policy.ts';
import type {
  WorkforceActorRef,
  WorkforceInvitationSummary,
} from './workforce.port.ts';
import type {
  WorkforceClock,
  WorkforceInvitationStore,
} from './workforce-invitation.port.ts';

export type ListWorkforceInvitationsCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  includeTerminal?: boolean;
  cursor?: string;
  limit?: number;
}>;

export type ListWorkforceInvitationsResult = Readonly<{
  invitations: readonly WorkforceInvitationSummary[];
  nextCursor: string | null;
}>;

export type ListWorkforceInvitations = (
  command: ListWorkforceInvitationsCommand,
) => Promise<Result<ListWorkforceInvitationsResult, AppError>>;

export const makeListWorkforceInvitations =
  (deps: {
    store: WorkforceInvitationStore;
    clock: WorkforceClock;
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
    if (result.isErr(listed)) return listed;
    if (listed.value.status === 'rejected')
      return result.err(workforceStoreFailure(listed.value.reason));

    return result.ok({
      invitations: listed.value.invitations,
      nextCursor: listed.value.nextCursor,
    });
  };
