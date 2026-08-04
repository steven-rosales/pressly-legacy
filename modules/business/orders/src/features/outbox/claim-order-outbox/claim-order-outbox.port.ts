import type { Result } from '@pressly/kernel';
import type {
  ClaimOrderOutboxCommand,
  OrderOutboxEvent,
} from '../../../foundations/language/order-outbox/order-outbox.model.ts';
import type { ClaimOrderOutboxFailure } from './claim-order-outbox.failure.ts';

export type ClaimOrderOutbox = (
  command: ClaimOrderOutboxCommand,
) => Promise<Result<readonly OrderOutboxEvent[], ClaimOrderOutboxFailure>>;

export type ClaimOrderOutboxRepository = Readonly<{
  claim: (input: {
    command: ClaimOrderOutboxCommand;
    now: Date;
  }) => Promise<readonly OrderOutboxEvent[]>;
}>;
