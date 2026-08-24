import { describe, expect, it } from 'vitest';
import { manageResourcesCellDeclaration } from './cell.ts';
import type { ManageResourcesCommand } from './types.ts';

describe('manage resources cell declaration', () => {
  it('declares the selected transactional CLI command without a surface', () => {
    const input: ManageResourcesCommand = {
      manifest: {
        schemaVersion: 1,
        location: {
          id: 'location-1',
          businessId: '10000000-0000-4000-8000-000000000001',
          name: 'Facility',
          timezone: 'America/New_York',
          isActive: true,
        },
        stations: [],
        machines: [],
        schedulerConfig: {
          locationId: 'location-1',
          pulseMinutes: 56,
          foldLbsPerFolderMinute: 2,
          algorithmVersion: 'fixed-pulse-ffd-v2',
          stageFitAssertion: {
            sortingFits: true,
            washingFits: true,
            dryingFits: true,
          },
        },
      },
      dryRun: false,
      idempotencyKey: 'manage-resources-command-1',
      actorId: '10000000-0000-4000-8000-000000000002',
    };
    expect(manageResourcesCellDeclaration).toMatchObject({
      id: 'production.manage-resources.v1',
      kind: 'command',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'required', concurrency: 'partitioned' },
      idempotency: { required: true },
      surfaces: [],
      emits: [],
      consumes: [],
      retry: null,
      observability: { operation: 'production.manage_resources' },
    });
    expect(
      manageResourcesCellDeclaration.consistency.concurrencyKey?.(input),
    ).toBe('location-1');
  });
});
