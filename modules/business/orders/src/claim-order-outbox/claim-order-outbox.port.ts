import type {
  ClaimOrderOutboxCommand,
  OrderOutboxEvent,
} from '../orders.port.ts';

export type ClaimOrderOutboxRepository = Readonly<{
  claim: (input: {
    command: ClaimOrderOutboxCommand;
    now: Date;
  }) => Promise<readonly OrderOutboxEvent[]>;
}>;
