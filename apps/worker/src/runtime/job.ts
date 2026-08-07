import { makeAggregateError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import {
  attemptObservation,
  attemptObservationValue,
  isolateTraceSink,
  nullTraceSink,
  type CounterSink,
  type MeasurementSink,
  type TraceSpan,
  type TraceSink,
  type WorkerJobName,
} from '@pressly/observability';

export type WorkerJob = Readonly<{ runOnce: () => Promise<number> }>;

type WorkerJobPassOutcome = 'busy' | 'idle' | 'failed';

const defaultIdleSampleIntervalNanoseconds = 60_000_000_000n;

export const observeWorkerJob = (input: {
  name: WorkerJobName;
  job: WorkerJob;
  counters: CounterSink;
  measurements: MeasurementSink;
  trace?: TraceSink;
  nowNanoseconds?: () => bigint;
  idleSampleIntervalNanoseconds?: bigint;
}): WorkerJob => {
  const trace = isolateTraceSink(input.trace ?? nullTraceSink);
  const nowNanoseconds = input.nowNanoseconds ?? process.hrtime.bigint;
  const idleSampleIntervalNanoseconds =
    input.idleSampleIntervalNanoseconds ?? defaultIdleSampleIntervalNanoseconds;
  let lastIdleObservationAt: bigint | undefined;

  const finish = (
    span: TraceSpan,
    outcome: WorkerJobPassOutcome,
    startedAt: bigint | undefined,
    processed: number | undefined,
  ): void => {
    const finishedAt = attemptObservationValue(nowNanoseconds);
    const shouldRecord =
      outcome !== 'idle' ||
      (finishedAt.tag === 'observed' &&
        (lastIdleObservationAt === undefined ||
          finishedAt.value - lastIdleObservationAt >=
            idleSampleIntervalNanoseconds));

    if (outcome === 'idle' && shouldRecord && finishedAt.tag === 'observed')
      lastIdleObservationAt = finishedAt.value;

    if (shouldRecord) {
      const labels = { job: input.name, outcome };
      attemptObservation(() =>
        input.counters.increment('worker.job_passes', labels),
      );

      if (startedAt !== undefined && finishedAt.tag === 'observed')
        attemptObservation(() =>
          input.measurements.observe(
            'worker.job_pass_duration_seconds',
            Math.max(0, Number(finishedAt.value - startedAt) / 1_000_000_000),
            labels,
          ),
        );
    }

    attemptObservation(() => span.setAttribute('outcome', outcome));
    if (processed !== undefined)
      attemptObservation(() => span.setAttribute('batch_size', processed));
    attemptObservation(() =>
      span.setStatus(outcome === 'failed' ? 'error' : 'ok'),
    );
  };

  return Object.freeze({
    runOnce: () =>
      trace.startActiveSpan(
        {
          name: input.name,
          operation: 'worker.job',
          attributes: { job: input.name },
        },
        async (span) => {
          const started = attemptObservationValue(nowNanoseconds);
          const startedAt =
            started.tag === 'observed' ? started.value : undefined;

          try {
            const processed = await input.job.runOnce();
            finish(
              span,
              processed === 0 ? 'idle' : 'busy',
              startedAt,
              processed,
            );
            return processed;
          } catch (error: unknown) {
            finish(span, 'failed', startedAt, undefined);
            throw error;
          }
        },
      ),
  });
};

export const makeSequentialJob = (jobs: readonly WorkerJob[]): WorkerJob => ({
  runOnce: async () => {
    let processed = 0;
    const failures: unknown[] = [];

    for (const job of jobs) {
      try {
        processed += await job.runOnce();
      } catch (error: unknown) {
        failures.push(error);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw unexpectedError({
        code: 'worker_peer_jobs_failed',
        message: `${failures.length} independent worker jobs failed in one pass.`,
        details: { failureCount: failures.length },
        cause: makeAggregateError({
          errors: failures,
          message: 'Independent worker jobs failed.',
        }),
      });

    return processed;
  },
});
