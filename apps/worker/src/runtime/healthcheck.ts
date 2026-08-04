import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { configError } from '@pressly/errors/factories';
import { systemClock, type Clock } from '@pressly/time';

export const isHeartbeatFresh = (input: {
  modifiedAt: Date;
  now: Date;
  maxAgeMs: number;
}): boolean =>
  input.maxAgeMs > 0 &&
  input.now.getTime() - input.modifiedAt.getTime() <= input.maxAgeMs &&
  input.modifiedAt.getTime() - input.now.getTime() <= 1_000;

export const checkWorkerHeartbeat = async (input: {
  path: string;
  maxAgeMs: number;
  clock?: Clock;
  getModifiedAt?: (path: string) => Promise<Date>;
}): Promise<boolean> => {
  const clock = input.clock ?? systemClock;
  const getModifiedAt =
    input.getModifiedAt ?? (async (path: string) => (await stat(path)).mtime);

  try {
    return isHeartbeatFresh({
      modifiedAt: await getModifiedAt(input.path),
      now: clock.now(),
      maxAgeMs: input.maxAgeMs,
    });
  } catch {
    return false;
  }
};

const main = async (): Promise<void> => {
  const path =
    process.env['WORKER_HEARTBEAT_FILE'] ?? '/tmp/pressly-worker-heartbeat';
  const maxAgeMs = Number(
    process.env['WORKER_HEARTBEAT_MAX_AGE_MS'] ?? '90000',
  );
  if (!Number.isInteger(maxAgeMs) || maxAgeMs <= 0)
    throw configError({
      code: 'invalid_worker_heartbeat_max_age',
      message: 'WORKER_HEARTBEAT_MAX_AGE_MS must be a positive integer.',
      safeMessage: 'Worker healthcheck configuration is invalid.',
    });

  if (!(await checkWorkerHeartbeat({ path, maxAgeMs }))) process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(() => {
    process.exitCode = 1;
  });
