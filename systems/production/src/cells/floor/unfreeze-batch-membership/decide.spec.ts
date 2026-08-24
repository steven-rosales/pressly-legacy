import { proveOperation } from '@pressly/testkit/operation-proof';
import { unfreezeBatchMembershipCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it } from 'vitest';
import { decideUnfreezeBatchMembership } from './decide.ts';

const command = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionBatchId: '10000000-0000-4000-8000-000000000002',
  expectedQueueVersion: 4,
  expectedBatchVersion: 7,
  idempotencyKey: 'unfreeze-1',
  actorId: '10000000-0000-4000-8000-000000000003',
} as const;
const facts = {
  productionRun: {
    id: command.productionRunId,
    status: 'started',
    queueVersion: 4,
  },
  productionBatch: {
    id: command.productionBatchId,
    status: 'queued',
    version: 7,
    membershipFrozenAt: new Date('2026-08-21T14:00:00.000Z'),
    membershipFrozenBy: command.actorId,
  },
};

describe('unfreeze batch membership decision', () => {
  proveOperation({
    operationId: 'production.unfreeze-batch-membership.v1',
    declaration: unfreezeBatchMembershipCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'allows a current frozen queued batch',
        proves: ['decision'],
        run: () => {
          expect(
            decideUnfreezeBatchMembership({
              command,
              facts,
              policy: productionRules,
            }),
          ).toEqual({ kind: 'commit' });
        },
      },
    ],
  });
  it('rejects already mutable and stale batches', () => {
    expect(
      decideUnfreezeBatchMembership({
        command,
        facts: {
          ...facts,
          productionBatch: {
            ...facts.productionBatch,
            membershipFrozenAt: null,
          },
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'batch_already_mutable' },
    });
    expect(
      decideUnfreezeBatchMembership({
        command,
        facts: {
          ...facts,
          productionBatch: { ...facts.productionBatch, version: 8 },
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_batch_version_conflict' },
    });
  });
});
