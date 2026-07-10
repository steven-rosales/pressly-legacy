'use client';

import { useMemo } from 'react';

import { trackPublicEvent } from '@/common/core/analytics/track';
import { useWebCore } from '../runtime/web-core-context';

export const usePublicEventTracker = () => {
  const core = useWebCore();
  return useMemo(() => trackPublicEvent(core), [core]);
};
