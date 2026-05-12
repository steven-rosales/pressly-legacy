import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/common/shadcn/button';
import { resolveCentsOrderHref } from '@/app/(marketing)/shared/marketing/content';

type SecondaryButtonProps = {
  children: ReactNode;
  className?: string;
} & (
  | { href: string; onClick?: never; type?: never }
  | { href?: never; onClick: () => void; type?: 'button' | 'submit' }
);

export default function SecondaryButton(props: SecondaryButtonProps) {
  const baseClasses = `bg-primary-foreground text-foreground cursor-pointer text-base ${props.className || ''}`;
  const href = resolveCentsOrderHref(props.href);

  if (href) {
    if (href.startsWith('http')) {
      return (
        <Button asChild variant="outline" className={baseClasses} size="lg">
          <a href={href}>{props.children}</a>
        </Button>
      );
    }

    return (
      <Button asChild variant="outline" className={baseClasses} size="lg">
        <Link href={href}>{props.children}</Link>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      type={props.type || 'button'}
      onClick={props.onClick}
      className={baseClasses}
      size="lg"
    >
      {props.children}
    </Button>
  );
}
