import type { DatabaseRuntime } from '@pressly/db/client';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
} from '@pressly/observability';
import type { apiEnv } from './env.ts';

export type ApiEnv = typeof apiEnv;

export type ApiObservability = Readonly<{
  errors: ErrorReporter;
  counters: CounterSink;
  measurements?: MeasurementSink;
}>;

export type ApiRuntime = Readonly<{
  env: ApiEnv;
  logger: Logger;
  securityEvents: SecurityEventSink;
  observability: ApiObservability;
  database: DatabaseRuntime;
}>;
