import type { PostgresRuntime } from '@pressly/postgres/client';
import type { PresslyPostgresSchema } from '@pressly/topology/postgres-schema';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
  TraceSink,
} from '@pressly/observability';
import type { ApiEnv } from './env.ts';

export type ApiObservability = Readonly<{
  errors: ErrorReporter;
  counters: CounterSink;
  measurements?: MeasurementSink;
  trace?: TraceSink;
}>;

export type ApiRuntime = Readonly<{
  env: ApiEnv;
  logger: Logger;
  securityEvents: SecurityEventSink;
  observability: ApiObservability;
  database: PostgresRuntime<PresslyPostgresSchema>;
  nowNanoseconds: () => bigint;
}>;
