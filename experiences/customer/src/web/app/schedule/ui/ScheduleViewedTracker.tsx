'use client';

import { useEffect } from 'react';

import { usePublicEventTracker } from '#customer/telemetry/use-public-event-tracker';
import { orderEntryEvents } from '#customer/features/order-entry/events';

export function ScheduleViewedTracker() {
  const track = usePublicEventTracker();

  useEffect(() => {
    track(orderEntryEvents.scheduleShellViewed({ vendor: 'cents' }));
  }, [track]);

  return null;
}
