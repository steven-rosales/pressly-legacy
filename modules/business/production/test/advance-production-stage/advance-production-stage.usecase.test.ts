import type {
  ProductionMutationResult,
  ProductionStageCompletionConfirmationRequiredResult,
  ProductionStageStartConfirmationRequiredResult,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionPolicyPort } from '../../src/production-policy/production-policy.port.ts';
import type { StageTransitionContext } from '../../src/production-lifecycle/stage-transition.port.ts';
import type {
  StoredWorkEvent,
  WorkEventInput,
} from '../../src/command-execution/production-command.port.ts';
import type { AdvanceProductionStageRepository } from '../../src/advance-production-stage/advance-production-stage.port.ts';
import { makeAdvanceProductionStage } from '../../src/advance-production-stage/advance-production-stage.usecase.ts';
import { allowPolicy } from '../support/production.fake.ts';

const ids = {
  stage: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  actor: '33333333-3333-4333-8333-333333333333',
  otherActor: '44444444-4444-4444-8444-444444444444',
  attempt: '55555555-5555-4555-8555-555555555555',
  order: '66666666-6666-4666-8666-666666666666',
} as const;

const runLifecycleDecision = Object.freeze({
  from: 'started' as const,
  state: 'completed' as const,
});
const shiftLifecycleDecision = Object.freeze({
  from: 'open' as const,
  state: 'closed' as const,
});

type AdvanceOperations = Parameters<
  Parameters<AdvanceProductionStageRepository['transaction']>[0]
>[0];
type TransitionStageInput = Parameters<AdvanceOperations['transitionStage']>[0];

const policy = {
  ...allowPolicy,
  evaluateProductionRunTransition: () => ({
    tag: 'ok' as const,
    value: runLifecycleDecision,
  }),
  evaluateProductionShiftTransition: () => ({
    tag: 'ok' as const,
    value: shiftLifecycleDecision,
  }),
  evaluateStageTransition: (
    entity: Parameters<ProductionPolicyPort['evaluateStageTransition']>[0],
    event: Parameters<ProductionPolicyPort['evaluateStageTransition']>[1],
    context: Parameters<ProductionPolicyPort['evaluateStageTransition']>[2],
  ) => {
    if (event.type === 'start')
      return {
        tag: 'ok' as const,
        value: {
          status: 'allowed' as const,
          from: 'planned' as const,
          state: 'started' as const,
        },
      };
    if (entity.actualStartAt === null)
      return {
        tag: 'err' as const,
        error: {
          code: 'STAGE_ACTUAL_START_MISSING',
          message: 'Actual stage start is missing.',
        },
      };

    const plannedDurationMilliseconds =
      entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
    const boundary = new Date(
      Math.max(
        entity.plannedEndAt.getTime(),
        entity.actualStartAt.getTime() + plannedDurationMilliseconds,
      ),
    );
    if (context.now < boundary)
      return {
        tag: 'ok' as const,
        value: {
          status: 'confirmation_required' as const,
          action: 'complete' as const,
          code: 'PULSE_BOUNDARY_NOT_REACHED' as const,
          message: 'This stage has not yet occupied its planned pulse.',
          timing: {
            actualStartAt: entity.actualStartAt.toISOString(),
            plannedEndAt: entity.plannedEndAt.toISOString(),
            completionBoundaryAt: boundary.toISOString(),
            observedAt: context.now.toISOString(),
            plannedDurationMilliseconds,
            elapsedMilliseconds:
              context.now.getTime() - entity.actualStartAt.getTime(),
            remainingMilliseconds: boundary.getTime() - context.now.getTime(),
          },
        },
      };

    return {
      tag: 'ok' as const,
      value: {
        status: 'allowed' as const,
        from: 'started' as const,
        state: 'completed' as const,
      },
    };
  },
} satisfies ProductionPolicyPort;

