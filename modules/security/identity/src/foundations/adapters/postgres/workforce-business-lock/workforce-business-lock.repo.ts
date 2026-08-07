import type { DatabaseTransaction } from '@pressly/db/client';
import { sql } from '@pressly/db/query';

export const lockBusiness = async (
  tx: DatabaseTransaction,
  businessId: string,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`pressly.auth.workforce.${businessId}`}))`,
  );
};
