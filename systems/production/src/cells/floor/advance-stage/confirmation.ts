import { sha256Text } from '@pressly/codec/node';
import type {
  AdvanceStageCompletionConfirmationRequired,
  AdvanceStageCompletionTiming,
  AdvanceStagePolicy,
  AdvanceStageStartConfirmationRequired,
  AdvanceStageStartTiming,
  AdvanceStageTimingConfirmation,
} from './types.ts';

type ConfirmationIdentity = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
}>;

type StartConfirmationInput = ConfirmationIdentity &
  Readonly<{
    timing: AdvanceStageStartTiming;
    observedAt: string;
  }>;

type CompletionConfirmationInput = ConfirmationIdentity &
  Readonly<{
    timing: AdvanceStageCompletionTiming;
    observedAt: string;
  }>;

export type AdvanceStageLifecyclePolicy = Omit<
  AdvanceStagePolicy,
  | 'makeStageStartConfirmationRequired'
  | 'matchesStageStartConfirmation'
  | 'makeStageCompletionConfirmationRequired'
  | 'matchesStageCompletionConfirmation'
>;

const isCanonicalInstant = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
};

const startConfirmationHash = (input: StartConfirmationInput): string =>
  sha256Text(
    [
      'production-stage-early-start-v1',
      input.locationId,
      input.stageRunId,
      input.actorId,
      String(input.expectedVersion),
      input.timing.plannedStartAt,
      input.timing.plannedEndAt,
      input.observedAt,
    ].join('\n'),
  );

const completionConfirmationHash = (
  input: CompletionConfirmationInput,
): string =>
  sha256Text(
    [
      'production-stage-early-completion-v1',
      input.locationId,
      input.stageRunId,
      input.actorId,
      String(input.expectedVersion),
      input.timing.actualStartAt,
      input.timing.plannedEndAt,
      input.timing.completionBoundaryAt,
      String(input.timing.plannedDurationMilliseconds),
      input.observedAt,
    ].join('\n'),
  );

export const makeAdvanceStageStartConfirmationRequired = (
  input: ConfirmationIdentity &
    Readonly<{
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      timing: AdvanceStageStartTiming;
    }>,
): AdvanceStageStartConfirmationRequired => ({
  status: 'confirmation_required',
  stageRunId: input.stageRunId,
  stageVersion: input.expectedVersion,
  code: input.code,
  message: input.message,
  confirmation: {
    observedAt: input.timing.observedAt,
    confirmationHash: startConfirmationHash({
      ...input,
      observedAt: input.timing.observedAt,
    }),
  },
  timing: input.timing,
  replayed: false,
});

export const matchesAdvanceStageStartConfirmation = (
  input: ConfirmationIdentity &
    Readonly<{
      timing: AdvanceStageStartTiming;
      now: Date;
      confirmation: AdvanceStageTimingConfirmation;
    }>,
): boolean => {
  const observedAt = Date.parse(input.confirmation.observedAt);
  if (
    !isCanonicalInstant(input.confirmation.observedAt) ||
    observedAt >= Date.parse(input.timing.plannedStartAt) ||
    observedAt > input.now.getTime()
  )
    return false;

  return (
    input.confirmation.confirmationHash ===
    startConfirmationHash({
      ...input,
      observedAt: input.confirmation.observedAt,
    })
  );
};

export const makeAdvanceStageCompletionConfirmationRequired = (
  input: ConfirmationIdentity &
    Readonly<{
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      timing: AdvanceStageCompletionTiming;
    }>,
): AdvanceStageCompletionConfirmationRequired => ({
  status: 'confirmation_required',
  stageRunId: input.stageRunId,
  stageVersion: input.expectedVersion,
  code: input.code,
  message: input.message,
  confirmation: {
    observedAt: input.timing.observedAt,
    confirmationHash: completionConfirmationHash({
      ...input,
      observedAt: input.timing.observedAt,
    }),
  },
  timing: input.timing,
  replayed: false,
});

export const matchesAdvanceStageCompletionConfirmation = (
  input: ConfirmationIdentity &
    Readonly<{
      timing: AdvanceStageCompletionTiming;
      now: Date;
      confirmation: AdvanceStageTimingConfirmation;
    }>,
): boolean => {
  const observedAt = Date.parse(input.confirmation.observedAt);
  if (
    !isCanonicalInstant(input.confirmation.observedAt) ||
    observedAt < Date.parse(input.timing.actualStartAt) ||
    observedAt >= Date.parse(input.timing.completionBoundaryAt) ||
    observedAt > input.now.getTime()
  )
    return false;

  return (
    input.confirmation.confirmationHash ===
    completionConfirmationHash({
      ...input,
      observedAt: input.confirmation.observedAt,
    })
  );
};

export const makeAdvanceStagePolicy = (
  lifecyclePolicy: AdvanceStageLifecyclePolicy,
): AdvanceStagePolicy =>
  Object.freeze({
    ...lifecyclePolicy,
    makeStageStartConfirmationRequired:
      makeAdvanceStageStartConfirmationRequired,
    matchesStageStartConfirmation: matchesAdvanceStageStartConfirmation,
    makeStageCompletionConfirmationRequired:
      makeAdvanceStageCompletionConfirmationRequired,
    matchesStageCompletionConfirmation:
      matchesAdvanceStageCompletionConfirmation,
  });
