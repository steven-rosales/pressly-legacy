import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as customerReferenceSurface from '@pressly/customers-system/capabilities/customer-reference-v1';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const selectedSources = [
  'topology/pressly.topology.ts',
  'generated/architecture-map.ts',
  'generated/http-catalog.ts',
  'generated/job-catalog.ts',
  'generated/event-stream-catalog.ts',
].map((path) => readFileSync(`${repositoryRoot}/${path}`, 'utf8'));

describe('Customers operation inventory', () => {
  it('selects all five cells through their owner', () => {
    const selected = selectedSources.join('\n');
    expect(selected).toContain('@pressly/customers-system');
    for (const operationId of [
      'customers.create-customer.v1',
      'customers.update-customer.v1',
      'customers.get-customer.v1',
      'customers.list-customers.v1',
      'customers.resolve-exact-source-customer.v1',
    ])
      expect(selected).toContain(operationId);
  });

  it('publishes contract-only versioned collaboration subpaths', () => {
    expect(Object.keys(customerReferenceSurface)).toEqual([
      'customerReferenceV1CapabilityContract',
    ]);
    expect(
      customerReferenceSurface.customerReferenceV1CapabilityContract,
    ).toEqual({
      id: 'customers.customer-reference.v1',
      version: 1,
      execution: 'owner-owned',
    });
  });
});
