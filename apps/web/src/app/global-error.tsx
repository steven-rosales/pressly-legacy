'use client';

import { normalizeUnknownError } from '@pressly/errors';
import { decideObservation } from '@pressly/metrics';
import { useEffect } from 'react';
import { makeSentryErrorReporter } from '@/common/adapters/observability/sentry-reporter';

const reporter = makeSentryErrorReporter();

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
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
      reporter.capture(appError, {
        source: 'web',
        operation: 'global_error',
        traceId: appError.traceId,
        tags: {
          reason: decision.reason,
          ...(error.digest === undefined ? {} : { digest: error.digest }),
        },
      });
  }, [error]);

  return (
    <html>
      <body>{/* Your Error component here... */}</body>
    </html>
  );
}
