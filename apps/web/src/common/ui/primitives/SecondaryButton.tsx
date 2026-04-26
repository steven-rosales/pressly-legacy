import { Button } from '../../shadcn/button';
import Link from 'next/link';
import type { ReactNode } from 'react';

type SecondaryButtonProps = {
  children: ReactNode;
  className?: string;
} & (
  | { href: string; onClick?: never; type?: never }
  | { href?: never; onClick: () => void; type?: 'button' | 'submit' }
);

export default function SecondaryButton(props: SecondaryButtonProps) {
  const baseClasses = `bg-primary-foreground text-foreground cursor-pointer text-base ${props.className || ''}`;

  if (props.href) {
    return (
      <Button asChild variant="outline" className={baseClasses} size="lg">
        <Link href={props.href}>{props.children}</Link>
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
