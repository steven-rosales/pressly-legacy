import { type DatabaseExecutor } from '@pressly/db/client';
import { sql } from '@pressly/db/query';

/**
 * Serializes every operation that can change or consume the eligible-order
 * scheduling snapshot for one production location.
 *
 * PostgreSQL row locks cannot protect a predicate from a newly inserted
 * eligible order at READ COMMITTED. This transaction-scoped advisory lock is
 * therefore the aggregate lock for the location's scheduling view.
 */
export const lockLocationScheduling = async (
  db: DatabaseExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};
