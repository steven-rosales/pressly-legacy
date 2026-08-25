import type {
  ExecutableJobCatalog,
  JobTrigger,
  RetryManifest,
} from '@pressly/cells';
import type { AppError } from '@pressly/errors/app-error';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  DurableJobLoopSleep,
  DurableJobObserver,
  DurableJobQueue,
  DurableJobShutdown,
  JobInvocationOutcome,
  ProcessProgressHeartbeat,
  UnexpectedJobFailureDisposition,
} from '@pressly/jobs';
import type { Logger } from '@pressly/logging';
import type { Clock } from '@pressly/time';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
  TraceSink,
} from '@pressly/observability';

export type PresslyJobRegistration = Readonly<{
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

export type PresslyJobExecutionPlatform = Readonly<{
  run: (
    input: Readonly<{
      jobs: readonly PresslyJobRegistration[];
      signal: AbortSignal;
    }>,
  ) => Promise<void>;
  shutdown: () => Promise<void>;
}>;

export type PresslyDurableJobBinding = Readonly<{
  expected: Readonly<{
    jobId: string;
    queue: string;
    maxAttempts: number;
  }>;
  queue: DurableJobQueue;
  observeRegistration?: (
    registration: PresslyJobRegistration,
  ) => PresslyJobRegistration;
}>;

export type PresslyDurableExecutionInput = Readonly<{
  bindings: readonly PresslyDurableJobBinding[];
  runtimeMaxAttempts: number;
  pollIntervalMs: number;
  loopRetryBaseMs: number;
  loopRetryMaxMs: number;
  deliveryRetryBaseMs: number;
  deliveryRetryMaxMs: number;
  heartbeat: ProcessProgressHeartbeat;
  now: () => Date;
  nowNanoseconds?: () => bigint;
  random: () => number;
  observer: DurableJobObserver;
  classifyUnexpected: UnexpectedJobFailureDisposition;
  sleep?: DurableJobLoopSleep;
  shutdowns: readonly DurableJobShutdown[];
}>;

export type PresslyJobsHostMechanisms = Readonly<{
  makeDurableJobExecution: (
    input: PresslyDurableExecutionInput,
  ) => PresslyJobExecutionPlatform;
  isRetryableAppError: (error: AppError) => boolean;
  makeFileHeartbeat: (
    input: Readonly<{
      path: string;
    }>,
  ) => ProcessProgressHeartbeat;
  makeWorkerDurableJobObserver: (
    input: Readonly<{
      logger: Logger;
      counters: CounterSink;
      measurements: MeasurementSink;
      errors: ErrorReporter;
    }>,
  ) => DurableJobObserver;
  makeWorkerSentryHeartbeat: (
    input: Readonly<{
      heartbeat: ProcessProgressHeartbeat;
      logger: Logger;
      sentryEnabled: boolean;
    }>,
  ) => ProcessProgressHeartbeat;
}>;

export type PresslyJobsCompositionInput = Readonly<{
  databaseUrl: string;
  workerId: string;
  sentryEnabled: boolean;
  config: Readonly<{
    pollIntervalMs: number;
    leaseMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBaseMs: number;
    retryMaxMs: number;
    loopRetryBaseMs: number;
    loopRetryMaxMs: number;
    heartbeatFile: string;
  }>;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  trace: TraceSink;
  nowNanoseconds: () => bigint;
  random: () => number;
  clock: Clock;
  ids: IdSource;
  mechanisms: PresslyJobsHostMechanisms;
}>;

export type PresslyJobsProcessAssembly = Readonly<{
  catalog: ExecutableJobCatalog;
  execution: PresslyJobExecutionPlatform;
}>;
