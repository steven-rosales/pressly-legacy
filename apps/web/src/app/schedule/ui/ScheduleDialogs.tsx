'use client';

import Link from 'next/link';
import { CircleDollarSign, HelpCircle } from 'lucide-react';

import type { SchedulePageModel } from '../model';
import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';
import { Button } from '@/app/shared/ui/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/shared/ui/shadcn/dialog';
import { cn } from '@/styles/utils';

const helperButtonClass =
  'h-11 rounded-full border-border bg-background/95 px-4 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition hover:bg-background';

export function SchedulePricingDialog({
  className,
  pricing,
}: {
  className?: string;
  pricing: SchedulePageModel['pricing'];
}) {
  const core = useWebCore();
  const track = trackPublicEvent(core);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) track(publicEvents.pricingViewed({ source: 'schedule' }));
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(helperButtonClass, className)}
          aria-label="Open pricing overview"
        >
          <CircleDollarSign className="size-5 text-primary" />
          Pricing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(680px,calc(100svh-2rem))] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pricing Overview</DialogTitle>
          <DialogDescription>
            A quick reference before you place your order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-base font-semibold">Wash & Fold</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {pricing.washFold.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-4"
                >
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-semibold">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-base font-semibold">Dry Cleaning</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {pricing.dryCleaning.description}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              {pricing.dryCleaning.previewItems.map((item) => (
                <div
                  key={`${item.name}-${item.price}`}
                  className="flex items-center justify-between gap-4"
                >
                  <dt className="text-muted-foreground">{item.name}</dt>
                  <dd className="font-semibold">{item.price}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Button asChild className="w-full">
            <Link
              href="/services-pricing/wash-fold"
              target="_blank"
              rel="noreferrer"
            >
              View Full Services & Pricing
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleFaqDialog({
  className,
  faqs,
}: {
  className?: string;
  faqs: SchedulePageModel['faqs'];
}) {
  const core = useWebCore();
  const track = trackPublicEvent(core);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open)
          track(
            publicEvents.faqOpened({
              questionId: 'schedule_pickup_dialog',
            }),
          );
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(helperButtonClass, className)}
          aria-label="Open pickup FAQ"
        >
          <HelpCircle className="size-5 text-primary" />
          FAQ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(680px,calc(100svh-2rem))] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pickup FAQ</DialogTitle>
          <DialogDescription>
            Quick answers while you schedule your order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {faqs.map((item) => (
            <div key={item.question} className="rounded-lg border p-4">
              <h3 className="text-sm font-semibold">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
