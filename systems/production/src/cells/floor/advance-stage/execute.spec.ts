import { proveOperation } from '@pressly/testkit/operation-proof';
import { advanceStageCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { conflictError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import {
  makeExecuteAdvanceStage,
  type AdvanceStageDependencies,
  type AdvanceStageReplay,
  type AdvanceStageTransactionRepository,
  type AdvanceStageTransitionInput,
  type AdvanceStageWorkEventCommand,
  type AdvanceStageWorkEventInput,
} from './execute.ts';
import type {
  AdvanceStageBatchState,
  AdvanceStageCommand,
  AdvanceStageExpectedFailure,
  AdvanceStageFacts,
  AdvanceStageMutationResult,
  AdvanceStagePolicy,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  stage: '10000000-0000-4000-8000-000000000002',
  batch: '10000000-0000-4000-8000-000000000003',
} as const;

const now = new Date('2026-08-21T14:20:00.000Z');

const command = (
  input: Partial<Extract<AdvanceStageCommand, { transition: 'start' }>> = {},
): Extract<AdvanceStageCommand, { transition: 'start' }> => ({
  locationId: 'location-1',
  stageRunId: ids.stage,
  expectedVersion: 3,
  idempotencyKey: 'start-stage-command',
  actorId: ids.actor,
  transition: 'start',
  ...input,
});

const facts = (version = 3): AdvanceStageFacts => ({
  stage: {
    id: ids.stage,
    productionBatchId: ids.batch,
    stage: 'sorting',
    status: 'planned',
    plannedStartAt: '2026-08-21T14:00:00.000Z',
    plannedEndAt: '2026-08-21T14:56:00.000Z',
    actualStartAt: null,
    machineIds: [],
    version,
  },
  batch: { id: ids.batch, status: 'queued', version: 2 },
  attempts: [],
  activeOrders: [],
  productionRunStatus: 'started',
  productionShiftStatus: 'open',
  productionRunStarted: true,
  batchMembershipFrozen: false,
  previousStageCompleted: true,
  sameKindAlreadyActive: false,
  batchWeightLbs: 20,
  machines: [],
});

const batchTransition = (
  event: Parameters<
    AdvanceStagePolicy['evaluateProductionBatchTransition']
  >[0]['event'],
) => {
  const decisions: Record<
    typeof event,
    Readonly<{ from: AdvanceStageBatchState; state: AdvanceStageBatchState }>
  > = {
    start_sorting: { from: 'queued', state: 'sorting' },
    start_washing: { from: 'sorting', state: 'washing' },
    start_drying: { from: 'washing', state: 'drying' },
    start_folding_packaging: {
      from: 'drying',
      state: 'folding_packaging',
    },
    finish: { from: 'folding_packaging', state: 'finished' },
  };
  return decisions[event];
};

const makePolicy = (trace: string[]): AdvanceStagePolicy => ({
  evaluateProductionOrderOperationalAccess: () => ({
    tag: 'ok',
    value: {},
  }),
  evaluateStageTransition: (_entity, event) => {
    trace.push('decide:stage');
    return {
      tag: 'ok',
      value:
        event.type === 'start'
          ? { status: 'allowed', from: 'planned', state: 'started' }
          : { status: 'allowed', from: 'started', state: 'completed' },
    };
  },
  evaluateMachineAssignment: () => ({ tag: 'ok', value: {} }),
  evaluateProductionBatchTransition: ({ event }) => {
    trace.push('decide:batch');
    return { tag: 'ok', value: batchTransition(event) };
  },
  evaluateProductionOrderStageAttemptTransition: () => ({
    tag: 'ok',
    value: { from: 'assigned', state: 'completed' },
  }),
  resolveProductionOrderExecutionState: () => ({
    tag: 'ok',
    value: 'scheduled',
  }),
  evaluateProductionOrderExecutionTransition: () => ({
    tag: 'ok',
    value: { from: 'scheduled', state: 'finished' },
  }),
  evaluateProductionRunTransition: () => ({
    tag: 'ok',
    value: { from: 'started', state: 'completed' },
  }),
  evaluateProductionShiftTransition: () => ({
    tag: 'ok',
    value: { from: 'open', state: 'closed' },
  }),
  makeStageStartConfirmationRequired: (input) => ({
    status: 'confirmation_required',
    stageRunId: input.stageRunId,
    stageVersion: input.expectedVersion,
    code: input.code,
    message: input.message,
    confirmation: {
      observedAt: now.toISOString(),
      confirmationHash: 'a'.repeat(64),
    },
    timing: input.timing,
    replayed: false,
  }),
  matchesStageStartConfirmation: () => true,
  makeStageCompletionConfirmationRequired: (input) => ({
    status: 'confirmation_required',
    stageRunId: input.stageRunId,
    stageVersion: input.expectedVersion,
    code: input.code,
    message: input.message,
    confirmation: {
      observedAt: now.toISOString(),
      confirmationHash: 'a'.repeat(64),
    },
    timing: input.timing,
    replayed: false,
  }),
  matchesStageCompletionConfirmation: () => true,
});

type StoredWorkEvent = Readonly<{ id: string }>;

type HarnessOptions = Readonly<{
  currentFacts?: AdvanceStageFacts | null;
  replays?: readonly AdvanceStageReplay[];
  transitionFailure?: AdvanceStageExpectedFailure;
  mutation?: AdvanceStageMutationResult;
  transitionError?: unknown;
  appendError?: unknown;
}>;

const makeHarness = (options: HarnessOptions = {}) => {
  const trace: string[] = [];
  const replays = [...(options.replays ?? [])];
  const transitions: AdvanceStageTransitionInput[] = [];
  const workEvents: AdvanceStageWorkEventInput[] = [];
  const identities: AdvanceStageWorkEventCommand[] = [];
  const mutation = options.mutation ?? {
    entityId: ids.stage,
    version: 4,
    replayed: false,
  };
  const transactionRepository: AdvanceStageTransactionRepository<StoredWorkEvent> =
    {
      findWorkEvent: async () => {
        trace.push('work-event:find');
        return null;
      },
      loadStageTransitionFacts: async () => {
        trace.push('facts:load-for-update');
        return options.currentFacts === undefined
          ? facts()
          : options.currentFacts;
      },
      transitionStage: async (input) => {
        trace.push('stage:transition');
        transitions.push(input);
        if (options.transitionError !== undefined)
          throw options.transitionError;
        return options.transitionFailure === undefined
          ? { kind: 'success', value: mutation }
          : { kind: 'failure', failure: options.transitionFailure };
      },
      appendWorkEvent: async (event) => {
        trace.push('work-event:append');
        workEvents.push(event);
        if (options.appendError !== undefined) throw options.appendError;
      },
    };
  const deps: AdvanceStageDependencies<StoredWorkEvent> = {
    repo: {
      transaction: async (work) => {
        trace.push('transaction:begin');
        try {
          const outcome = await work(transactionRepository);
          trace.push(
            outcome.kind === 'success'
              ? 'transaction:commit'
              : 'transaction:rollback',
          );
          return outcome;
        } catch (error) {
          trace.push('transaction:rollback');
          throw error;
        }
      },
    },
    idempotency: {
      resolveReplay: (_stored, identity) => {
        trace.push('idempotency:resolve');
        identities.push(identity);
        return replays.shift() ?? { kind: 'miss' };
      },
    },
    policy: makePolicy(trace),
    clock: {
      now: () => {
        trace.push('clock:now');
        return now;
      },
    },
    signals: {
      batchFrozen: () => {
        trace.push('signal:batch-frozen');
      },
    },
  };

  return {
    execute: makeExecuteAdvanceStage(deps),
    trace,
    transitions,
    workEvents,
    identities,
  };
};

describe('advance-stage cell executor', () => {
  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'executes the exact linear protocol and signals only after commit',
        proves: ['executor-success'],
        run: async () => {
          const harness = makeHarness();

          await expect(harness.execute(command())).resolves.toEqual({
            kind: 'success',
            value: { entityId: ids.stage, version: 4, replayed: false },
          });
          expect(harness.trace).toEqual([
            'transaction:begin',
            'work-event:find',
            'idempotency:resolve',
            'clock:now',
            'facts:load-for-update',
            'work-event:find',
            'idempotency:resolve',
            'decide:stage',
            'decide:batch',
            'stage:transition',
            'work-event:append',
            'transaction:commit',
            'signal:batch-frozen',
          ]);
          expect(harness.transitions).toEqual([
            {
              locationId: 'location-1',
              stageRunId: ids.stage,
              expectedVersion: 3,
              stageLifecycle: { from: 'planned', state: 'started' },
              batchId: ids.batch,
              batchExpectedVersion: 2,
              batchState: 'queued',
              batchLifecycle: { from: 'queued', state: 'sorting' },
              freezeMembership: true,
              attemptLifecycles: [],
              terminalLifecycle: null,
              actorId: ids.actor,
              now,
            },
          ]);
          expect(harness.workEvents).toEqual([
            {
              locationId: 'location-1',
              eventType: 'stage_started',
              entityType: 'stage_run',
              entityId: ids.stage,
              actorId: ids.actor,
              expectedVersion: 3,
              idempotencyKey: 'start-stage-command',
              payload: { version: 4 },
              idempotency: {
                command: {
                  operation: 'stage_started',
                  locationId: 'location-1',
                  actorId: ids.actor,
                  target: { entityType: 'stage_run', entityId: ids.stage },
                  expectedVersion: 3,
                  payload: { transition: 'start' },
                },
                result: { entityId: ids.stage, version: 4, replayed: false },
              },
            },
          ]);
        },
      },
    ],
  });

  it('returns a rejected decision without transition, work event, or signal', async () => {
    const harness = makeHarness({ currentFacts: facts(4) });

    await expect(harness.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'stage_run_version_conflict',
      },
    });
    expect(harness.trace).toContain('transaction:rollback');
    expect(harness.trace).not.toContain('stage:transition');
    expect(harness.trace).not.toContain('work-event:append');
    expect(harness.trace).not.toContain('signal:batch-frozen');
  });

  it('returns a pre-lock replay without clock, facts, mutation, or signal effects', async () => {
    const harness = makeHarness({
      replays: [
        {
          kind: 'replay',
          result: { entityId: ids.stage, version: 4, replayed: true },
        },
      ],
    });

    await expect(harness.execute(command())).resolves.toEqual({
      kind: 'success',
      value: { entityId: ids.stage, version: 4, replayed: true },
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'work-event:find',
      'idempotency:resolve',
      'transaction:commit',
    ]);
  });

  it('checks replay again after the locking facts read and performs no write', async () => {
    const harness = makeHarness({
      replays: [
        { kind: 'miss' },
        {
          kind: 'replay',
          result: { entityId: ids.stage, version: 4, replayed: true },
        },
      ],
    });

    await expect(harness.execute(command())).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(harness.trace).toEqual([
      'transaction:begin',
      'work-event:find',
      'idempotency:resolve',
      'clock:now',
      'facts:load-for-update',
      'work-event:find',
      'idempotency:resolve',
      'transaction:commit',
    ]);
  });

  it('keeps a late optimistic miss as expected conflict data and rolls back', async () => {
    const harness = makeHarness({
      transitionFailure: {
        kind: 'conflict',
        code: 'stage_run_version_conflict',
        message: 'The production stage changed before the command.',
        safeMessage: 'The production stage changed before the command.',
      },
    });

    await expect(harness.execute(command())).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'stage_run_version_conflict',
        message: 'The production stage changed before the command.',
        safeMessage: 'The production stage changed before the command.',
      },
    });
    expect(harness.trace.at(-1)).toBe('transaction:rollback');
    expect(harness.trace).not.toContain('work-event:append');
    expect(harness.trace).not.toContain('signal:batch-frozen');
  });

  it('returns a late repository conflict as typed data after rollback', async () => {
    const harness = makeHarness({
      transitionFailure: {
        kind: 'conflict',
        code: 'production_stage_batch_version_conflict',
        message: 'Production batch changed during stage transition.',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });

    await expect(harness.execute(command())).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_stage_batch_version_conflict',
        message: 'Production batch changed during stage transition.',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
    expect(harness.trace.at(-1)).toBe('transaction:rollback');
    expect(harness.trace).not.toContain('work-event:append');
    expect(harness.trace).not.toContain('signal:batch-frozen');
  });

  it('rethrows an owned late conflict unchanged after rollback', async () => {
    const ownedConflict = conflictError({
      code: 'production_order_stage_attempt_version_conflict',
      message: 'A production order stage attempt changed concurrently.',
      safeMessage: 'Production state changed. Refresh and try again.',
    });
    const harness = makeHarness({
      transitionError: ownedConflict,
    });

    await expect(harness.execute(command())).rejects.toBe(ownedConflict);
    expect(ownedConflict.kind).toBe('ConflictError');
    expect(ownedConflict.code).toBe(
      'production_order_stage_attempt_version_conflict',
    );
    expect(ownedConflict.status).toBe(409);
    expect(harness.trace.at(-1)).toBe('transaction:rollback');
    expect(harness.trace).not.toContain('work-event:append');
    expect(harness.trace).not.toContain('signal:batch-frozen');
  });

  it('maps a late throwable to the standard database error after rollback', async () => {
    const harness = makeHarness({
      appendError: { fault: 'deliberate work-event fault' },
    });

    try {
      await harness.execute(command());
      expect.unreachable('the late fault should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.kind).toBe('DatabaseError');
        expect(error.code).toBe('stage_transition_failed');
        expect(error.status).toBe(503);
      }
    }
    expect(harness.trace.at(-1)).toBe('transaction:rollback');
    expect(harness.trace).not.toContain('signal:batch-frozen');
  });
});
