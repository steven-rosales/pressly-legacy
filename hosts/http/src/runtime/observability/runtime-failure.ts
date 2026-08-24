import { redactLogFields } from '@pressly/logging';
import {
  attemptObservation,
  decideObservation,
  type ObservationDecision,
} from '@pressly/observability';
import type { HttpBoundaryRuntime } from '../types.ts';
import { logObservation, toObservationLogFields } from './observation-log.ts';

export const observeApiRuntimeFailure = (
  runtime: Pick<HttpBoundaryRuntime, 'logger' | 'observability'>,
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

  const logLevel = decision.logLevel;
  if (logLevel !== undefined)
    attemptObservation(() =>
      logObservation(
        runtime.logger,
        logLevel,
        'api.runtime.failure',
        toObservationLogFields({
          phase: input.phase,
          operation: input.operation,
          reason: decision.reason,
          error: input.error,
        }),
      ),
    );

  const counter = decision.counter;
  if (counter !== undefined)
    attemptObservation(() =>
      runtime.observability.counters.increment(counter, {
        phase: input.phase,
        operation: input.operation,
        reason: decision.reason,
      }),
    );

  if (decision.report)
    attemptObservation(() =>
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
      }),
    );

  return decision;
};
