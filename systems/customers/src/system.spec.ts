import type { PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { customerReferenceV1CapabilityContract } from './contracts/customer-reference-v1.ts';
import { resolveExactSourceCustomerV1CapabilityContract } from './contracts/resolve-exact-source-customer-v1.ts';
import { makeCustomersSystem } from './system.ts';
import { customersTestSchema } from './testing/schema.ts';

describe('Customers system owner assembly', () => {
  const makeSystem = () =>
    makeCustomersSystem({
      db: {} as PostgresDatabase,
      schema: customersTestSchema,
      clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
    });

  it('assembles exactly five Customer cells and two data-only capabilities', () => {
    const system = makeSystem();

    expect(Object.keys(system.cells)).toEqual([
      'createCustomer',
      'updateCustomer',
      'getCustomer',
      'listCustomers',
      'resolveExactSourceCustomer',
    ]);
    expect(Object.values(system.cells).map((cell) => cell.id)).toEqual([
      'customers.create-customer.v1',
      'customers.update-customer.v1',
      'customers.get-customer.v1',
      'customers.list-customers.v1',
      'customers.resolve-exact-source-customer.v1',
    ]);
    expect(
      Object.values(system.cells).every((cell) => cell.surfaces.length === 0),
    ).toBe(true);
    expect(Object.keys(system.capabilities)).toEqual([
      'customerReferenceV1',
      'resolveExactSourceCustomerV1',
    ]);
    expect(system.capabilities.customerReferenceV1.contract).toBe(
      customerReferenceV1CapabilityContract,
    );
    expect(system.capabilities.resolveExactSourceCustomerV1.contract).toBe(
      resolveExactSourceCustomerV1CapabilityContract,
    );
  });
});
