import type { Result } from '@pressly/kernel';
import type { DeadLetterOrderOutboxCommand } from '../../../foundations/language/order-outbox/order-outbox.model.ts';
import type { DeadLetterOrderOutboxFailure } from './dead-letter-order-outbox.failure.ts';

export type DeadLetterOrderOutbox = (
  command: DeadLetterOrderOutboxCommand,
) => Promise<
  Result<Readonly<{ deadLettered: boolean }>, DeadLetterOrderOutboxFailure>
>;

export type DeadLetterOrderOutboxRepository = Readonly<{
  deadLetter: (input: {
    command: DeadLetterOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
