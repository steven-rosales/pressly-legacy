import type { DeadLetterOrderOutboxCommand } from '../order-outbox/order-outbox.port.ts';

export type DeadLetterOrderOutboxRepository = Readonly<{
  deadLetter: (input: {
    command: DeadLetterOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
