import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { manageResourcesCellDeclaration } from './cell.ts';
import { manageResourcesContract } from './contract.ts';
import type {
  ManageResourcesCommand,
  ManageResourcesExpectedFailure,
  ManageResourcesResult,
} from './types.ts';

const command: ManageResourcesCommand = {
  manifest: {
    schemaVersion: 1,
    location: {
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Facility',
      timezone: 'America/New_York',
      isActive: true,
    },
    stations: [
      {
        locationId: 'location-1',
        kind: 'washing',
        label: 'Wash',
        sortOrder: 1,
        isActive: true,
      },
    ],
    machines: [
      {
        locationId: 'location-1',
        stationKind: 'washing',
        label: 'W-01',
        manufacturerCapacityLbs: 60,
        effectiveCapacityLbs: 54,
        capacitySafetyMarginLbs: 6,
        isActive: true,
      },
    ],
    schedulerConfig: {
      locationId: 'location-1',
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
    },
  },
  dryRun: false,
  idempotencyKey: 'bootstrap-command-1',
  actorId: '10000000-0000-4000-8000-000000000001',
};

const result: ManageResourcesResult = {
  mode: 'apply',
  status: 'converged',
  configurationHash: 'a'.repeat(64),
  operations: [
    {
      resourceType: 'location',
      naturalKey: 'location-1',
      outcome: 'created',
      changedFields: ['resource'],
    },
  ],
  rejections: [],
  summary: { created: 1, updated: 0, noop: 0, rejected: 0 },
  replayed: false,
  applied: true,
};

describe('manage resources contract', () => {
  proveOperation({
    operationId: 'production.manage-resources.v1',
    declaration: manageResourcesCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the strict CLI-derived command',
        proves: ['contract'],
        run: () => {
          const serialized = manageResourcesContract.input.encode(command);
          expect(manageResourcesContract.input.decode(serialized)).toEqual({
            kind: 'valid',
            value: command,
          });
        },
      },
    ],
  });

  it('preserves UUID actor validation and rejects undeclared fields', () => {
    expect(
      manageResourcesContract.input.decode({
        ...command,
        actorId: 'not-a-uuid',
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      manageResourcesContract.input.decode({ ...command, extra: true }),
    ).toMatchObject({
      kind: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ['extra'] }),
      ]),
    });
  });

  it('round-trips exact results and expected failures', () => {
    const serialized = manageResourcesContract.output.encode(result);
    expect(manageResourcesContract.output.decode(serialized)).toEqual({
      kind: 'valid',
      value: result,
    });
    const failures: readonly ManageResourcesExpectedFailure[] = [
      {
        kind: 'validation',
        classification: 'malformed',
        code: 'production_bootstrap_machine_station_missing',
        message: 'Missing station.',
        safeMessage: 'Missing station.',
      },
      {
        kind: 'conflict',
        code: 'production_idempotency_conflict',
        message: 'Different command.',
        safeMessage: 'Different command.',
      },
    ];
    for (const failure of failures)
      expect(
        manageResourcesContract.failure.decode(
          manageResourcesContract.failure.encode(failure),
        ),
      ).toEqual({ kind: 'valid', value: failure });
  });

  it('rejects internally inconsistent result summaries', () => {
    expect(
      manageResourcesContract.output.decode({
        ...result,
        summary: { created: 0, updated: 0, noop: 0, rejected: 0 },
      }),
    ).toMatchObject({ kind: 'invalid' });
  });
});
