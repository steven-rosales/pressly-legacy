'use client';

import { useTransition } from 'react';
import { Button } from '@/common/shadcn/button';

type RefreshButtonProps = { label: string; action: () => Promise<void> };

export default function RefreshButton({ label, action }: RefreshButtonProps) {
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
