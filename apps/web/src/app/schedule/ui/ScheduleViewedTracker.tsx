'use client';

import { useEffect } from 'react';

import { usePublicEventTracker } from '@/common/adapters/analytics/use-public-event-tracker';
import { orderEntryEvents } from '@/features/order-entry/events';

export function ScheduleViewedTracker() {
  const track = usePublicEventTracker();

  useEffect(() => {
    track(orderEntryEvents.scheduleShellViewed({ vendor: 'cents' }));
  }, [track]);

  return null;
}
