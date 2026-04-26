'use client';

import type { ReactNode } from 'react';
import { CENTS_ORDER_URL } from '@/lib/content';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/common/shadcn/dialog';

export function CentsOrderDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex h-[min(860px,calc(100vh-2rem))] max-w-[min(1120px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Powered by Cents
          </p>
          <DialogTitle>Schedule your Pressly pickup</DialogTitle>
        </DialogHeader>
        <iframe
          title="Pressly order scheduling"
          src={CENTS_ORDER_URL}
          className="min-h-0 flex-1 border-0 bg-background"
          loading="lazy"
          allow="payment *; clipboard-write"
        />
        <div className="border-t border-border px-4 py-3 text-right text-sm font-medium sm:px-5">
          <a
            href={CENTS_ORDER_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            Open scheduling in a new tab
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
