'use client';

import type { PropsWithChildren } from 'react';
import { usePublicEventTracker } from '#customer/telemetry/use-public-event-tracker';
import { OrderEntryTrackingProvider as FeatureOrderEntryTrackingProvider } from '#customer/features/order-entry/ui/tracking';

export function OrderEntryTrackingProvider({ children }: PropsWithChildren) {
  const track = usePublicEventTracker();

  return (
    <FeatureOrderEntryTrackingProvider track={track}>
      {children}
    </FeatureOrderEntryTrackingProvider>
  );
}
