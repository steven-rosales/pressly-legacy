import { describe, expect, it } from 'vitest';
import { evaluateFloorProgressReconciliation } from './progress-reconciliation.ts';

const stages = (statuses: readonly ('planned' | 'started' | 'completed')[]) =>
  ['sorting', 'washing', 'drying', 'folding_packaging'].map((stage, index) => ({
    stageRunId: `stage-${index + 1}`,
    stage,
    status: statuses[index] ?? 'planned',
  }));

const base = {
  runStatus: 'started',
  batchStatus: 'queued',
  stages: stages(['planned', 'planned', 'planned', 'planned']),
  target: 'sorting_started' as const,
  sameKindAlreadyActive: false,
  assignedMachineIds: [] as string[],
  overlappingMachineIds: [] as string[],
};

describe('floor progress reconciliation policy', () => {
  it('derives one forward stage projection without inventing a second state machine', () => {
    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        target: 'drying_started',
        assignedMachineIds: ['dryer-1'],
      }),
    ).toEqual({
      tag: 'ok',
      value: {
        currentMilestone: 'waiting_to_sort',
        targetMilestone: 'drying_started',
        batchStatus: 'drying',
        completedStages: ['sorting', 'washing'],
        activeStage: 'drying',
        stages: [
          {
            stageRunId: 'stage-1',
            stage: 'sorting',
            currentStatus: 'planned',
            nextStatus: 'completed',
          },
          {
            stageRunId: 'stage-2',
            stage: 'washing',
            currentStatus: 'planned',
            nextStatus: 'completed',
          },
          {
            stageRunId: 'stage-3',
            stage: 'drying',
            currentStatus: 'planned',
            nextStatus: 'started',
          },
          {
            stageRunId: 'stage-4',
            stage: 'folding_packaging',
            currentStatus: 'planned',
            nextStatus: 'planned',
          },
        ],
      },
    });
  });

  it('rejects backward, duplicate-active, and malformed stage progress', () => {
    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        batchStatus: 'washing',
        stages: stages(['completed', 'started', 'planned', 'planned']),
        target: 'sorting_completed',
        assignedMachineIds: [],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'FLOOR_PROGRESS_NOT_FORWARD' },
    });

    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        sameKindAlreadyActive: true,
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'STAGE_KIND_ALREADY_ACTIVE' },
    });

    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        batchStatus: 'washing',
        stages: stages(['started', 'started', 'planned', 'planned']),
        target: 'drying_completed',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_STAGE_SEQUENCE_INVALID' },
    });
  });

  it('keeps machine occupancy hard only for an active machine stage', () => {
    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        target: 'washing_started',
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'MACHINE_ASSIGNMENT_REQUIRED' },
    });

    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        target: 'washing_started',
        assignedMachineIds: ['washer-1'],
        overlappingMachineIds: ['washer-1'],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'MACHINE_ASSIGNMENT_OVERLAPS' },
    });

    expect(
      evaluateFloorProgressReconciliation({
        ...base,
        target: 'washing_completed',
      }),
    ).toMatchObject({ tag: 'ok' });
  });

  it('maps terminal reconciliation to all-completed stages', () => {
    expect(
      evaluateFloorProgressReconciliation({ ...base, target: 'finished' }),
    ).toMatchObject({
      tag: 'ok',
      value: {
        batchStatus: 'finished',
        completedStages: ['sorting', 'washing', 'drying', 'folding_packaging'],
        activeStage: null,
      },
    });
  });
});
