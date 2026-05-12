import type { DatabaseRuntime } from '@pressly/db';
import type { Logger } from '@pressly/logging';
import type { apiEnv } from '../config/env.ts';

export type ApiEnv = typeof apiEnv;

export type ApiRuntime = Readonly<{
  env: ApiEnv;
  logger: Logger;
  database: DatabaseRuntime;
}>;
