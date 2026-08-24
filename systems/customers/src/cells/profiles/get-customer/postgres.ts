import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, count, eq } from '@pressly/postgres/query';
import { projectCustomerSummary } from '../../../model/customer.ts';
import type { CustomersSchema } from '../../../schema/customers.ts';
import type { GetCustomerRepository } from './types.ts';

export const makeGetCustomerPostgresRepository = (
  database: PostgresDatabase,
  customers: Pick<CustomersSchema, 'userDuplicateCandidates' | 'users'>,
): GetCustomerRepository =>
  async function getCustomer(query) {
    const [row] = await database
      .select()
      .from(customers.users)
      .where(
        and(
          eq(customers.users.businessId, query.businessId),
          eq(customers.users.id, query.userId),
        ),
      )
      .limit(1);
    if (row === undefined) return null;

    const [duplicate] = await database
      .select({ value: count() })
      .from(customers.userDuplicateCandidates)
      .where(
        and(
          eq(customers.userDuplicateCandidates.userId, row.id),
          eq(customers.userDuplicateCandidates.status, 'open'),
        ),
      );

    return projectCustomerSummary(row, Number(duplicate?.value ?? 0));
  };
