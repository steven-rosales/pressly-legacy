import type { HttpProcessRuntime } from './process.ts';
import type { HttpRuntimeApplicationAssembly } from './application.ts';
import {
  cleanupApiAfterFailure,
  cleanupApiOrThrow,
  type ApiCleanupEffect,
  type ApiCleanupPlan,
} from './cleanup.ts';
import { installShutdownHandlers } from './lifecycle.ts';
import { makeHttpRuntimeApplication } from './application.ts';
import { observeApiRuntimeFailure } from './observability/runtime-failure.ts';
import { startServer } from './server.ts';

export type HttpProcessAssembly = Readonly<{
  application: HttpRuntimeApplicationAssembly;
  listen: Readonly<{
    host: string;
    port: number;
    shutdownGracePeriodMs: number;
  }>;
  start: () => Promise<void>;
  close: () => Promise<void>;
}>;

const cleanupPlan = (input: {
  server?: Readonly<{ close: () => Promise<void> }>;
  assembly: HttpProcessAssembly;
  closeDatabase: () => Promise<void>;
}): ApiCleanupPlan => {
  const serverEffects: readonly ApiCleanupEffect[] =
    input.server === undefined
      ? []
      : [{ resource: 'http_server', run: input.server.close }];
  return [
    [...serverEffects, { resource: 'http_runtime', run: input.assembly.close }],
    [{ resource: 'database', run: input.closeDatabase }],
  ];
};

const observeStartupFailure = async (
  processRuntime: HttpProcessRuntime,
  error: unknown,
): Promise<void> => {
  processRuntime.setExitCode(1);
  observeApiRuntimeFailure(
    {
      logger: processRuntime.logger,
      observability: {
        errors: processRuntime.errors,
        counters: processRuntime.signals.counters,
      },
    },
    { error, phase: 'startup', operation: 'api_startup' },
  );
  try {
    await processRuntime.errors.shutdown();
  } catch {
    processRuntime.reportTelemetryFlushFailure();
  }
};

export const runHttpProcess = async (input: {
  assembly: HttpProcessAssembly;
  process: HttpProcessRuntime;
  closeDatabase: () => Promise<void>;
}): Promise<void> => {
  try {
    await input.assembly.start();
  } catch (error) {
    try {
      await cleanupApiAfterFailure({
        primaryError: error,
        plan: cleanupPlan({
          assembly: input.assembly,
          closeDatabase: input.closeDatabase,
        }),
        logger: input.process.logger,
      });
    } catch (failure) {
      await observeStartupFailure(input.process, failure);
      return;
    }
  }

  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  try {
    server = await startServer({
      app: makeHttpRuntimeApplication(input.assembly.application),
      host: input.assembly.listen.host,
      port: input.assembly.listen.port,
      logger: input.process.logger,
      onServerError: (error) =>
        observeApiRuntimeFailure(input.assembly.application.runtime, {
          error,
          phase: 'server',
          operation: 'http_server',
        }),
    });
  } catch (error) {
    try {
      await cleanupApiAfterFailure({
        primaryError: error,
        plan: cleanupPlan({
          assembly: input.assembly,
          closeDatabase: input.closeDatabase,
        }),
        logger: input.process.logger,
      });
    } catch (failure) {
      await observeStartupFailure(input.process, failure);
      return;
    }
  }

  if (server === null) return;

  installShutdownHandlers({
    logger: input.process.logger,
    shutdownGracePeriodMs: input.assembly.listen.shutdownGracePeriodMs,
    flush: () => input.process.errors.shutdown(),
    reportFlushFailure: input.process.reportTelemetryFlushFailure,
    forceClose: server.forceClose,
    close: async () =>
      cleanupApiOrThrow(
        cleanupPlan({
          server,
          assembly: input.assembly,
          closeDatabase: input.closeDatabase,
        }),
      ),
  });
};
