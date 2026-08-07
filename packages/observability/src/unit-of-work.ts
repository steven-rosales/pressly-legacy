import type { Result, ResultUnitOfWork, UnitOfWork } from '@pressly/kernel';
import type { CounterSink } from './counter.js';
import type { MeasurementSink } from './measurement.js';
import {
  attemptObservation,
  attemptObservationValue,
} from './observation-effect.js';
import {
  isolateTraceSink,
  nullTraceSink,
  type TraceSpan,
  type TraceSink,
} from './trace.js';
import type { TransactionOperation } from './metric-catalog.js';

export type TransactionOutcome = 'committed' | 'expected_rollback' | 'failed';

export type UnitOfWorkObservation = Readonly<{
  operation: TransactionOperation;
  counters: CounterSink;
  measurements: MeasurementSink;
  nowNanoseconds: () => bigint;
  trace?: TraceSink | undefined;
}>;

type ObserveUnitOfWorkInput<Operations> = UnitOfWorkObservation &
  Readonly<{ unitOfWork: UnitOfWork<Operations> }>;

type ObserveResultUnitOfWorkInput<Operations> = UnitOfWorkObservation &
  Readonly<{ unitOfWork: ResultUnitOfWork<Operations> }>;

const durationSeconds = (
  startedAt: bigint,
  nowNanoseconds: () => bigint,
): number | undefined => {
  const finishedAt = attemptObservationValue(nowNanoseconds);
  if (finishedAt.tag === 'failed') return undefined;

  return Math.max(0, Number(finishedAt.value - startedAt) / 1_000_000_000);
};

const recordTransaction = (input: {
  observation: UnitOfWorkObservation;
  span: TraceSpan;
  outcome: TransactionOutcome;
  durationSeconds: number | undefined;
}): void => {
  const labels = {
    operation: input.observation.operation,
    outcome: input.outcome,
  };

  attemptObservation(() =>
    input.observation.counters.increment('db.transactions', labels),
  );

  const observedDurationSeconds = input.durationSeconds;
  if (observedDurationSeconds !== undefined)
    attemptObservation(() =>
      input.observation.measurements.observe(
        'db.transaction_duration_seconds',
        observedDurationSeconds,
        labels,
      ),
    );

  attemptObservation(() => input.span.setAttribute('outcome', input.outcome));
  attemptObservation(() =>
    input.span.setStatus(input.outcome === 'failed' ? 'error' : 'ok'),
  );
};

const observeTransaction = async <Value>(input: {
  observation: UnitOfWorkObservation;
  span: TraceSpan;
  run: () => Promise<Value>;
  classify: (value: Value) => TransactionOutcome;
}): Promise<Value> => {
  const startedAt = attemptObservationValue(input.observation.nowNanoseconds);
  let outcome: TransactionOutcome = 'failed';

  try {
    const value = await input.run();
    outcome = input.classify(value);
    return value;
  } finally {
    recordTransaction({
      observation: input.observation,
      span: input.span,
      outcome,
      durationSeconds:
        startedAt.tag === 'observed'
          ? durationSeconds(startedAt.value, input.observation.nowNanoseconds)
          : undefined,
    });
  }
};

const transactionTrace = (observation: UnitOfWorkObservation): TraceSink =>
  isolateTraceSink(observation.trace ?? nullTraceSink);

export const observeUnitOfWork = <Operations>(
  input: ObserveUnitOfWorkInput<Operations>,
): UnitOfWork<Operations> => {
  const trace = transactionTrace(input);

  return Object.freeze({
    transaction: <Value>(
      work: (operations: Operations) => Promise<Value>,
    ): Promise<Value> =>
      trace.startActiveSpan(
        {
          name: input.operation,
          operation: 'db.transaction',
          attributes: { operation: input.operation },
        },
        (span) =>
          observeTransaction({
            observation: input,
            span,
            run: () => input.unitOfWork.transaction(work),
            classify: () => 'committed',
          }),
      ),
  });
};

/**
 * Observes the application-visible Result returned by a result-aware unit of
 * work. Apply this outside `defineResultUnitOfWork`; only that returned value
 * has translated its private rollback signal back into an expected Result.err.
 */
export const observeResultUnitOfWork = <Operations>(
  input: ObserveResultUnitOfWorkInput<Operations>,
): ResultUnitOfWork<Operations> => {
  const trace = transactionTrace(input);

  return Object.freeze({
    transaction: <Value, Failure>(
      work: (operations: Operations) => Promise<Result<Value, Failure>>,
    ): Promise<Result<Value, Failure>> =>
      trace.startActiveSpan(
        {
          name: input.operation,
          operation: 'db.transaction',
          attributes: { operation: input.operation },
        },
        (span) =>
          observeTransaction({
            observation: input,
            span,
            run: () => input.unitOfWork.transaction(work),
            classify: (value) =>
              value.tag === 'err' ? 'expected_rollback' : 'committed',
          }),
      ),
  });
};
