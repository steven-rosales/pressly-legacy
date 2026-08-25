import { describe, expect, it } from 'vitest';
import {
  makeAdvanceStageCompletionConfirmationRequired,
  makeAdvanceStageStartConfirmationRequired,
  matchesAdvanceStageCompletionConfirmation,
  matchesAdvanceStageStartConfirmation,
} from './confirmation.ts';

const identity = {
  locationId: 'location-1',
  stageRunId: '10000000-0000-4000-8000-000000000002',
  actorId: '10000000-0000-4000-8000-000000000001',
  expectedVersion: 3,
} as const;

const startTiming = {
  plannedStartAt: '2026-08-21T15:00:00.000Z',
  plannedEndAt: '2026-08-21T15:56:00.000Z',
  observedAt: '2026-08-21T14:20:00.000Z',
  remainingMilliseconds: 2_400_000,
} as const;

const completionTiming = {
  actualStartAt: '2026-08-21T14:00:00.000Z',
  plannedEndAt: '2026-08-21T15:56:00.000Z',
  completionBoundaryAt: '2026-08-21T15:00:00.000Z',
  observedAt: '2026-08-21T14:20:00.000Z',
  plannedDurationMilliseconds: 3_360_000,
  elapsedMilliseconds: 1_200_000,
  remainingMilliseconds: 2_400_000,
} as const;

describe('advance-stage confirmation ownership', () => {
  it('constructs and matches the exact actor/version/timing-bound start hash', () => {
    const required = makeAdvanceStageStartConfirmationRequired({
      ...identity,
      code: 'PLANNED_START_NOT_REACHED',
      message: 'This stage is scheduled to start later.',
      timing: startTiming,
    });

    expect(required).toEqual({
      status: 'confirmation_required',
      stageRunId: identity.stageRunId,
      stageVersion: 3,
      code: 'PLANNED_START_NOT_REACHED',
      message: 'This stage is scheduled to start later.',
      confirmation: {
        observedAt: startTiming.observedAt,
        confirmationHash:
          '1d9046e664186da5cb6ac1fa06a8ab69c193f931ddbf3a3756bddb914fb314c0',
      },
      timing: startTiming,
      replayed: false,
    });
    expect(
      matchesAdvanceStageStartConfirmation({
        ...identity,
        timing: startTiming,
        now: new Date('2026-08-21T14:30:00.000Z'),
        confirmation: required.confirmation,
      }),
    ).toBe(true);
    expect(
      matchesAdvanceStageStartConfirmation({
        ...identity,
        actorId: '10000000-0000-4000-8000-000000000099',
        timing: startTiming,
        now: new Date('2026-08-21T14:30:00.000Z'),
        confirmation: required.confirmation,
      }),
    ).toBe(false);
  });

  it('rejects noncanonical, no-longer-early, and future start observations', () => {
    const required = makeAdvanceStageStartConfirmationRequired({
      ...identity,
      code: 'PLANNED_START_NOT_REACHED',
      message: 'This stage is scheduled to start later.',
      timing: startTiming,
    });
    const match = (observedAt: string, now: string) =>
      matchesAdvanceStageStartConfirmation({
        ...identity,
        timing: startTiming,
        now: new Date(now),
        confirmation: { ...required.confirmation, observedAt },
      });

    expect(match('2026-08-21T14:20:00Z', '2026-08-21T14:30:00.000Z')).toBe(
      false,
    );
    expect(match(startTiming.plannedStartAt, '2026-08-21T15:01:00.000Z')).toBe(
      false,
    );
    expect(match(startTiming.observedAt, '2026-08-21T14:10:00.000Z')).toBe(
      false,
    );
  });

  it('constructs and matches the exact early-completion hash', () => {
    const required = makeAdvanceStageCompletionConfirmationRequired({
      ...identity,
      code: 'PULSE_BOUNDARY_NOT_REACHED',
      message: 'This stage has not occupied its production pulse.',
      timing: completionTiming,
    });

    expect(required.confirmation).toEqual({
      observedAt: completionTiming.observedAt,
      confirmationHash:
        '90467c0cc61e686d9f058c6a8f1e2a606d24f465529cbdda561d020c315dfa99',
    });
    expect(
      matchesAdvanceStageCompletionConfirmation({
        ...identity,
        timing: completionTiming,
        now: new Date('2026-08-21T14:30:00.000Z'),
        confirmation: required.confirmation,
      }),
    ).toBe(true);
    expect(
      matchesAdvanceStageCompletionConfirmation({
        ...identity,
        expectedVersion: 4,
        timing: completionTiming,
        now: new Date('2026-08-21T14:30:00.000Z'),
        confirmation: required.confirmation,
      }),
    ).toBe(false);
  });

  it('rejects completion observations outside the actual-start/boundary window', () => {
    const required = makeAdvanceStageCompletionConfirmationRequired({
      ...identity,
      code: 'PULSE_BOUNDARY_NOT_REACHED',
      message: 'This stage has not occupied its production pulse.',
      timing: completionTiming,
    });
    const match = (observedAt: string) =>
      matchesAdvanceStageCompletionConfirmation({
        ...identity,
        timing: completionTiming,
        now: new Date('2026-08-21T15:10:00.000Z'),
        confirmation: { ...required.confirmation, observedAt },
      });

    expect(match('2026-08-21T13:59:59.999Z')).toBe(false);
    expect(match(completionTiming.completionBoundaryAt)).toBe(false);
  });
});
