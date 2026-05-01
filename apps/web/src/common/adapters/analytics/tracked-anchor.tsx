'use client';

import type {
  AnchorHTMLAttributes,
  MouseEvent,
  PropsWithChildren,
} from 'react';
import type { ProductEvent } from '@pressly/metrics';
import { trackPublicEvent } from '@/common/core/analytics/track';
import { useWebCore } from '../runtime/web-core-context';

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
  const core = useWebCore();

  return (
    <a
      {...props}
      onClick={(clickEvent) => {
        trackPublicEvent(core)(event);
        onClick?.(clickEvent);
      }}
    >
      {children}
    </a>
  );
};
