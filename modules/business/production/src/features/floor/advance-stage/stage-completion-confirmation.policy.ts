import { sha256Text } from '@pressly/codec/node';
import type { ProductionStageCompletionTiming } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionStageCompletionConfirmationRequiredResult } from './advance-production-stage.model.ts';

type ConfirmationIdentity = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
}>;

type ConfirmationInput = ConfirmationIdentity &
  Readonly<{
    timing: ProductionStageCompletionTiming;
    observedAt: string;
  }>;

const isCanonicalInstant = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
};

const confirmationHash = (input: ConfirmationInput): string =>
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

export const makeStageCompletionConfirmationRequired = (
  input: ConfirmationIdentity &
    Readonly<{
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      timing: ProductionStageCompletionTiming;
    }>,
): ProductionStageCompletionConfirmationRequiredResult => ({
  status: 'confirmation_required',
  stageRunId: input.stageRunId,
  stageVersion: input.expectedVersion,
  code: input.code,
  message: input.message,
  confirmation: {
    observedAt: input.timing.observedAt,
    confirmationHash: confirmationHash({
      ...input,
      observedAt: input.timing.observedAt,
    }),
  },
  timing: input.timing,
  replayed: false,
});

export const matchesStageCompletionConfirmation = (
  input: ConfirmationIdentity &
    Readonly<{
      timing: ProductionStageCompletionTiming;
      now: Date;
      confirmation: Readonly<{
        observedAt: string;
        confirmationHash: string;
      }>;
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
    confirmationHash({ ...input, observedAt: input.confirmation.observedAt })
  );
};
