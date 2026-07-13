'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';

type PricingRetryButtonProps = {
  label: string;
  action: () => Promise<void>;
};

export function PricingRetryButton({ label, action }: PricingRetryButtonProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          void action();
        });
      }}
    >
      {isPending ? 'Retrying...' : label}
    </Button>
  );
}
