import { makeAggregateError, type AppError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import type { Logger } from '@pressly/logging';
import { attemptObservation } from '@pressly/observability';

export type ApiCleanupEffect = Readonly<{
  resource: string;
  run: () => Promise<void>;
}>;

export type ApiCleanupPlan = readonly (readonly ApiCleanupEffect[])[];

export type ApiCleanupFailure = Readonly<{
  resource: string;
  cause: unknown;
}>;

const runCleanupStage = async (
  stage: readonly ApiCleanupEffect[],
): Promise<readonly ApiCleanupFailure[]> => {
  const outcomes = await Promise.allSettled(
    stage.map((effect) => Promise.resolve().then(effect.run)),
  );

  return stage.flatMap((effect, index) => {
    const outcome = outcomes[index];
    return outcome?.status === 'rejected'
      ? [{ resource: effect.resource, cause: outcome.reason }]
      : [];
  });
};

/**
 * Interprets a declarative cleanup plan. Effects in one stage settle together;
 * later stages always run and therefore preserve dependency ordering without
 * allowing one rejected cleanup to skip its peers.
 */
export const runApiCleanupPlan = (
  plan: ApiCleanupPlan,
): Promise<readonly ApiCleanupFailure[]> =>
  plan.reduce<Promise<readonly ApiCleanupFailure[]>>(
    async (accumulated, stage) => [
      ...(await accumulated),
      ...(await runCleanupStage(stage)),
    ],
    Promise.resolve([]),
  );

export const apiCleanupError = (
  failures: readonly ApiCleanupFailure[],
): AppError =>
  unexpectedError({
    code: 'api_cleanup_failed',
    message: 'One or more API resources failed to close.',
    safeMessage: 'The API could not shut down cleanly.',
    details: { resources: failures.map((failure) => failure.resource) },
    cause: makeAggregateError({
      errors: failures.map((failure) => failure.cause),
      message: 'API resource cleanup failed.',
    }),
  });

export const cleanupApiOrThrow = async (
  plan: ApiCleanupPlan,
): Promise<void> => {
  const failures = await runApiCleanupPlan(plan);
  if (failures.length > 0) throw apiCleanupError(failures);
};

export const cleanupApiAfterFailure = async (input: {
  primaryError: unknown;
  plan: ApiCleanupPlan;
  logger: Logger;
}): Promise<never> => {
  const failures = await runApiCleanupPlan(input.plan);

  if (failures.length > 0)
    attemptObservation(() =>
      input.logger.error('api cleanup failed after primary failure', {
        error: apiCleanupError(failures),
      }),
    );

  throw input.primaryError;
};
