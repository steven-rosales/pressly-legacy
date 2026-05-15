'use client';

import { useEffect } from 'react';

import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';

export function ScheduleViewedTracker() {
  const core = useWebCore();

  useEffect(() => {
    trackPublicEvent(core)(
      publicEvents.orderScheduleShellViewed({ vendor: 'cents' }),
    );
  }, [core]);

  return null;
}
