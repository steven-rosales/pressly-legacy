import { describe, expect, it } from 'vitest';
import {
  toAdvanceProductionStageResult,
  toCompleteProductionStageCommand,
  toStartProductionStageCommand,
} from '../../../../src/features/floor/advance-stage/advance-production-stage.contract.mapper.ts';

const scope = {
  locationId: 'location-1',
  stageRunId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
} as const;

describe('advance Production stage mapper', () => {
  it('combines a parsed start request with authenticated route scope', () => {
    expect(
      toStartProductionStageCommand(
        {
          expectedVersion: 3,
          idempotencyKey: 'start-stage-123',
        },
        scope,
      ),
    ).toEqual({
      ...scope,
      expectedVersion: 3,
      idempotencyKey: 'start-stage-123',
      transition: 'start',
    });
  });

  it('preserves a parsed completion confirmation in the application command', () => {
    const confirmation = {
      observedAt: '2026-07-14T14:20:00.000Z',
      confirmationHash:
        'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
    } as const;

    expect(
      toCompleteProductionStageCommand(
        {
          expectedVersion: 3,
          idempotencyKey: 'complete-stage-123',
          confirmation,
        },
        scope,
      ),
    ).toEqual({
      ...scope,
      expectedVersion: 3,
      idempotencyKey: 'complete-stage-123',
      transition: 'complete',
      confirmation,
    });
  });

  it('maps a successful mutation into its serialized response', () => {
    expect(
      toAdvanceProductionStageResult({
        entityId: scope.stageRunId,
        version: 4,
        replayed: false,
      }),
    ).toEqual({
      entityId: scope.stageRunId,
      version: 4,
      replayed: false,
    });
  });

  it('maps each confirmation result into its serialized response', () => {
    const confirmation = {
      observedAt: '2026-07-14T14:20:00.000Z',
      confirmationHash:
        'a6da4f7659bca9627f63969bc4d5d413665fda2aaec6c94ae0837ea03e075d98',
    } as const;
    const startResult = {
      status: 'confirmation_required' as const,
      stageRunId: scope.stageRunId,
      stageVersion: 3,
      code: 'PLANNED_START_NOT_REACHED' as const,
      message: 'This stage is scheduled to start later.',
      confirmation,
      timing: {
        plannedStartAt: '2026-07-14T15:00:00.000Z',
        plannedEndAt: '2026-07-14T15:56:00.000Z',
        observedAt: confirmation.observedAt,
        remainingMilliseconds: 2_400_000,
      },
      replayed: false as const,
    };
    const completionResult = {
      status: 'confirmation_required' as const,
      stageRunId: scope.stageRunId,
      stageVersion: 3,
      code: 'PULSE_BOUNDARY_NOT_REACHED' as const,
      message: 'This stage has not yet occupied its planned pulse.',
      confirmation,
      timing: {
        actualStartAt: '2026-07-14T14:00:00.000Z',
        plannedEndAt: '2026-07-14T14:56:00.000Z',
        completionBoundaryAt: '2026-07-14T14:56:00.000Z',
        observedAt: confirmation.observedAt,
        plannedDurationMilliseconds: 3_360_000,
        elapsedMilliseconds: 1_200_000,
        remainingMilliseconds: 2_160_000,
      },
      replayed: false as const,
    };

    expect(toAdvanceProductionStageResult(startResult)).toEqual(startResult);
    expect(toAdvanceProductionStageResult(completionResult)).toEqual(
      completionResult,
    );
  });
});
