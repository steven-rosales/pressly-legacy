'use client';

import type { ReactNode } from 'react';
import type { PublicEventSource } from '@/common/core/analytics/events';
import { publicEvents } from '@/common/core/analytics/events';
import PrimaryButton from './PrimaryButton';

type SchedulePickupButtonProps = {
  children?: ReactNode;
  className?: string;
  source: PublicEventSource;
};

export default function SchedulePickupButton({
  children,
  className,
  source,
}: SchedulePickupButtonProps) {
  return (
    <PrimaryButton
      href="/schedule"
      className={className ?? ''}
      event={publicEvents.orderIntentStarted({
        source,
        vendor: 'cents',
      })}
    >
      {children ?? 'Schedule a Pickup'}
    </PrimaryButton>
  );
}
