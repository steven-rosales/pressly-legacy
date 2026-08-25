import { proveOperation } from '@pressly/testkit/operation-proof';
import { advanceStageCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { advanceStageOperationId, decideAdvanceStage } from './decide.ts';
import type {
  AdvanceStageBatchState,
  AdvanceStageCommand,
  AdvanceStageFacts,
  AdvanceStagePolicy,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  stage: '10000000-0000-4000-8000-000000000002',
  batch: '10000000-0000-4000-8000-000000000003',
  attempt: '10000000-0000-4000-8000-000000000004',
  order: '10000000-0000-4000-8000-000000000005',
  machine: '10000000-0000-4000-8000-000000000006',
} as const;

const now = new Date('2026-08-21T14:20:00.000Z');
const plannedStartAt = '2026-08-21T14:00:00.000Z';
const plannedEndAt = '2026-08-21T14:56:00.000Z';
const confirmation = {
  observedAt: '2026-08-21T14:18:00.000Z',
  confirmationHash: 'a'.repeat(64),
} as const;

type FactsInput = Readonly<{
  stage?: Partial<AdvanceStageFacts['stage']>;
  batch?: Partial<AdvanceStageFacts['batch']>;
  attempts?: AdvanceStageFacts['attempts'];
  activeOrders?: AdvanceStageFacts['activeOrders'];
  productionRunStatus?: string;
  productionShiftStatus?: string;
  productionRunStarted?: boolean;
  batchMembershipFrozen?: boolean;
  previousStageCompleted?: boolean;
  sameKindAlreadyActive?: boolean;
  batchWeightLbs?: number;
  machines?: AdvanceStageFacts['machines'];
}>;

const stageFacts = (input: FactsInput = {}): AdvanceStageFacts => ({
  stage: {
    id: ids.stage,
    productionBatchId: ids.batch,
    stage: 'sorting',
    status: 'planned',
    plannedStartAt,
    plannedEndAt,
    actualStartAt: null,
    machineIds: [],
    version: 3,
    ...input.stage,
  },
  batch: {
    id: ids.batch,
    status: 'queued',
    version: 2,
    ...input.batch,
  },
  attempts: input.attempts ?? [],
  activeOrders: input.activeOrders ?? [],
  productionRunStatus: input.productionRunStatus ?? 'started',
  productionShiftStatus: input.productionShiftStatus ?? 'open',
  productionRunStarted: input.productionRunStarted ?? true,
  batchMembershipFrozen: input.batchMembershipFrozen ?? false,
  previousStageCompleted: input.previousStageCompleted ?? true,
  sameKindAlreadyActive: input.sameKindAlreadyActive ?? false,
  batchWeightLbs: input.batchWeightLbs ?? 20,
  machines: input.machines ?? [],
});

const startCommand = (
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

const completeCommand = (
  input: Partial<Extract<AdvanceStageCommand, { transition: 'complete' }>> = {},
): Extract<AdvanceStageCommand, { transition: 'complete' }> => ({
  locationId: 'location-1',
  stageRunId: ids.stage,
  expectedVersion: 3,
  idempotencyKey: 'complete-stage-command',
  actorId: ids.actor,
  transition: 'complete',
  ...input,
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

const makePolicy = (
  overrides: Partial<AdvanceStagePolicy> = {},
): AdvanceStagePolicy => ({
  evaluateProductionOrderOperationalAccess: () => ({
    tag: 'ok',
    value: { resolutionState: 'open' },
  }),
  evaluateStageTransition: (_entity, event) => ({
    tag: 'ok',
    value:
      event.type === 'start'
        ? { status: 'allowed', from: 'planned', state: 'started' }
        : { status: 'allowed', from: 'started', state: 'completed' },
  }),
  evaluateMachineAssignment: () => ({
    tag: 'ok',
    value: { machineIds: [ids.machine] },
  }),
  evaluateProductionBatchTransition: ({ event }) => ({
    tag: 'ok',
    value: batchTransition(event),
  }),
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
    confirmation,
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
    confirmation,
    timing: input.timing,
    replayed: false,
  }),
  matchesStageCompletionConfirmation: () => true,
  ...overrides,
});

const decide = (input: {
  facts?: AdvanceStageFacts | null;
  command?: AdvanceStageCommand;
  policy?: AdvanceStagePolicy;
}) =>
  decideAdvanceStage({
    facts: input.facts === undefined ? stageFacts() : input.facts,
    command: input.command ?? startCommand(),
    now,
    policy: input.policy ?? makePolicy(),
  });

describe('production.advance-stage.v1 decision', () => {
  it('publishes one canonical operation identity', () => {
    expect(advanceStageOperationId).toBe('production.advance-stage.v1');
  });

  proveOperation({
    operationId: 'production.advance-stage.v1',
    declaration: advanceStageCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'is deterministic from explicit facts, command, policy, and time without mutation',
        proves: ['decision'],
        run: () => {
          const currentFacts = stageFacts();
          const currentCommand = startCommand();
          const factsBefore = structuredClone(currentFacts);
          const commandBefore = structuredClone(currentCommand);
          const policy = makePolicy();
          const input = {
            facts: currentFacts,
            command: currentCommand,
            now,
            policy,
          } as const;

          expect(decideAdvanceStage(input)).toEqual(decideAdvanceStage(input));
          expect(currentFacts).toEqual(factsBefore);
          expect(currentCommand).toEqual(commandBefore);
          expect(now.toISOString()).toBe('2026-08-21T14:20:00.000Z');
        },
      },
    ],
  });

  it('rejects missing and stale stage facts before policy evaluation', () => {
    expect(decide({ facts: null })).toEqual({
      kind: 'reject',
      rejection: {
        kind: 'expected',
        failure: {
          kind: 'not_found',
          code: 'stage_run_not_found',
          message: 'The production stage was not found.',
          safeMessage: 'The production stage was not found.',
        },
      },
    });
    expect(
      decide({ facts: stageFacts({ stage: { version: 4 } }) }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        kind: 'expected',
        failure: { kind: 'conflict', code: 'stage_run_version_conflict' },
      },
    });
  });

  it('returns the complete ordinary sorting-start mutation plan', () => {
    expect(decide({})).toEqual({
      kind: 'commit',
      plan: {
        eventType: 'stage_started',
        stageLifecycle: { from: 'planned', state: 'started' },
        batchId: ids.batch,
        batchExpectedVersion: 2,
        batchState: 'queued',
        batchLifecycle: { from: 'queued', state: 'sorting' },
        freezeMembership: true,
        attemptLifecycles: [],
        terminalLifecycle: null,
        audit: {},
      },
    });
  });

  it('keeps resolved-order and machine-capacity policy failures typed', () => {
    const archived = makePolicy({
      evaluateProductionOrderOperationalAccess: () => ({
        tag: 'err',
        error: {
          code: 'PRODUCTION_ORDER_RESOLVED',
          message: 'This order is archived from active production work.',
        },
      }),
    });
    expect(
      decide({
        facts: stageFacts({
          activeOrders: [
            {
              id: ids.order,
              status: 'scheduled',
              executionStatus: 'scheduled',
              resolutionState: 'resolved_without_production',
              version: 2,
            },
          ],
        }),
        policy: archived,
      }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        failure: { code: 'production_order_resolved', kind: 'conflict' },
      },
    });

    const insufficient = makePolicy({
      evaluateMachineAssignment: () => ({
        tag: 'err',
        error: {
          code: 'MACHINE_CAPACITY_INSUFFICIENT',
          message: 'Assigned machines do not cover the batch weight.',
        },
      }),
    });
    expect(
      decide({
        facts: stageFacts({
          stage: {
            stage: 'washing',
            machineIds: [ids.machine],
          },
          batch: { status: 'sorting' },
          machines: [
            {
              id: ids.machine,
              stationKind: 'washing',
              effectiveCapacityLbs: 10,
              active: true,
              overlaps: false,
            },
          ],
        }),
        policy: insufficient,
      }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        failure: { code: 'machine_capacity_insufficient', kind: 'conflict' },
      },
    });
  });

  it('returns and then consumes the exact early-start confirmation', () => {
    const timing = {
      plannedStartAt: '2026-08-21T15:00:00.000Z',
      plannedEndAt: '2026-08-21T15:56:00.000Z',
      observedAt: now.toISOString(),
      remainingMilliseconds: 40 * 60_000,
    } as const;
    const policy = makePolicy({
      evaluateStageTransition: () => ({
        tag: 'ok',
        value: {
          status: 'confirmation_required',
          action: 'start',
          code: 'PLANNED_START_NOT_REACHED',
          message: 'This stage is scheduled to start later.',
          timing,
        },
      }),
    });

    expect(decide({ policy })).toEqual({
      kind: 'confirmation',
      result: {
        status: 'confirmation_required',
        stageRunId: ids.stage,
        stageVersion: 3,
        code: 'PLANNED_START_NOT_REACHED',
        message: 'This stage is scheduled to start later.',
        confirmation,
        timing,
        replayed: false,
      },
    });
    expect(
      decide({ policy, command: startCommand({ confirmation }) }),
    ).toMatchObject({
      kind: 'commit',
      plan: {
        stageLifecycle: { from: 'planned', state: 'started' },
        audit: {
          earlyStart: {
            actorId: ids.actor,
            confirmationHash: confirmation.confirmationHash,
            confirmationObservedAt: confirmation.observedAt,
            confirmedAt: now.toISOString(),
            plannedStartAt: timing.plannedStartAt,
            plannedEndAt: timing.plannedEndAt,
            remainingMilliseconds: timing.remainingMilliseconds,
          },
        },
      },
    });
  });

  it('rejects a stale early-start confirmation without a mutation plan', () => {
    const policy = makePolicy({
      evaluateStageTransition: () => ({
        tag: 'ok',
        value: {
          status: 'confirmation_required',
          action: 'start',
          code: 'PLANNED_START_NOT_REACHED',
          message: 'This stage is scheduled to start later.',
          timing: {
            plannedStartAt: '2026-08-21T15:00:00.000Z',
            plannedEndAt: '2026-08-21T15:56:00.000Z',
            observedAt: now.toISOString(),
            remainingMilliseconds: 40 * 60_000,
          },
        },
      }),
      matchesStageStartConfirmation: () => false,
    });

    expect(
      decide({ policy, command: startCommand({ confirmation }) }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        kind: 'expected',
        failure: { code: 'stage_start_confirmation_stale', kind: 'conflict' },
      },
    });
  });

  it('returns and then consumes the exact early-completion confirmation', () => {
    const timing = {
      actualStartAt: plannedStartAt,
      plannedEndAt,
      completionBoundaryAt: plannedEndAt,
      observedAt: now.toISOString(),
      plannedDurationMilliseconds: 56 * 60_000,
      elapsedMilliseconds: 20 * 60_000,
      remainingMilliseconds: 36 * 60_000,
    } as const;
    const policy = makePolicy({
      evaluateStageTransition: () => ({
        tag: 'ok',
        value: {
          status: 'confirmation_required',
          action: 'complete',
          code: 'PULSE_BOUNDARY_NOT_REACHED',
          message:
            'This stage has not yet occupied its planned production pulse.',
          timing,
        },
      }),
    });
    const facts = stageFacts({
      stage: { status: 'started', actualStartAt: plannedStartAt },
      batch: { status: 'sorting' },
      attempts: [{ id: ids.attempt, status: 'assigned' }],
      batchMembershipFrozen: true,
    });

    expect(decide({ facts, policy, command: completeCommand() })).toEqual({
      kind: 'confirmation',
      result: {
        status: 'confirmation_required',
        stageRunId: ids.stage,
        stageVersion: 3,
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message:
          'This stage has not yet occupied its planned production pulse.',
        confirmation,
        timing,
        replayed: false,
      },
    });
    expect(
      decide({
        facts,
        policy,
        command: completeCommand({ confirmation }),
      }),
    ).toMatchObject({
      kind: 'commit',
      plan: {
        eventType: 'stage_completed',
        stageLifecycle: { from: 'started', state: 'completed' },
        batchLifecycle: null,
        freezeMembership: false,
        attemptLifecycles: [
          {
            attemptId: ids.attempt,
            stageRunId: ids.stage,
            lifecycle: { from: 'assigned', state: 'completed' },
          },
        ],
        audit: {
          earlyCompletion: {
            actorId: ids.actor,
            confirmationHash: confirmation.confirmationHash,
            confirmationObservedAt: confirmation.observedAt,
            confirmedAt: now.toISOString(),
            actualStartAt: timing.actualStartAt,
            plannedEndAt: timing.plannedEndAt,
            completionBoundaryAt: timing.completionBoundaryAt,
            plannedDurationMilliseconds: timing.plannedDurationMilliseconds,
            elapsedMilliseconds: timing.elapsedMilliseconds,
            remainingMilliseconds: timing.remainingMilliseconds,
          },
        },
      },
    });
  });

  it('keeps an inconsistent nonterminal batch state as an invariant rejection', () => {
    expect(
      decide({
        facts: stageFacts({
          stage: { stage: 'washing', status: 'started' },
          batch: { status: 'drying' },
          attempts: [{ id: ids.attempt, status: 'assigned' }],
        }),
        command: completeCommand(),
      }),
    ).toEqual({
      kind: 'reject',
      rejection: {
        kind: 'invariant',
        failure: {
          code: 'production_batch_state_inconsistent',
          message:
            'The production batch state does not match its active stage.',
          safeMessage:
            'The production batch state does not match its active stage.',
        },
      },
    });
  });

  it('rejects completion when no assigned stage attempt remains', () => {
    expect(
      decide({
        facts: stageFacts({
          stage: { status: 'started' },
          batch: { status: 'sorting' },
          attempts: [{ id: ids.attempt, status: 'released' }],
        }),
        command: completeCommand(),
      }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        kind: 'expected',
        failure: { code: 'production_stage_attempts_missing' },
      },
    });
  });

  it('returns the exact terminal batch, order, run, and shift plan', () => {
    expect(
      decide({
        facts: stageFacts({
          stage: {
            stage: 'folding_packaging',
            status: 'started',
            actualStartAt: plannedStartAt,
          },
          batch: { status: 'folding_packaging' },
          attempts: [{ id: ids.attempt, status: 'assigned' }],
          activeOrders: [
            {
              id: ids.order,
              status: 'scheduled',
              executionStatus: 'scheduled',
              resolutionState: 'open',
              version: 7,
            },
          ],
          batchMembershipFrozen: true,
        }),
        command: completeCommand(),
      }),
    ).toEqual({
      kind: 'commit',
      plan: {
        eventType: 'stage_completed',
        stageLifecycle: { from: 'started', state: 'completed' },
        batchId: ids.batch,
        batchExpectedVersion: 2,
        batchState: 'folding_packaging',
        batchLifecycle: { from: 'folding_packaging', state: 'finished' },
        freezeMembership: false,
        attemptLifecycles: [
          {
            attemptId: ids.attempt,
            stageRunId: ids.stage,
            lifecycle: { from: 'assigned', state: 'completed' },
          },
        ],
        terminalLifecycle: {
          run: { from: 'started', state: 'completed' },
          shift: { from: 'open', state: 'closed' },
          orders: [
            {
              productionOrderId: ids.order,
              persistedState: 'scheduled',
              expectedVersion: 7,
              lifecycle: { from: 'scheduled', state: 'finished' },
            },
          ],
        },
        audit: {},
      },
    });
  });

  it('rejects an invalid terminal run decision without weakening it', () => {
    expect(
      decide({
        facts: stageFacts({
          stage: {
            stage: 'folding_packaging',
            status: 'started',
            actualStartAt: plannedStartAt,
          },
          batch: { status: 'folding_packaging' },
          attempts: [{ id: ids.attempt, status: 'assigned' }],
          activeOrders: [
            {
              id: ids.order,
              status: 'scheduled',
              executionStatus: 'scheduled',
              resolutionState: 'open',
              version: 7,
            },
          ],
        }),
        command: completeCommand(),
        policy: makePolicy({
          evaluateProductionRunTransition: () => ({
            tag: 'err',
            error: {
              code: 'PRODUCTION_RUN_EVENT_NOT_ALLOWED',
              message: 'The production run event is not allowed.',
            },
          }),
        }),
      }),
    ).toMatchObject({
      kind: 'reject',
      rejection: {
        kind: 'expected',
        failure: { code: 'production_run_transition_invalid' },
      },
    });
  });
});
