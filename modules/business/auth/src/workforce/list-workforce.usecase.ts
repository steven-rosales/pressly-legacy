import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import { requireIdentifier } from './workforce-validation.policy.ts';
import { decodeWorkforceCursor } from './workforce-pagination.policy.ts';
import type { WorkforceActorRef, WorkforcePage } from './workforce.model.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { WorkforceMembershipStore } from './workforce-membership.port.ts';

export type ListWorkforceCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  states?: readonly ('active' | 'suspended' | 'ended')[];
  query?: string;
  cursor?: string;
  limit?: number;
}>;

export type ListWorkforce = (
  command: ListWorkforceCommand,
) => Promise<Result<WorkforcePage, AppError>>;

export const makeListWorkforce =
  (deps: {
    store: WorkforceMembershipStore;
    clock: WorkforceClock;
  }): ListWorkforce =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const cursor =
      command.cursor === undefined
        ? result.ok(undefined)
        : decodeWorkforceCursor(command.cursor);
    if (result.isErr(cursor)) return cursor;
    const listed = await deps.store.list({
      actor: command.actor,
      businessId: businessId.value,
      ...(command.states === undefined ? {} : { states: command.states }),
      ...(command.query?.trim()
        ? { query: command.query.trim().slice(0, 120) }
        : {}),
      ...(cursor.value === undefined ? {} : { cursor: cursor.value }),
      limit: Math.min(Math.max(command.limit ?? 50, 1), 100),
      now: deps.clock.now(),
    });
    if (result.isErr(listed)) return listed;
    if (listed.value.status === 'rejected')
      return result.err(workforceStoreFailure(listed.value.reason));

    return result.ok(listed.value.page);
  };
