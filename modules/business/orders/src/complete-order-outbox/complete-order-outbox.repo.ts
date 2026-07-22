import type { Database } from '@pressly/db';
import { completeStoredOrderOutbox } from '../persistence/postgres-order-outbox.shared.ts';
import type { CompleteOrderOutboxRepository } from './complete-order-outbox.port.ts';

export const makePostgresCompleteOrderOutboxRepository = (
  db: Database,
): CompleteOrderOutboxRepository => ({
  complete: (input) => completeStoredOrderOutbox(db, input),
});
