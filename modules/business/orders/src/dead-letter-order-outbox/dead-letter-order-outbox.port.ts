import type { DeadLetterOrderOutboxCommand } from '../orders.port.ts';

export type DeadLetterOrderOutboxRepository = Readonly<{
  deadLetter: (input: {
    command: DeadLetterOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
