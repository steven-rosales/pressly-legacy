import type { CompleteOrderOutboxCommand } from '../order-outbox/order-outbox.port.ts';

export type CompleteOrderOutboxRepository = Readonly<{
  complete: (input: {
    command: CompleteOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
