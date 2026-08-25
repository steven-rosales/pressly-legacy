'use client';

import { customerWebClient } from '@pressly/generated-runtime/browser/customer-client';

import { normalizeUnknownError } from '@pressly/errors/app-error';
import { attemptObservation, decideObservation } from '@pressly/observability';
import { useEffect } from 'react';
import { makeSentryErrorReporter } from '@/telemetry/sentry-reporter';

const reporter = makeSentryErrorReporter();

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const appError = normalizeUnknownError(error);
    const decision = decideObservation({
      kind: 'error',
      source: 'web',
      rail: 'global',
      operation: 'global_error',
      criticality: 'high',
      error: {
        kind: appError.kind,
        code: appError.code,
        status: appError.status,
        traceId: appError.traceId,
      },
    });

    if (decision.report)
      attemptObservation(() =>
        reporter.capture(appError, {
          source: 'web',
          operation: 'global_error',
          traceId: appError.traceId,
          tags: {
            reason: decision.reason,
            ...(error.digest === undefined ? {} : { digest: error.digest }),
          },
        }),
      );
  }, [error]);

  return (
    <customerWebClient.GlobalErrorView
      retry={reset}
      reload={() => window.location.reload()}
    />
  );
}
