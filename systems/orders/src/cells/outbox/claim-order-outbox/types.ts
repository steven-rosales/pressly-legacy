import type { ClaimedOrderOutboxEvent } from '../../../model/order-outbox/model.ts';

export const claimOrderOutboxOperationId =
  'orders.claim-order-outbox.v1' as const;

export type ClaimOrderOutboxCommand = Readonly<{
  workerId: string;
  limit: number;
  leaseMs: number;
}>;

export type ClaimOrderOutboxExpectedFailure = Readonly<{
  kind: 'validation';
  code: 'order_outbox_claim_invalid';
  message: string;
}>;

export type ClaimOrderOutboxResult = readonly ClaimedOrderOutboxEvent[];

export type ClaimOrderOutboxRepository = Readonly<{
  claim: (input: {
    command: ClaimOrderOutboxCommand;
    now: Date;
  }) => Promise<ClaimOrderOutboxResult>;
}>;

export type ClaimOrderOutboxClock = Readonly<{ now: () => Date }>;
