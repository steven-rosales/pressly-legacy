'use client';

import type {
  AnchorHTMLAttributes,
  MouseEvent,
  PropsWithChildren,
} from 'react';
import type { ProductEvent } from '@pressly/observability';
import { usePublicEventTracker } from './use-public-event-tracker';

type TrackedAnchorProps = PropsWithChildren<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    event: ProductEvent;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }
>;

export const TrackedAnchor = ({
  event,
  onClick,
  children,
  ...props
}: TrackedAnchorProps) => {
  const track = usePublicEventTracker();

  return (
    <a
      {...props}
      onClick={(clickEvent) => {
        track(event);
        onClick?.(clickEvent);
      }}
    >
      {children}
    </a>
  );
};
