import { describe, expect, it, vi } from 'vitest';
import type {
  ChangeProductionOrderResolutionResult,
  LockedProductionOrderResolution,
} from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.model.ts';
import type { ChangeProductionOrderResolutionRepository } from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.port.ts';
import { makeChangeProductionOrderResolution } from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.usecase.ts';
import { defineWorkEventCommand } from '../../../../src/foundations/language/commands/production-idempotency.policy.ts';
import type { StoredWorkEvent } from '../../../../src/foundations/language/commands/production-command.model.ts';
import { allowPolicy } from '../../../support/production.fake.ts';

const ids = {
  order: '11111111-1111-4111-8111-111111111111',
  actor: '22222222-2222-4222-8222-222222222222',
} as const;

const now = new Date('2026-07-26T23:00:00.000Z');

const lockedOrder = (
  overrides: Partial<LockedProductionOrderResolution> = {},
): LockedProductionOrderResolution => ({
  orderId: ids.order,
  locationId: 'location-1',
  productionVersion: 4,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  sourceAdmissionState: 'unreleased',
  sourceCommercialState: 'open',
  demandPhase: 'expected',
  sourceDueAt: new Date('2026-07-27T20:00:00.000Z'),
  sourceEstimatedWeightLbs: 24,
  sourceEstimatedWeightSource: 'external_estimate',
  admissionOverride: null,
  bagCount: null,
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasHistoricalPlanSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
  ...overrides,
});

const makeRepository = (order: LockedProductionOrderResolution) => {
  const lockLocationScheduling = vi.fn(async () => undefined);
  const changeResolution = vi.fn(async (input) => {
    const value: ChangeProductionOrderResolutionResult = {
      locationId: input.locationId,
      orderId: input.orderId,
      action:
        input.lifecycle.state === 'resolved_without_production'
          ? 'resolve_without_production'
          : 'restore',
      resolutionState: input.lifecycle.state,
      transitionedAt: input.now.toISOString(),
      version: input.expectedVersion + 1,
      replayed: false,
    };
    return value;
  });
  const appendWorkEvent = vi.fn(async () => undefined);
  const findWorkEvent = vi.fn<
    (idempotencyKey: string) => Promise<StoredWorkEvent | null>
  >(async () => null);
  const operations = {
    findWorkEvent,
    lockLocationScheduling,
    lockOrder: vi.fn(async () => order),
    changeResolution,
    appendWorkEvent,
  };
  const repo: ChangeProductionOrderResolutionRepository = {
    transaction: async (work) => work(operations),
  };

  return {
    repo,
    findWorkEvent,
    lockLocationScheduling,
    changeResolution,
    appendWorkEvent,
  };
};

const resolveCommand = {
  locationId: 'location-1',
  orderId: ids.order,
  action: 'resolve_without_production' as const,
  reason: 'processor_not_in_use' as const,
  note: null,
  confirmReviewedFacts: false,
  expectedVersion: 4,
  idempotencyKey: 'resolve-order-1',
  actorId: ids.actor,
};

