import type { CompleteOrderOutboxCommand } from '../orders.port.ts';

export type CompleteOrderOutboxRepository = Readonly<{
  complete: (input: {
    command: CompleteOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
