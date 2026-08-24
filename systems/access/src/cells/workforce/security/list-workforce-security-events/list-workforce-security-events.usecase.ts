import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import { utcIsoFromDate, type Clock } from '@pressly/time';
import { requireIdentifier } from '../../../../model/language/workforce-command/workforce-command.policy.ts';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../model/language/workforce-failure/workforce-failure.failure.ts';
import { decodeWorkforceCursor } from '../../../../model/language/workforce-pagination/workforce-cursor.value.ts';
import type { WorkforceActorRef } from '../../../../model/language/workforce/workforce.model.ts';
import type { ListWorkforceSecurityEventsStore } from './list-workforce-security-events.port.ts';

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
    WorkforceFailure
  >
>;

export const makeListWorkforceSecurityEvents =
  (deps: {
    store: ListWorkforceSecurityEventsStore;
    clock: Clock;
  }): ListWorkforceSecurityEvents =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
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
    if (listed.status === 'rejected')
      return result.err(workforceStoreFailure(listed.reason));
    return result.ok({
      events: listed.events.map((event) => ({
        ...event,
        createdAt: utcIsoFromDate(event.createdAt),
      })),
      nextCursor: listed.nextCursor,
    });
  };
