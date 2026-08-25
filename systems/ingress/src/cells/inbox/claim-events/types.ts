import type { ClaimedWebhookEvent } from '../../../model/inbox.ts';

export const claimEventsOperationId = 'ingress.claim-events.v1' as const;

export type ClaimEventsCommand = Readonly<{
  workerId: string;
  leaseMs: number;
  limit: number;
}>;
export type ClaimEventsResult = readonly ClaimedWebhookEvent[];
export type ClaimEventsExpectedFailure = never;

export type ClaimEventsRepository = Readonly<{
  claim: (input: {
    command: ClaimEventsCommand;
    now: Date;
  }) => Promise<ClaimEventsResult>;
}>;

export type ClaimEventsClock = Readonly<{ now: () => Date }>;
