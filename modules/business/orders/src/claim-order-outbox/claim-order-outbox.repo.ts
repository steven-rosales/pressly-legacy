import type { Database } from '@pressly/db';
import { claimStoredOrderOutbox } from '../persistence/postgres-order-outbox.shared.ts';
import type { ClaimOrderOutboxRepository } from './claim-order-outbox.port.ts';

export const makePostgresClaimOrderOutboxRepository = (
  db: Database,
): ClaimOrderOutboxRepository => ({
  claim: (input) => claimStoredOrderOutbox(db, input),
});
