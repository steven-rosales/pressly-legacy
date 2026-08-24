import * as Sentry from '@sentry/react';
import type { ReactElement, ReactNode } from 'react';

export const wrapProcessorBrowserRoot = ({
  node,
  fallback,
}: Readonly<{ node: ReactNode; fallback: ReactElement }>): ReactNode => (
  <Sentry.ErrorBoundary
    showDialog={false}
    beforeCapture={(scope) => scope.setTag('error.boundary', 'processor-root')}
    fallback={() => fallback}
  >
    {node}
  </Sentry.ErrorBoundary>
);