describe('change production order resolution', () => {
  it('resolves clean unassigned work without changing execution meaning', async () => {
    const repository = makeRepository(lockedOrder());
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(change(resolveCommand)).resolves.toEqual({
      tag: 'ok',
      value: {
        locationId: 'location-1',
        orderId: ids.order,
        action: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        transitionedAt: now.toISOString(),
        version: 5,
        replayed: false,
      },
    });
    expect(repository.lockLocationScheduling).toHaveBeenCalledWith(
      'location-1',
    );
    expect(repository.changeResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          from: 'open',
          state: 'resolved_without_production',
        },
        clearPendingPlacement: false,
        restoredSourceProjection: null,
      }),
    );
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_order_resolved_without_production',
        entityType: 'production_order',
        entityId: ids.order,
      }),
    );
  });

  it('rechecks a canonical source-state precondition under the scheduling lock', async () => {
    const repository = makeRepository(
      lockedOrder({ sourceAdmissionState: 'released' }),
    );
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      change({
        ...resolveCommand,
        sourceStatePrecondition: {
          commercialState: 'open',
          admissionState: 'unreleased',
        },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_source_state_conflict',
        kind: 'conflict',
      },
    });
    expect(repository.lockLocationScheduling).toHaveBeenCalledOnce();
    expect(repository.changeResolution).not.toHaveBeenCalled();
  });

  it('replays an identical command that commits while this call waits for the location lock', async () => {
    const repository = makeRepository(lockedOrder());
    const storedResult: ChangeProductionOrderResolutionResult = {
      locationId: 'location-1',
      orderId: ids.order,
      action: 'resolve_without_production',
      resolutionState: 'resolved_without_production',
      transitionedAt: now.toISOString(),
      version: 5,
      replayed: false,
    };
    repository.findWorkEvent.mockResolvedValueOnce(null).mockResolvedValueOnce({
      valid: true,
      command: defineWorkEventCommand({
        operation: 'production_order_resolved_without_production',
        locationId: resolveCommand.locationId,
        actorId: resolveCommand.actorId,
        entityType: 'production_order',
        entityId: resolveCommand.orderId,
        expectedVersion: resolveCommand.expectedVersion,
        payload: {
          action: resolveCommand.action,
          reason: resolveCommand.reason,
          note: resolveCommand.note,
          confirmReviewedFacts: resolveCommand.confirmReviewedFacts,
        },
      }),
      result: storedResult,
    });
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(change(resolveCommand)).resolves.toEqual({
      tag: 'ok',
      value: { ...storedResult, replayed: true },
    });
    expect(repository.findWorkEvent).toHaveBeenCalledTimes(2);
    expect(repository.lockLocationScheduling).toHaveBeenCalledOnce();
    expect(repository.changeResolution).not.toHaveBeenCalled();
  });

  it('requires explicit review and clears only an uncommitted pending placement', async () => {
    const repository = makeRepository(
      lockedOrder({
        hasIntake: true,
        isPriority: true,
        hasPendingPlacement: true,
      }),
    );
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(change(resolveCommand)).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_resolution_review_required',
        kind: 'conflict',
      },
    });
    expect(repository.changeResolution).not.toHaveBeenCalled();

    await expect(
      change({
        ...resolveCommand,
        idempotencyKey: 'resolve-order-2',
        confirmReviewedFacts: true,
      }),
    ).resolves.toMatchObject({ tag: 'ok' });
    expect(repository.changeResolution).toHaveBeenLastCalledWith(
      expect.objectContaining({ clearPendingPlacement: true }),
    );
  });

  it.each([
    { executionStatus: 'scheduled' as const },
    { hasShiftSelection: true },
    { hasHistoricalPlanSelection: true },
    { hasBatchMembership: true },
    { hasStageAttempt: true },
    { hasRoute: true },
  ])('blocks committed or historical participation: %o', async (facts) => {
    const repository = makeRepository(lockedOrder(facts));
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      change({ ...resolveCommand, confirmReviewedFacts: true }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_resolution_blocked',
        kind: 'conflict',
      },
    });
    expect(repository.changeResolution).not.toHaveBeenCalled();
  });

  it('restores through the graph and re-derives readiness from retained facts', async () => {
    const repository = makeRepository(
      lockedOrder({
        resolutionState: 'resolved_without_production',
        sourceAdmissionState: 'released',
        demandPhase: 'production_released',
        bagCount: 2,
      }),
    );
    const change = makeChangeProductionOrderResolution({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        action: 'restore',
        reason: 'work_should_be_produced',
        note: null,
        expectedVersion: 4,
        idempotencyKey: 'restore-order-1',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { resolutionState: 'open', action: 'restore' },
    });
    expect(repository.changeResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycle: {
          from: 'resolved_without_production',
          state: 'open',
        },
        restoredSourceProjection: {
          dueAt: new Date('2026-07-27T20:00:00.000Z'),
          derivedWeightLbs: 24,
          derivedWeightSource: 'external_estimate',
          operationalStatus: 'eligible',
          clearAdmissionOverride: true,
        },
      }),
    );
  });

  it('derives restoration from the current source status and rejects a missing current estimate', async () => {
    const terminal = makeRepository(
      lockedOrder({
        resolutionState: 'resolved_without_production',
        sourceAdmissionState: 'released',
        sourceCommercialState: 'completed',
        demandPhase: 'production_released',
        sourceDueAt: new Date('2026-08-01T20:00:00.000Z'),
        sourceEstimatedWeightLbs: 48,
        sourceEstimatedWeightSource: 'external_estimate',
        bagCount: 2,
      }),
    );
    const restore = makeChangeProductionOrderResolution({
      repo: terminal.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const command = {
      locationId: 'location-1',
      orderId: ids.order,
      action: 'restore' as const,
      reason: 'work_should_be_produced' as const,
      note: null,
      expectedVersion: 4,
      idempotencyKey: 'restore-current-source-1',
      actorId: ids.actor,
    };

    await expect(restore(command)).resolves.toMatchObject({ tag: 'ok' });
    expect(terminal.changeResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        restoredSourceProjection: {
          dueAt: new Date('2026-08-01T20:00:00.000Z'),
          derivedWeightLbs: 48,
          derivedWeightSource: 'external_estimate',
          operationalStatus: 'ineligible',
          clearAdmissionOverride: true,
        },
      }),
    );

    const missingEstimate = makeRepository(
      lockedOrder({
        resolutionState: 'resolved_without_production',
        sourceEstimatedWeightLbs: null,
        sourceEstimatedWeightSource: null,
      }),
    );
    const restoreMissing = makeChangeProductionOrderResolution({
      repo: missingEstimate.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    await expect(
      restoreMissing({
        ...command,
        idempotencyKey: 'restore-current-source-2',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_order_restore_demand_invalid',
        kind: 'conflict',
      },
    });
    expect(missingEstimate.changeResolution).not.toHaveBeenCalled();
  });
});
