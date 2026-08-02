import type { Logger } from '@pressly/logging';
import { normalizeUnknownError } from '@pressly/errors';
import { attemptObservation } from '@pressly/metrics';

type ShutdownHandlersInput = {
  logger: Logger;
  shutdownGracePeriodMs: number;
  close: (signal: string) => Promise<void>;
  forceClose: () => void;
};

export const installShutdownHandlers = (input: ShutdownHandlersInput): void => {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;

    shuttingDown = true;

    attemptObservation(() =>
      input.logger.info('api shutdown started', { signal }),
    );

    const forceTimer = setTimeout(() => {
      attemptObservation(() =>
        input.logger.error('api shutdown grace period exceeded', { signal }),
      );
      input.forceClose();
    }, input.shutdownGracePeriodMs);

    forceTimer.unref();

    try {
      await input.close(signal);
      clearTimeout(forceTimer);

      attemptObservation(() =>
        input.logger.info('api shutdown completed', { signal }),
      );
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);

      attemptObservation(() =>
        input.logger.error('api shutdown failed', {
          signal,
          error: normalizeUnknownError(error),
        }),
      );
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    attemptObservation(() =>
      input.logger.error('api unhandled rejection', {
        reason: normalizeUnknownError(reason),
      }),
    );
    void shutdown('UNHANDLED_REJECTION');
  });

  process.on('uncaughtException', (error) => {
    attemptObservation(() =>
      input.logger.error('api uncaught exception', { error }),
    );
    void shutdown('UNCAUGHT_EXCEPTION');
  });
};