const makeRepository = (
  overrides: Readonly<{
    version?: number;
    status?: 'planned' | 'started';
    stageKind?: 'sorting' | 'folding_packaging';
    plannedStartAt?: string;
    plannedEndAt?: string;
    actualStartAt?: string | null;
    resolutionState?: 'open' | 'resolved_without_production';
    storedWorkEvent?: StoredWorkEvent | null;
    replayAfterLock?: boolean;
  }> = {},
) => {
  let storedWorkEvent: StoredWorkEvent | null =
    overrides.storedWorkEvent ?? null;
  let workEventReads = 0;
  const stageKind = overrides.stageKind ?? 'sorting';
  const stageStatus = overrides.status ?? 'started';
  const context: StageTransitionContext = {
    stage: {
      id: ids.stage,
      productionBatchId: ids.batch,
      stage: stageKind,
      status: stageStatus,
      plannedStartAt: overrides.plannedStartAt ?? '2026-07-14T14:00:00.000Z',
      plannedEndAt: overrides.plannedEndAt ?? '2026-07-14T14:56:00.000Z',
      actualStartAt:
        overrides.actualStartAt === undefined
          ? '2026-07-14T14:00:00.000Z'
          : overrides.actualStartAt,
      machineIds: [],
      version: overrides.version ?? 3,
    },
    batch: {
      id: ids.batch,
      status:
        stageStatus === 'planned'
          ? stageKind === 'sorting'
            ? 'queued'
            : 'drying'
          : stageKind,
      version: 2,
    },
    attempts: [{ id: ids.attempt, status: 'assigned' }],
    activeOrders: [
      {
        id: ids.order,
        status: 'scheduled',
        executionStatus: 'scheduled',
        resolutionState: overrides.resolutionState ?? 'open',
        version: 2,
      },
    ],
    productionRunStatus: 'started',
    productionShiftStatus: 'open',
    productionRunStarted: true,
    batchMembershipFrozen: true,
    previousStageCompleted: true,
    sameKindAlreadyActive: false,
    batchWeightLbs: 20,
    machines: [],
  };
  const mutation: ProductionMutationResult = {
    entityId: ids.stage,
    version: context.stage.version + 1,
    replayed: false,
  };
  const transitionStage = vi.fn(
    async (_input: TransitionStageInput) => mutation,
  );
  const appendWorkEvent = vi.fn(async (event: WorkEventInput) => {
    storedWorkEvent = {
      command: event.idempotency.command,
      result: event.idempotency.result,
      valid: true,
    };
  });
  const findWorkEvent = vi.fn(async () => {
    workEventReads += 1;
    if (overrides.replayAfterLock === true && workEventReads === 1) return null;
    return storedWorkEvent;
  });
  const loadStageTransitionContext = vi.fn(async () => context);
  const operations = {
    findWorkEvent,
    loadStageTransitionContext,
    transitionStage,
    appendWorkEvent,
  };
  const repo: AdvanceProductionStageRepository = {
    transaction: async (work) => work(operations),
  };

  return {
    repo,
    findWorkEvent,
    loadStageTransitionContext,
    transitionStage,
    appendWorkEvent,
  };
};

const completionCommand = {
  locationId: 'location-1',
  stageRunId: ids.stage,
  expectedVersion: 3,
  actorId: ids.actor,
  transition: 'complete' as const,
  idempotencyKey: 'complete-stage-command-1',
};

const confirmationValue = (
  value: unknown,
): ProductionStageCompletionConfirmationRequiredResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('status' in value) ||
    value.status !== 'confirmation_required'
  )
    throw new Error('Expected an early-completion confirmation.');
  return value as ProductionStageCompletionConfirmationRequiredResult;
};

const startConfirmationValue = (
  value: unknown,
): ProductionStageStartConfirmationRequiredResult => {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('status' in value) ||
    value.status !== 'confirmation_required' ||
    !('code' in value) ||
    value.code !== 'PLANNED_START_NOT_REACHED'
  )
    throw new Error('Expected an early-start confirmation.');
  return value as ProductionStageStartConfirmationRequiredResult;
};

