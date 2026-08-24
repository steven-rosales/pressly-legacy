'use client';

import type { ReactNode } from 'react';
import { Button } from '#customer/components/ui/button';
import { CENTS_ORDER_URL } from '#customer/features/order-entry/config';
import {
  orderEntryEvents,
  type OrderEntrySource,
} from '#customer/features/order-entry/events';
import { useOrderEntryTracking } from './tracking';

type SchedulePickupButtonProps = {
  children?: ReactNode;
  className?: string;
  source: OrderEntrySource;
};

export function SchedulePickupButton({
  children,
  className,
  source,
}: SchedulePickupButtonProps) {
  const track = useOrderEntryTracking();

  return (
    <Button
      asChild
      className={`bg-primary text-primary-foreground cursor-pointer text-base ${className ?? ''}`}
      size="lg"
    >
      <a
        href={CENTS_ORDER_URL}
        onClick={() =>
          track(
            orderEntryEvents.intentStarted({
              source,
              vendor: 'cents',
            }),
          )
        }
      >
        {children ?? 'Schedule a Pickup'}
      </a>
    </Button>
  );
}
