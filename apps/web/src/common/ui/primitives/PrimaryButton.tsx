'use client';

import Link from 'next/link';
import { Button } from '../../shadcn/button';
import type { ReactNode } from 'react';
import { CentsOrderDialog } from './CentsOrderDialog';

type PrimaryButtonProps = {
  children?: ReactNode;
  className?: string;
} & (
  | { href: string; onClick?: never; type?: never }
  | { href?: never; onClick?: () => void; type?: 'button' | 'submit' }
);

export default function PrimaryButton(props: PrimaryButtonProps) {
  const baseClasses = `bg-primary text-primary-foreground cursor-pointer text-base ${props.className || ''}`;
  const children = props.children ?? 'Schedule a Pickup';

  if (props.href === '/signup') {
    return (
      <CentsOrderDialog>
        <Button className={baseClasses} size="lg">
          {children}
        </Button>
      </CentsOrderDialog>
    );
  }

  if (props.href) {
    return (
      <Button asChild className={baseClasses} size="lg">
        <Link href={props.href}>{children}</Link>
      </Button>
    );
  }

  return (
    <Button
      type={props.type || 'button'}
      onClick={props.onClick}
      className={baseClasses}
      size="lg"
    >
      {children}
    </Button>
  );
}
