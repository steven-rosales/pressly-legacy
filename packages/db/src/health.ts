import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';

export const checkDatabaseHealth = async (db: Database): Promise<boolean> => {
  const rows = await db.execute(sql`select 1 as ok`);
  return rows.length > 0;
};
