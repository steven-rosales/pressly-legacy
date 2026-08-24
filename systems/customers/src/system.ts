import type { PostgresDatabase } from '@pressly/postgres/client';
import { makeCustomerReferenceV1Capability } from './capabilities/customer-reference-v1.ts';
import { makeCreateCustomerCell } from './cells/profiles/create-customer/cell.ts';
import { makeCreateCustomerPostgresRepository } from './cells/profiles/create-customer/postgres.ts';
import { makeGetCustomerCell } from './cells/profiles/get-customer/cell.ts';
import { makeGetCustomerPostgresRepository } from './cells/profiles/get-customer/postgres.ts';
import { makeListCustomersCell } from './cells/profiles/list-customers/cell.ts';
import { makeListCustomersPostgresRepository } from './cells/profiles/list-customers/postgres.ts';
import { makeUpdateCustomerCell } from './cells/profiles/update-customer/cell.ts';
import { makeUpdateCustomerPostgresRepository } from './cells/profiles/update-customer/postgres.ts';
import { makeResolveExactSourceCustomerV1Capability } from './cells/sources/resolve-exact-source-customer/capability.ts';
import { makeResolveExactSourceCustomerCell } from './cells/sources/resolve-exact-source-customer/cell.ts';
import { makeResolveExactSourceCustomerPostgresRepository } from './cells/sources/resolve-exact-source-customer/postgres.ts';
import type { CustomersSchema } from './schema/customers.ts';

export type CustomersSystemClock = Readonly<{ now: () => Date }>;

export type CustomersSystemDependencies = Readonly<{
  db: PostgresDatabase;
  schema: CustomersSchema;
  clock: CustomersSystemClock;
}>;

export const makeCustomersSystem = (
  dependencies: CustomersSystemDependencies,
) => {
  const createCustomer = makeCreateCustomerCell({
    repo: makeCreateCustomerPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });
  const updateCustomer = makeUpdateCustomerCell({
    repo: makeUpdateCustomerPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
    clock: dependencies.clock,
  });
  const getCustomer = makeGetCustomerCell(
    makeGetCustomerPostgresRepository(dependencies.db, dependencies.schema),
  );
  const listCustomers = makeListCustomersCell(
    makeListCustomersPostgresRepository(dependencies.db, dependencies.schema),
  );
  const resolveExactSourceCustomer = makeResolveExactSourceCustomerCell(
    makeResolveExactSourceCustomerPostgresRepository(
      dependencies.db,
      dependencies.schema,
    ),
  );

  return Object.freeze({
    cells: Object.freeze({
      createCustomer,
      updateCustomer,
      getCustomer,
      listCustomers,
      resolveExactSourceCustomer,
    }),
    capabilities: Object.freeze({
      customerReferenceV1: makeCustomerReferenceV1Capability(
        getCustomer.execute,
      ),
      resolveExactSourceCustomerV1: makeResolveExactSourceCustomerV1Capability(
        resolveExactSourceCustomer.execute,
      ),
    }),
  });
};

export type CustomersSystem = ReturnType<typeof makeCustomersSystem>;
