import type {
  ClaimOrderOutboxCommand,
  OrderOutboxEvent,
} from '../order-outbox/order-outbox.port.ts';

export type ClaimOrderOutboxRepository = Readonly<{
  claim: (input: {
    command: ClaimOrderOutboxCommand;
    now: Date;
  }) => Promise<readonly OrderOutboxEvent[]>;
}>;
