import type { Database } from '@pressly/db';
import { retryStoredOrderOutbox } from '../persistence/postgres-order-outbox.shared.ts';
import type { RetryOrderOutboxRepository } from './retry-order-outbox.port.ts';

export const makePostgresRetryOrderOutboxRepository = (
  db: Database,
): RetryOrderOutboxRepository => ({
  retry: (command) => retryStoredOrderOutbox(db, command),
});
