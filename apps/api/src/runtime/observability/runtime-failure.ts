import { redactLogFields } from '@pressly/logging';
import { decideObservation, type ObservationDecision } from '@pressly/metrics';
import type { ApiRuntime } from '../api-runtime.ts';
import { logObservation, toObservationLogFields } from './observation-log.ts';

export const observeApiRuntimeFailure = (
  runtime: Pick<ApiRuntime, 'logger' | 'observability'>,
  input: {
    error: unknown;
    phase: 'startup' | 'server';
    operation: string;
  },
): ObservationDecision => {
  const decision = decideObservation({
    kind: 'runtime_failure',
    source: 'api',
    phase: input.phase,
    operation: input.operation,
  });

  if (decision.logLevel !== undefined)
    logObservation(
      runtime.logger,
      decision.logLevel,
      'api.runtime.failure',
      toObservationLogFields({
        phase: input.phase,
        operation: input.operation,
        reason: decision.reason,
        error: input.error,
      }),
    );

  if (decision.counter !== undefined)
    runtime.observability.counters.increment(decision.counter, {
      phase: input.phase,
      operation: input.operation,
      reason: decision.reason,
    });

  if (decision.report)
    runtime.observability.errors.capture(input.error, {
      source: 'api',
      operation: input.operation,
      tags: {
        phase: input.phase,
        reason: decision.reason,
      },
      extra: {
        error: redactLogFields(input.error),
      },
    });

  return decision;
};
