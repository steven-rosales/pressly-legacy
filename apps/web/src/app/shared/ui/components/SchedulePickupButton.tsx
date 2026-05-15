'use client';

import type { ReactNode } from 'react';
import type { PublicEventSource } from '@/common/core/analytics/events';
import { publicEvents } from '@/common/core/analytics/events';
import { TrackedAnchor } from '@/common/adapters/analytics/tracked-anchor';
import { Button } from '@/app/shared/ui/shadcn/button';
import { CENTS_ORDER_URL } from '@/app/shared/marketing/content';

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
    <Button
      asChild
      className={`bg-primary text-primary-foreground cursor-pointer text-base ${className ?? ''}`}
      size="lg"
    >
      <TrackedAnchor
        href={CENTS_ORDER_URL}
        event={publicEvents.orderIntentStarted({
          source,
          vendor: 'cents',
        })}
      >
        {children ?? 'Schedule a Pickup'}
      </TrackedAnchor>
    </Button>
  );
}
