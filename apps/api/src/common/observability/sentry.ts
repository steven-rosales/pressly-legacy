import * as Sentry from '@sentry/node';
import type express from 'express';

type SentryConfig = Readonly<{
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  traceSampleRate: number;
}>;

export const initializeSentry = (config: SentryConfig): void => {
  if (!config.enabled) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.traceSampleRate,
    sendDefaultPii: false,
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          data: false,
          headers: false,
          ip: false,
          query_string: false,
          url: true,
        },
      }),
    ],
  });
};

export const setupSentryErrorHandler = (
  app: express.Express,
  enabled: boolean,
): void => {
  if (enabled) Sentry.setupExpressErrorHandler(app);
};

export const captureSentryException = (error: unknown): string =>
  Sentry.captureException(error);

export const flushSentry = (timeoutMs = 2_000): Promise<boolean> =>
  Sentry.flush(timeoutMs);
