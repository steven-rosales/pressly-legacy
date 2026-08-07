import type { Logger } from '@pressly/logging';
import { attemptObservation } from '@pressly/observability';

export type WorkerLifecycle = Readonly<{
  signal: AbortSignal;
  dispose: () => void;
}>;

export const startWorkerLifecycle = (logger: Logger): WorkerLifecycle => {
  const controller = new AbortController();
  const stop = (signal: 'SIGINT' | 'SIGTERM'): void => {
    attemptObservation(() =>
      logger.info('worker shutdown requested', { signal }),
    );
    controller.abort();
  };
  const stopOnSigint = (): void => stop('SIGINT');
  const stopOnSigterm = (): void => stop('SIGTERM');

  process.once('SIGINT', stopOnSigint);
  process.once('SIGTERM', stopOnSigterm);

  return {
    signal: controller.signal,
    dispose: () => {
      process.off('SIGINT', stopOnSigint);
      process.off('SIGTERM', stopOnSigterm);
    },
  };
};
