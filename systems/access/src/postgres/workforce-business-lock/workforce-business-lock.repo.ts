import type { PostgresTransaction } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';

export const lockBusiness = async (
  tx: PostgresTransaction,
  businessId: string,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`pressly.auth.workforce.${businessId}`}))`,
  );
};
