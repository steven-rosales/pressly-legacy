import type { CompleteOrderOutboxCommand } from '../../../foundations/language/order-outbox/order-outbox.model.ts';

export type CompleteOrderOutbox = (
  command: CompleteOrderOutboxCommand,
) => Promise<Readonly<{ completed: boolean }>>;

export type CompleteOrderOutboxRepository = Readonly<{
  complete: (input: {
    command: CompleteOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;
