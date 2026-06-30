import type { DatabaseRuntime } from '@pressly/db';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import type { apiEnv } from '../config/env.ts';

export type ApiEnv = typeof apiEnv;

export type ApiRuntime = Readonly<{
  env: ApiEnv;
  logger: Logger;
  securityEvents: SecurityEventSink;
  database: DatabaseRuntime;
}>;
