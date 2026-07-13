'use client';

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
    throw new Error(
      'useOrderEntryTracking must be used inside OrderEntryTrackingProvider.',
    );
  }

  return track;
}
