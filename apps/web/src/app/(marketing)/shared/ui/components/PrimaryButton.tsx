'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ProductEvent } from '@pressly/metrics';
import { Button } from '@/common/shadcn/button';
import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { trackPublicEvent } from '@/common/core/analytics/track';
import { resolveCentsOrderHref } from '@/app/(marketing)/shared/marketing/content';

type PrimaryButtonProps = {
  children?: ReactNode;
  className?: string;
  event?: ProductEvent;
} & (
  | { href: string; onClick?: never; type?: never }
  | { href?: never; onClick?: () => void; type?: 'button' | 'submit' }
);

export default function PrimaryButton(props: PrimaryButtonProps) {
  const core = useWebCore();

  const baseClasses = `bg-primary text-primary-foreground cursor-pointer text-base ${props.className || ''}`;
  const children = props.children ?? 'Schedule a Pickup';
  const href = resolveCentsOrderHref(props.href);

  const track = () => {
    if (props.event) trackPublicEvent(core)(props.event);
  };

  if (href) {
    if (href.startsWith('http')) {
      return (
        <Button asChild className={baseClasses} size="lg">
          <a href={href} onClick={track}>
            {children}
          </a>
        </Button>
      );
    }

    return (
      <Button asChild className={baseClasses} size="lg">
        <Link href={href} onClick={track}>
          {children}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type={props.type || 'button'}
      onClick={() => {
        track();
        props.onClick?.();
      }}
      className={baseClasses}
      size="lg"
    >
      {children}
    </Button>
  );
}
