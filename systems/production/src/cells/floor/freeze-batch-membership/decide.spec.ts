import { proveOperation } from '@pressly/testkit/operation-proof';
import { freezeBatchMembershipCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it } from 'vitest';
import { decideFreezeBatchMembership } from './decide.ts';

const command = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionBatchId: '10000000-0000-4000-8000-000000000002',
  expectedQueueVersion: 4,
  expectedBatchVersion: 7,
  idempotencyKey: 'freeze-1',
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
    membershipFrozenAt: null,
    membershipFrozenBy: null,
  },
};

describe('freeze batch membership decision', () => {
  proveOperation({
    operationId: 'production.freeze-batch-membership.v1',
    declaration: freezeBatchMembershipCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'allows one current queued freeze',
        proves: ['decision'],
        run: () => {
          expect(
            decideFreezeBatchMembership({
              command,
              facts,
              policy: productionRules,
            }),
          ).toEqual({ kind: 'commit' });
        },
      },
    ],
  });
  it('rejects queue drift and immutable membership', () => {
    expect(
      decideFreezeBatchMembership({
        command,
        facts: {
          ...facts,
          productionRun: { ...facts.productionRun, queueVersion: 5 },
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_queue_version_conflict' },
    });
    expect(
      decideFreezeBatchMembership({
        command,
        facts: {
          ...facts,
          productionBatch: { ...facts.productionBatch, status: 'sorting' },
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'batch_membership_immutable' },
    });
  });
});
