import type { RetryOrderOutboxCommand } from '../../../foundations/language/order-outbox/order-outbox.model.ts';

export type RetryOrderOutbox = (
  command: RetryOrderOutboxCommand,
) => Promise<Readonly<{ retried: boolean }>>;

export type RetryOrderOutboxRepository = Readonly<{
  retry: (command: RetryOrderOutboxCommand) => Promise<boolean>;
}>;
