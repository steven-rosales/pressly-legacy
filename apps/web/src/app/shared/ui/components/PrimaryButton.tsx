import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/common/shadcn/button';

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
  const href = props.href;

  if (href) {
    if (href.startsWith('http')) {
      return (
        <Button asChild className={baseClasses} size="lg">
          <a href={href}>{children}</a>
        </Button>
      );
    }

    return (
      <Button asChild className={baseClasses} size="lg">
        <Link href={href}>{children}</Link>
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
