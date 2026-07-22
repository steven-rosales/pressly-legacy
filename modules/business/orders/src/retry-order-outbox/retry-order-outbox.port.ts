import type { RetryOrderOutboxCommand } from '../orders.port.ts';

export type RetryOrderOutboxRepository = Readonly<{
  retry: (command: RetryOrderOutboxCommand) => Promise<boolean>;
}>;
