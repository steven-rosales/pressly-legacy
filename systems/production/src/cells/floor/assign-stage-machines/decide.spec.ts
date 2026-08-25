import { proveOperation } from '@pressly/testkit/operation-proof';
import { assignStageMachinesCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it } from 'vitest';
import { decideAssignStageMachines } from './decide.ts';
import type { StageTransitionContext } from '../../../model/stage-context.ts';

const command = {
  locationId: 'location-1',
  stageRunId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  expectedVersion: 2,
  idempotencyKey: 'assign-1',
  machineIds: ['10000000-0000-4000-8000-000000000003'],
} as const;

const facts: StageTransitionContext = {
  stage: {
    id: command.stageRunId,
    productionBatchId: 'batch-1',
    stage: 'washing',
    status: 'planned',
    plannedStartAt: '2026-08-21T14:00:00.000Z',
    plannedEndAt: '2026-08-21T15:00:00.000Z',
    actualStartAt: null,
    machineIds: [],
    version: 2,
  },
  batch: { id: 'batch-1', status: 'sorting', version: 1 },
  attempts: [],
  activeOrders: [],
  productionRunStatus: 'started',
  productionShiftStatus: 'open',
  productionRunStarted: true,
  batchMembershipFrozen: true,
  previousStageCompleted: true,
  sameKindAlreadyActive: false,
  batchWeightLbs: 40,
  machines: [
    {
      id: command.machineIds[0],
      stationKind: 'washing',
      effectiveCapacityLbs: 50,
      active: true,
      overlaps: false,
    },
  ],
};

describe('assign stage machines decision', () => {
  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the canonical machine assignment',
        proves: ['decision'],
        run: () => {
          expect(
            decideAssignStageMachines({
              command,
              facts,
              policy: productionRules,
            }),
          ).toEqual({ kind: 'commit', machineIds: command.machineIds });
        },
      },
    ],
  });

  it('rejects missing, stale, and incompatible assignments', () => {
    expect(
      decideAssignStageMachines({
        command,
        facts: null,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'stage_run_not_found' },
    });
    expect(
      decideAssignStageMachines({
        command,
        facts: { ...facts, stage: { ...facts.stage, version: 3 } },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'stage_run_version_conflict' },
    });
    expect(
      decideAssignStageMachines({
        command,
        facts: {
          ...facts,
          machines: [{ ...facts.machines[0]!, active: false }],
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'machine_unavailable' },
    });
  });
});
