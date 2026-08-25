import type {
  ExecutableJobCatalog,
  JobTrigger,
  RetryManifest,
} from '@pressly/cells';
import { makeAggregateError } from '@pressly/errors/app-error';
import { unexpectedError, validationError } from '@pressly/errors/factories';
import type { JobInvocationOutcome } from '@pressly/jobs';

type JobCatalogEntry = ExecutableJobCatalog['entries'][number];

export type JobHostRegistration = Readonly<{
  operationId: string;
  observability: string;
  jobId: string;
  trigger: JobTrigger;
  queue: string | null;
  timeoutMs: number | null;
  retry: RetryManifest | null;
  invoke: (
    payload: unknown,
    signal: AbortSignal,
  ) => Promise<JobInvocationOutcome>;
}>;

export type JobExecutionPlatform = Readonly<{
  /**
   * The injected platform implementation owns polling, durable lease claim and
   * fenced transitions, retry scheduling, dead-letter disposition, and the
   * process-progress heartbeat. It does not imply lease renewal. The host
   * supplies declarations and handlers; it never creates another queue.
   */
  run: (
    input: Readonly<{
      jobs: readonly JobHostRegistration[];
      signal: AbortSignal;
    }>,
  ) => Promise<void>;
  shutdown: () => Promise<void>;
}>;

export type JobHostLifecycle = Readonly<{
  signal: AbortSignal;
  dispose: () => Promise<void>;
}>;

export type JobHostDependencies = Readonly<{
  execution: JobExecutionPlatform;
  startLifecycle: () => JobHostLifecycle;
}>;

const invalidContractInput = (entry: JobCatalogEntry, issues: unknown) =>
  validationError({
    code: 'job_cell_input_invalid',
    message: `Input decoding failed for job "${entry.surface.id}" and operation "${entry.operationId}".`,
    safeMessage: 'The job payload is invalid.',
    details: {
      jobId: entry.surface.id,
      operationId: entry.operationId,
      issues,
    },
  });

const registrationFrom = (entry: JobCatalogEntry): JobHostRegistration =>
  Object.freeze({
    operationId: entry.operationId,
    observability: entry.cell.observability.operation,
    jobId: entry.surface.id,
    trigger: entry.surface.trigger,
    queue: entry.surface.queue,
    timeoutMs: entry.surface.timeoutMs ?? entry.cell.timeoutMs,
    retry: entry.cell.retry,
    invoke: async (payload, _signal) => {
      const decoded = entry.decodePayload(payload);

      if (decoded.kind === 'invalid')
        throw invalidContractInput(entry, decoded.issues);

      const outcome = await entry.execute(decoded.value);
      return outcome.kind === 'success'
        ? { kind: 'complete' }
        : {
            kind: 'reject',
            failure: entry.presentFailure(outcome.failure),
          };
    },
  });

export const registrationsFromJobCatalog = (
  catalog: ExecutableJobCatalog,
): readonly JobHostRegistration[] =>
  Object.freeze(catalog.entries.map(registrationFrom));

const throwLifecycleFailures = (failures: readonly unknown[]): void => {
  if (failures.length === 0) return;
  if (failures.length === 1) throw failures[0];

  throw unexpectedError({
    code: 'jobs_host_lifecycle_failed',
    message: `${failures.length} jobs-host lifecycle operations failed.`,
    details: { failureCount: failures.length },
    cause: makeAggregateError({
      errors: failures,
      message: 'Jobs-host lifecycle failures.',
    }),
  });
};

export const runJobsHost = async (
  input: Readonly<{
    catalog: ExecutableJobCatalog;
    dependencies: JobHostDependencies;
  }>,
): Promise<void> => {
  const jobs = registrationsFromJobCatalog(input.catalog);
  const lifecycle = input.dependencies.startLifecycle();
  const failures: unknown[] = [];

  try {
    await input.dependencies.execution.run({
      jobs,
      signal: lifecycle.signal,
    });
  } catch (failure: unknown) {
    failures.push(failure);
  }

  try {
    await input.dependencies.execution.shutdown();
  } catch (failure: unknown) {
    failures.push(failure);
  }

  try {
    await lifecycle.dispose();
  } catch (failure: unknown) {
    failures.push(failure);
  }

  throwLifecycleFailures(failures);
};
