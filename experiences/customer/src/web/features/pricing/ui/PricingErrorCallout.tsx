'use client';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '#customer/components/ui/alert';
import { useWebCore } from '#customer/composition/web-core-context';
import { PricingRetryButton } from './PricingRetryButton';

export type PricingErrorCalloutProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  canRetry: boolean;
};

export function PricingErrorCallout({
  title = 'Unable to load',
  message,
  retryLabel = 'Retry',
  canRetry,
}: PricingErrorCalloutProps) {
  const { refreshPricing } = useWebCore();
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>

      {canRetry ? (
        <div className="mt-3">
          <PricingRetryButton label={retryLabel} action={refreshPricing} />
        </div>
      ) : null}
    </Alert>
  );
}
