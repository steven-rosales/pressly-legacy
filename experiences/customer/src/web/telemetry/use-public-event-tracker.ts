'use client';

import { useMemo } from 'react';

import { trackPublicEvent } from '#customer/telemetry/model/track';
import { useWebCore } from '../composition/web-core-context';

export const usePublicEventTracker = () => {
  const core = useWebCore();
  return useMemo(() => trackPublicEvent(core), [core]);
};
