import type {
  ProductionMutationResult,
  ProductionStageCompletionConfirmationRequiredResult,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  ProductionPolicyPort,
  StageTransitionContext,
  StoredWorkEvent,
  WorkEventInput,
} from '../../src/production.port.ts';
import type { AdvanceProductionStageRepository } from '../../src/advance-production-stage/advance-production-stage.port.ts';
import { makeAdvanceProductionStage } from '../../src/advance-production-stage/advance-production-stage.usecase.ts';

const ids = {
  stage: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  actor: '33333333-3333-4333-8333-333333333333',
  otherActor: '44444444-4444-4444-8444-444444444444',
} as const;

const policy = {
  evaluateStageTransition: (
    entity: Parameters<ProductionPolicyPort['evaluateStageTransition']>[0],
    event: Parameters<ProductionPolicyPort['evaluateStageTransition']>[1],
    context: Parameters<ProductionPolicyPort['evaluateStageTransition']>[2],
  ) => {
    if (event.type === 'start')
      return {
        tag: 'ok' as const,
        value: { status: 'allowed' as const, state: 'started' as const },
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
      value: { status: 'allowed' as const, state: 'completed' as const },
    };
  },
} as unknown as ProductionPolicyPort;

const makeRepository = (
  overrides: Readonly<{
    version?: number;
    plannedEndAt?: string;
  }> = {},
) => {
  let storedWorkEvent: StoredWorkEvent | null = null;
  const context: StageTransitionContext = {
    stage: {
      id: ids.stage,
      productionBatchId: ids.batch,
      stage: 'sorting',
      status: 'started',
      plannedStartAt: '2026-07-14T14:00:00.000Z',
      plannedEndAt: overrides.plannedEndAt ?? '2026-07-14T14:56:00.000Z',
      actualStartAt: '2026-07-14T14:00:00.000Z',
      machineIds: [],
      version: overrides.version ?? 3,
    },
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
  const transitionStage = vi.fn(async () => mutation);
  const appendWorkEvent = vi.fn(async (event: WorkEventInput) => {
    storedWorkEvent = {
      command: event.idempotency.command,
      result: event.idempotency.result,
      valid: true,
    };
  });
  const operations = {
    findWorkEvent: vi.fn(async () => storedWorkEvent),
    loadStageTransitionContext: vi.fn(async () => context),
    transitionStage,
    appendWorkEvent,
  };
  const repo: AdvanceProductionStageRepository = {
    transaction: async (work) => work(operations),
  };

  return { repo, transitionStage, appendWorkEvent };
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

describe('advance production stage', () => {
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
      evaluateStageTransition: () => ({
        tag: 'err' as const,
        error: {
          code: 'MACHINE_ASSIGNMENT_OVERLAPS',
          message: 'A machine is still occupied.',
        },
      }),
    } as unknown as ProductionPolicyPort;
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
  });
});
