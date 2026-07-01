import type { DatabaseRuntime } from '@pressly/db';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import type { CounterSink, ErrorReporter } from '@pressly/metrics';
import type { apiEnv } from '../config/env.ts';

export type ApiEnv = typeof apiEnv;

export type ApiObservability = Readonly<{
  errors: ErrorReporter;
  counters: CounterSink;
}>;

export type ApiRuntime = Readonly<{
  env: ApiEnv;
  logger: Logger;
  securityEvents: SecurityEventSink;
  observability: ApiObservability;
  database: DatabaseRuntime;
}>;