describe('advance production stage', () => {
  it('rejects floor progress for an archived production order', async () => {
    const repository = makeRepository({
      resolutionState: 'resolved_without_production',
    });
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });

    await expect(advance(completionCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_resolved', status: 409 },
    });
    expect(repository.transitionStage).not.toHaveBeenCalled();
  });

  it('replays a concurrent pre-deploy ordinary start after acquiring the aggregate lock', async () => {
    const legacyResult: ProductionMutationResult = {
      entityId: ids.stage,
      version: 4,
      replayed: false,
    };
    const legacyStart: StoredWorkEvent = {
      valid: true,
      command: {
        operation: 'stage_started',
        locationId: 'location-1',
        actorId: ids.actor,
        target: { entityType: 'stage_run', entityId: ids.stage },
        expectedVersion: 3,
        payload: { transition: 'start' },
      },
      result: legacyResult,
    };
    const repository = makeRepository({
      version: 4,
      status: 'started',
      storedWorkEvent: legacyStart,
      replayAfterLock: true,
    });
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });

    await expect(
      advance({
        locationId: 'location-1',
        stageRunId: ids.stage,
        expectedVersion: 3,
        actorId: ids.actor,
        transition: 'start',
        idempotencyKey: 'legacy-start-stage-command-1',
      }),
    ).resolves.toEqual({
      tag: 'ok',
      value: { ...legacyResult, replayed: true },
    });
    expect(repository.findWorkEvent).toHaveBeenCalledTimes(2);
    expect(repository.loadStageTransitionContext).toHaveBeenCalledOnce();
    expect(repository.transitionStage).not.toHaveBeenCalled();
  });

  it('requires a version-bound confirmation before an otherwise-valid early start', async () => {
    const repository = makeRepository({
      status: 'planned',
      actualStartAt: null,
      plannedStartAt: '2026-07-14T15:00:00.000Z',
      plannedEndAt: '2026-07-14T15:56:00.000Z',
    });
    let now = new Date('2026-07-14T14:40:00.000Z');
    const earlyStartPolicy = {
      ...allowPolicy,
      evaluateStageTransition: () => ({
        tag: 'ok' as const,
        value: {
          status: 'confirmation_required' as const,
          action: 'start' as const,
          code: 'PLANNED_START_NOT_REACHED' as const,
          message: 'This stage is scheduled to start later.',
          timing: {
            plannedStartAt: '2026-07-14T15:00:00.000Z',
            plannedEndAt: '2026-07-14T15:56:00.000Z',
            observedAt: now.toISOString(),
            remainingMilliseconds:
              Date.parse('2026-07-14T15:00:00.000Z') - now.getTime(),
          },
        },
      }),
    } satisfies ProductionPolicyPort;
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy: earlyStartPolicy,
      clock: { now: () => now },
    });
    const command = {
      locationId: 'location-1',
      stageRunId: ids.stage,
      expectedVersion: 3,
      actorId: ids.actor,
      transition: 'start' as const,
      idempotencyKey: 'start-stage-command-1',
    };

    const requested = await advance(command);
    expect(requested).toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        code: 'PLANNED_START_NOT_REACHED',
        stageVersion: 3,
        timing: { remainingMilliseconds: 20 * 60_000 },
      },
    });
    if (requested.tag === 'err') return;
    const required = startConfirmationValue(requested.value);
    expect(repository.transitionStage).not.toHaveBeenCalled();

    now = new Date('2026-07-14T14:42:00.000Z');
    await expect(
      advance({ ...command, confirmation: required.confirmation }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: ids.stage, version: 4, replayed: false },
    });
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'stage_started',
        payload: {
          version: 4,
          earlyStart: expect.objectContaining({
            actorId: ids.actor,
            confirmationObservedAt: '2026-07-14T14:40:00.000Z',
            confirmedAt: '2026-07-14T14:42:00.000Z',
            plannedStartAt: '2026-07-14T15:00:00.000Z',
            remainingMilliseconds: 18 * 60_000,
          }),
        },
      }),
    );
  });

  it('requires an explicit, versioned confirmation before completing early', async () => {
    const repository = makeRepository();
    let now = new Date('2026-07-14T14:18:00.000Z');
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy,
      clock: { now: () => now },
    });

    const requested = await advance(completionCommand);
    expect(requested).toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        stageRunId: ids.stage,
        stageVersion: 3,
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        timing: {
          elapsedMilliseconds: 18 * 60_000,
          remainingMilliseconds: 38 * 60_000,
        },
        replayed: false,
      },
    });
    expect(repository.transitionStage).not.toHaveBeenCalled();
    expect(repository.appendWorkEvent).not.toHaveBeenCalled();
    if (requested.tag === 'err') return;
    const required = confirmationValue(requested.value);

    now = new Date('2026-07-14T14:20:00.000Z');
    const confirmedCommand = {
      ...completionCommand,
      confirmation: required.confirmation,
    };
    await expect(advance(confirmedCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: ids.stage, version: 4, replayed: false },
    });
    expect(repository.transitionStage).toHaveBeenCalledTimes(1);
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ids.actor,
        eventType: 'stage_completed',
        payload: {
          version: 4,
          earlyCompletion: {
            actorId: ids.actor,
            confirmationHash: required.confirmation.confirmationHash,
            confirmationObservedAt: '2026-07-14T14:18:00.000Z',
            confirmedAt: '2026-07-14T14:20:00.000Z',
            actualStartAt: '2026-07-14T14:00:00.000Z',
            plannedEndAt: '2026-07-14T14:56:00.000Z',
            completionBoundaryAt: '2026-07-14T14:56:00.000Z',
            plannedDurationMilliseconds: 56 * 60_000,
            elapsedMilliseconds: 20 * 60_000,
            remainingMilliseconds: 36 * 60_000,
          },
        },
      }),
    );

    await expect(advance(confirmedCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: ids.stage, version: 4, replayed: true },
    });
    expect(repository.transitionStage).toHaveBeenCalledTimes(1);
  });

  it('rejects a confirmation when actor or stage timing no longer matches', async () => {
    const source = makeRepository();
    const sourceAdvance = makeAdvanceProductionStage({
      repo: source.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:18:00.000Z') },
    });
    const requested = await sourceAdvance(completionCommand);
    if (requested.tag === 'err') return;
    const required = confirmationValue(requested.value);

    const changedTiming = makeRepository({
      plannedEndAt: '2026-07-14T15:00:00.000Z',
    });
    const advanceChangedTiming = makeAdvanceProductionStage({
      repo: changedTiming.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });
    await expect(
      advanceChangedTiming({
        ...completionCommand,
        confirmation: required.confirmation,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'stage_completion_confirmation_stale',
        status: 409,
      },
    });
    expect(changedTiming.transitionStage).not.toHaveBeenCalled();

    const changedActor = makeRepository();
    const advanceChangedActor = makeAdvanceProductionStage({
      repo: changedActor.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });
    await expect(
      advanceChangedActor({
        ...completionCommand,
        actorId: ids.otherActor,
        confirmation: required.confirmation,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'stage_completion_confirmation_stale', status: 409 },
    });
    expect(changedActor.transitionStage).not.toHaveBeenCalled();
  });

  it('keeps stale versions and non-temporal policy guards as hard failures', async () => {
    const stale = makeRepository({ version: 4 });
    const advanceStale = makeAdvanceProductionStage({
      repo: stale.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });
    await expect(advanceStale(completionCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'stage_run_version_conflict', status: 409 },
    });

    const guarded = makeRepository();
    const guardPolicy = {
      ...allowPolicy,
      evaluateStageTransition: () => ({
        tag: 'err' as const,
        error: {
          code: 'MACHINE_ASSIGNMENT_OVERLAPS',
          message: 'A machine is still occupied.',
        },
      }),
    } satisfies ProductionPolicyPort;
    const advanceGuarded = makeAdvanceProductionStage({
      repo: guarded.repo,
      policy: guardPolicy,
      clock: { now: () => new Date('2026-07-14T14:20:00.000Z') },
    });
    await expect(advanceGuarded(completionCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'machine_assignment_overlaps', status: 409 },
    });
    expect(guarded.transitionStage).not.toHaveBeenCalled();
  });

  it('completes at the boundary without manufacturing a confirmation', async () => {
    const repository = makeRepository();
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:56:00.000Z') },
    });

    await expect(advance(completionCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: ids.stage, version: 4, replayed: false },
    });
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { version: 4 } }),
    );
    expect(repository.transitionStage).toHaveBeenCalledWith(
      expect.objectContaining({ terminalLifecycle: null }),
    );
  });

  it('forwards the exact aggregate decisions only at terminal batch completion', async () => {
    const repository = makeRepository({ stageKind: 'folding_packaging' });
    const advance = makeAdvanceProductionStage({
      repo: repository.repo,
      policy,
      clock: { now: () => new Date('2026-07-14T14:56:00.000Z') },
    });

    await expect(advance(completionCommand)).resolves.toMatchObject({
      tag: 'ok',
      value: { entityId: ids.stage, version: 4, replayed: false },
    });
    const mutationInput = repository.transitionStage.mock.calls[0]?.[0];
    expect(mutationInput?.terminalLifecycle?.run).toBe(runLifecycleDecision);
    expect(mutationInput?.terminalLifecycle?.shift).toBe(
      shiftLifecycleDecision,
    );
  });
});
