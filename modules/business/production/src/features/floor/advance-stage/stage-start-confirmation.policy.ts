import { sha256Text } from '@pressly/codec/node';
import type { ProductionStageStartTiming } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionStageStartConfirmationRequiredResult } from './advance-production-stage.model.ts';

type ConfirmationIdentity = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
}>;

type ConfirmationInput = ConfirmationIdentity &
  Readonly<{
    timing: ProductionStageStartTiming;
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

export const makeStageStartConfirmationRequired = (
  input: ConfirmationIdentity &
    Readonly<{
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      timing: ProductionStageStartTiming;
    }>,
): ProductionStageStartConfirmationRequiredResult => ({
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

export const matchesStageStartConfirmation = (
  input: ConfirmationIdentity &
    Readonly<{
      timing: ProductionStageStartTiming;
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
    observedAt >= Date.parse(input.timing.plannedStartAt) ||
    observedAt > input.now.getTime()
  )
    return false;

  return (
    input.confirmation.confirmationHash ===
    confirmationHash({ ...input, observedAt: input.confirmation.observedAt })
  );
};
