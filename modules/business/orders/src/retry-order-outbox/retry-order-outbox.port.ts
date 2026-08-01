import type { RetryOrderOutboxCommand } from '../order-outbox/order-outbox.port.ts';

export type RetryOrderOutboxRepository = Readonly<{
  retry: (command: RetryOrderOutboxCommand) => Promise<boolean>;
}>;
