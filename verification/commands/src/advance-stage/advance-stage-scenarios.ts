import type { AdvanceStageScenario } from './advance-stage-types.ts';

export const advanceStageFixtureIds = Object.freeze({
  actor: '10000000-0000-4000-8000-000000000001',
  otherActor: '10000000-0000-4000-8000-000000000013',
  shift: '10000000-0000-4000-8000-000000000002',
  sortingStation: '10000000-0000-4000-8000-000000000003',
  washingStation: '10000000-0000-4000-8000-000000000004',
  config: '10000000-0000-4000-8000-000000000005',
  schedule: '10000000-0000-4000-8000-000000000006',
  run: '10000000-0000-4000-8000-000000000007',
  batch: '10000000-0000-4000-8000-000000000008',
  sortingStage: '10000000-0000-4000-8000-000000000009',
  washingStage: '10000000-0000-4000-8000-000000000010',
  washer: '10000000-0000-4000-8000-000000000011',
  assignment: '10000000-0000-4000-8000-000000000012',
});

export const advanceStageLocationId = 'location-1';
export const advanceStagePlannedStart = new Date('2026-08-21T14:00:00.000Z');
export const advanceStagePlannedEnd = new Date('2026-08-21T14:56:00.000Z');

const startCommand = (
  input: Readonly<{
    idempotencyKey: string;
    stageRunId?: string;
    expectedVersion?: number;
    actorId?: string;
  }>,
) => ({
  locationId: advanceStageLocationId,
  stageRunId: input.stageRunId ?? advanceStageFixtureIds.sortingStage,
  expectedVersion: input.expectedVersion ?? 1,
  actorId: input.actorId ?? advanceStageFixtureIds.actor,
  transition: 'start' as const,
  idempotencyKey: input.idempotencyKey,
});

const replayCommand = startCommand({
  idempotencyKey: 'conformance-identical-replay',
});

export const advanceStageScenarios: readonly AdvanceStageScenario[] =
  Object.freeze([
    Object.freeze({
      name: 'ordinary start success',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({ idempotencyKey: 'conformance-start-success' }),
      ]),
    }),
    Object.freeze({
      name: 'confirmation required without mutation',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T13:30:00.000Z'),
      commands: Object.freeze([
        startCommand({ idempotencyKey: 'conformance-confirmation-required' }),
      ]),
    }),
    Object.freeze({
      name: 'stale stage version rejection',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({
          idempotencyKey: 'conformance-stale-version',
          expectedVersion: 2,
        }),
      ]),
    }),
    Object.freeze({
      name: 'identical key replay',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([replayCommand, replayCommand]),
    }),
    Object.freeze({
      name: 'late assignment failure rolls back',
      executionMode: 'sequential' as const,
      fixture: Object.freeze({
        target: 'washing' as const,
        washingAssignmentStatus: 'active' as const,
      }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({
          idempotencyKey: 'conformance-late-rollback',
          stageRunId: advanceStageFixtureIds.washingStage,
        }),
      ]),
    }),
    Object.freeze({
      name: 'concurrent different keys share one expected version',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({ idempotencyKey: 'conformance-concurrent-version-a' }),
        startCommand({ idempotencyKey: 'conformance-concurrent-version-b' }),
      ]),
    }),
    Object.freeze({
      name: 'concurrent same key and same payload',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({ idempotencyKey: 'conformance-concurrent-replay' }),
        startCommand({ idempotencyKey: 'conformance-concurrent-replay' }),
      ]),
    }),
    Object.freeze({
      name: 'concurrent same key and different payload',
      executionMode: 'concurrent' as const,
      fixture: Object.freeze({ target: 'sorting' as const }),
      now: new Date('2026-08-21T15:00:00.000Z'),
      commands: Object.freeze([
        startCommand({ idempotencyKey: 'conformance-concurrent-conflict' }),
        startCommand({
          idempotencyKey: 'conformance-concurrent-conflict',
          actorId: advanceStageFixtureIds.otherActor,
        }),
      ]),
    }),
  ]);
