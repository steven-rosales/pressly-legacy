import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import { requireIdentifier } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import { decodeWorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforcePage } from '../../../../foundations/language/workforce-membership/workforce-membership.model.ts';
import type { ListWorkforceStore } from './list-workforce.port.ts';

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
) => Promise<Result<WorkforcePage, WorkforceFailure>>;

export const makeListWorkforce =
  (deps: { store: ListWorkforceStore; clock: Clock }): ListWorkforce =>
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
    if (listed.status === 'rejected')
      return result.err(workforceStoreFailure(listed.reason));

    return result.ok(listed.page);
  };
