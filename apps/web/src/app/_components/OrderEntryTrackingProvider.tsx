'use client';

import type { PropsWithChildren } from 'react';
import { usePublicEventTracker } from '@/common/adapters/analytics/use-public-event-tracker';
import { OrderEntryTrackingProvider as FeatureOrderEntryTrackingProvider } from '@/features/order-entry/ui/tracking';

export function OrderEntryTrackingProvider({ children }: PropsWithChildren) {
  const track = usePublicEventTracker();

  return (
    <FeatureOrderEntryTrackingProvider track={track}>
      {children}
    </FeatureOrderEntryTrackingProvider>
  );
}
