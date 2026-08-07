'use client';

import { invariantViolationError } from '@pressly/errors/factories';
import { createContext, useContext, type PropsWithChildren } from 'react';
import type { TrackPublicEvent } from '@/common/core/analytics/track';

const OrderEntryTrackingContext = createContext<TrackPublicEvent | null>(null);

export function OrderEntryTrackingProvider({
  children,
  track,
}: PropsWithChildren<{ track: TrackPublicEvent }>) {
  return (
    <OrderEntryTrackingContext.Provider value={track}>
      {children}
    </OrderEntryTrackingContext.Provider>
  );
}

export function useOrderEntryTracking(): TrackPublicEvent {
  const track = useContext(OrderEntryTrackingContext);

  if (track === null) {
    throw invariantViolationError({
      code: 'web_order_entry_tracking_provider_missing',
      message:
        'useOrderEntryTracking must be used inside OrderEntryTrackingProvider.',
    });
  }

  return track;
}
