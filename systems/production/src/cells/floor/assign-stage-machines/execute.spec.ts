import { proveOperation } from '@pressly/testkit/operation-proof';
import { assignStageMachinesCellDeclaration } from './cell.ts';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteAssignStageMachines } from './execute.ts';
import { assignStageMachinesIdempotency } from './idempotency.ts';
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

describe('assign stage machines executor', () => {
  proveOperation({
    operationId: 'production.assign-stage-machines.v1',
    declaration: assignStageMachinesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'runs one locked, audited assignment protocol',
        proves: ['executor-success'],
        run: async () => {
          const calls: string[] = [];
          const appendWorkEvent = vi.fn(async (_event: unknown) => undefined);
          const execute = makeExecuteAssignStageMachines({
            repo: {
              transaction: async (work) =>
                work({
                  findWorkEvent: async () => {
                    calls.push('find');
                    return null;
                  },
                  loadStageTransitionContext: async () => {
                    calls.push('lock');
                    return facts;
                  },
                  assignStageMachines: async () => {
                    calls.push('assign');
                    return {
                      entityId: command.stageRunId,
                      version: 3,
                      replayed: false,
                    };
                  },
                  appendWorkEvent: async (event) => {
                    calls.push('event');
                    await appendWorkEvent(event);
                  },
                }),
            },
            idempotency: assignStageMachinesIdempotency,
            policy: productionRules,
            clock: { now: () => new Date('2026-08-21T15:00:00.000Z') },
          });
          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: {
              entityId: command.stageRunId,
              version: 3,
              replayed: false,
            },
          });
          expect(calls).toEqual(['find', 'lock', 'find', 'assign', 'event']);
          expect(appendWorkEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              eventType: 'machine_assigned',
              payload: { machineIds: command.machineIds, version: 3 },
            }),
          );
        },
      },
    ],
  });

  it('replays without locks or effects', async () => {
    const lock = vi.fn();
    const assign = vi.fn();
    const append = vi.fn();
    const execute = makeExecuteAssignStageMachines({
      repo: {
        transaction: async (work) =>
          work({
            findWorkEvent: async () => ({
              valid: true,
              command: {
                operation: 'machine_assigned',
                locationId: command.locationId,
                actorId: command.actorId,
                target: {
                  entityType: 'stage_run',
                  entityId: command.stageRunId,
                },
                expectedVersion: 2,
                payload: { machineIds: [...command.machineIds] },
              },
              result: {
                entityId: command.stageRunId,
                version: 3,
                replayed: false,
              },
            }),
            loadStageTransitionContext: lock,
            assignStageMachines: assign,
            appendWorkEvent: append,
          }),
      },
      idempotency: assignStageMachinesIdempotency,
      policy: productionRules,
      clock: { now: () => new Date() },
    });
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { version: 3, replayed: true },
    });
    expect(lock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });
});
