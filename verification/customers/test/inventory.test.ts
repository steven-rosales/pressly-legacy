import { describe, expect, it } from 'vitest';
import { customerReferenceV1CapabilityContract } from '@pressly/customers-system/capabilities/customer-reference-v1';
import { presslyTopology } from '@pressly/topology/pressly';

const customerOperations = new Set(
  presslyTopology.systems
    .find((owner) => owner.id === 'customers')
    ?.cells.map((manifest) => manifest.id),
);

describe('Customers operation inventory', () => {
  it('selects all five cells through the owner composition', () => {
    expect([...customerOperations].sort()).toEqual([
      'customers.create-customer.v1',
      'customers.get-customer.v1',
      'customers.list-customers.v1',
      'customers.resolve-exact-source-customer.v1',
      'customers.update-customer.v1',
    ]);
  });

  it('publishes a contract-only versioned collaboration subpath', () => {
    expect(customerReferenceV1CapabilityContract).toEqual({
      id: 'customers.customer-reference.v1',
      version: 1,
      execution: 'owner-owned',
    });
  });
});
