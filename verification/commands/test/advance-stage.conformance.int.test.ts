import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  advanceStageScenarios,
  createAdvanceStageTestDatabase,
  observeAdvanceStageScenario,
  type AdvanceStageObservation,
  type AdvanceStageScenario,
} from '../src/public.ts';

const database = createAdvanceStageTestDatabase();

beforeAll(database.check);
afterAll(database.close);

const expectNoMutation = (observation: AdvanceStageObservation): void => {
  expect(observation.stateDelta.after).toEqual(observation.stateDelta.before);
  expect(observation.auditEvents).toEqual([]);
  expect(observation.idempotencyReceipt).toBeNull();
  expect(observation.liveRevision.after).toBe(observation.liveRevision.before);
  expect(observation.signals).toEqual([]);
};

const expectOneCommittedSignal = (
  observation: AdvanceStageObservation,
): void => {
  expect(observation.signals).toEqual([
    {
      signal: 'batchFrozen',
      source: 'stage_start',
      afterCommit: true,
      committedMutationOrdinal: 1,
    },
  ]);
};

const expectOneCommittedStart = (
  scenario: AdvanceStageScenario,
  observation: AdvanceStageObservation,
): void => {
  expect(observation.stateDelta.after).toMatchObject({
    stage: {
      status: 'started',
      version: 2,
      actualStartAt: scenario.now.toISOString(),
      startedBy: scenario.commands[0]?.actorId,
    },
    batch: {
      status: 'sorting',
      version: 2,
      membershipFrozenAt: scenario.now.toISOString(),
      membershipFrozenBy: scenario.commands[0]?.actorId,
    },
    run: { queueVersion: 2 },
  });
  expect(observation.auditEvents).toHaveLength(1);
  expect(observation.auditEvents[0]).toMatchObject({
    eventType: 'stage_started',
    idempotencyKey: scenario.commands[0]?.idempotencyKey,
  });
  expect(observation.idempotencyReceipt).not.toBeNull();
  expect(observation.liveRevision).toEqual({ before: 0, after: 1 });
  expectOneCommittedSignal(observation);
};

const mutationOutcome = (scenario: AdvanceStageScenario) => ({
  kind: 'success',
  value: {
    kind: 'mutation',
    entityId: scenario.commands[0]?.stageRunId,
    version: 2,
    replayed: false,
  },
});

const replayOutcome = (scenario: AdvanceStageScenario) => ({
  kind: 'success',
  value: {
    kind: 'mutation',
    entityId: scenario.commands[0]?.stageRunId,
    version: 2,
    replayed: true,
  },
});

const versionConflictOutcome = {
  kind: 'failure',
  failure: {
    code: 'stage_run_version_conflict',
    kind: 'conflict',
    message: 'The production stage changed before the command.',
    safeMessage: 'The production stage changed before the command.',
    status: null,
  },
};

const idempotencyConflictOutcome = {
  kind: 'failure',
  failure: {
    code: 'production_idempotency_conflict',
    kind: 'conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
    status: null,
  },
};

const expectCharacterizedSemantics = (
  scenario: AdvanceStageScenario,
  observation: AdvanceStageObservation,
): void => {
  expect(observation.execution).toEqual({
    mode: scenario.executionMode,
    initialIdempotencyMisses: scenario.executionMode === 'concurrent' ? 2 : 0,
  });
  if (scenario.name === 'ordinary start success') {
    expect(observation.outcome).toEqual([mutationOutcome(scenario)]);
    expectOneCommittedStart(scenario, observation);
    return;
  }

  if (scenario.name === 'confirmation required without mutation') {
    expect(observation.outcome[0]).toMatchObject({
      kind: 'success',
      value: {
        kind: 'confirmation-required',
        code: 'PLANNED_START_NOT_REACHED',
        replayed: false,
      },
    });
    expectNoMutation(observation);
    return;
  }

  if (scenario.name === 'stale stage version rejection') {
    expect(observation.outcome).toEqual([versionConflictOutcome]);
    expectNoMutation(observation);
    return;
  }

  if (scenario.name === 'identical key replay') {
    expect(observation.outcome).toEqual([
      mutationOutcome(scenario),
      replayOutcome(scenario),
    ]);
    expectOneCommittedStart(scenario, observation);
    return;
  }

  if (scenario.name === 'late assignment failure rolls back') {
    expect(observation.outcome).toEqual([
      {
        kind: 'unexpected',
        error: {
          code: 'production_stage_machine_assignment_state_invalid',
          kind: 'InvariantViolationError',
          message: 'Stage machine assignment state is inconsistent.',
          safeMessage: 'Production state is inconsistent.',
          status: 500,
        },
      },
    ]);
    expectNoMutation(observation);
    return;
  }

  expect(observation.outcome).toHaveLength(2);
  expect(observation.outcome).toContainEqual(mutationOutcome(scenario));
  if (scenario.name === 'concurrent different keys share one expected version')
    expect(observation.outcome).toContainEqual(versionConflictOutcome);
  else if (scenario.name === 'concurrent same key and same payload')
    expect(observation.outcome).toContainEqual(replayOutcome(scenario));
  else expect(observation.outcome).toContainEqual(idempotencyConflictOutcome);
  expectOneCommittedStart(scenario, observation);
};

describe('production.advance-stage.v1 behavioral conformance', () => {
  it.each(advanceStageScenarios)('$name', async (scenario) => {
    const observation = await observeAdvanceStageScenario(database, scenario);

    expectCharacterizedSemantics(scenario, observation);
  });
});
