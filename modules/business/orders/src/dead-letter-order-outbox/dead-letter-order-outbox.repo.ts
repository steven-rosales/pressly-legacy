import type { Database } from '@pressly/db';
import { deadLetterStoredOrderOutbox } from '../persistence/postgres-order-outbox.shared.ts';
import type { DeadLetterOrderOutboxRepository } from './dead-letter-order-outbox.port.ts';

export const makePostgresDeadLetterOrderOutboxRepository = (
  db: Database,
): DeadLetterOrderOutboxRepository => ({
  deadLetter: (input) => deadLetterStoredOrderOutbox(db, input),
});
