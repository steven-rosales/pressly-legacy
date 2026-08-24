import type { DeadWebhookEvent } from '../../../model/inbox.ts';

export const listDeadEventsOperationId = 'ingress.list-dead-events.v1' as const;
export type ListDeadEventsExpectedFailure = never;
export type ListDeadEventsRepository = Readonly<{
  list: (input: {
    source?: string;
    afterEventId?: string;
    limit: number;
  }) => Promise<readonly DeadWebhookEvent[]>;
}>;
export type ListDeadEventsClock = Readonly<{ now: () => Date }>;
