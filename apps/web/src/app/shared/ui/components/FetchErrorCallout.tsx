'use server';

import { revalidateTag, refresh } from 'next/cache';

import { Alert, AlertDescription, AlertTitle } from '@/common/shadcn/alert';
import RefreshButton from './RefreshButton';

export async function refreshPricing() {
  revalidateTag('pricing', 'max');
  refresh();
}

export type FetchErrorCallout = {
  title?: string;
  message: string;
  retryLabel?: string;
  canRetry: boolean;
};

export default async function FetchErrorCallout({
  title = 'Unable to load',
  message,
  retryLabel = 'Retry',
  canRetry,
}: FetchErrorCallout) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>

      {canRetry ? (
        <div className="mt-3">
          <RefreshButton label={retryLabel} action={refreshPricing} />
        </div>
      ) : null}
    </Alert>
  );
}
