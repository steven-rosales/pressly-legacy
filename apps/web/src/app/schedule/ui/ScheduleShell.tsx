'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CircleDollarSign, ExternalLink, HelpCircle } from 'lucide-react';
import { useEffect } from 'react';

import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { TrackedAnchor } from '@/common/adapters/analytics/tracked-anchor';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';
import {
  CENTS_ORDER_URL,
  DRY_CLEANING_PRICING,
  PRICING,
  formatUsd,
} from '@/app/(marketing)/shared/marketing/content';
import { Button } from '@/common/shadcn/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/common/shadcn/dialog';
import { cn } from '@/styles/utils';

const helperButtonClass =
  'h-11 rounded-full border-border bg-background/95 px-4 text-sm font-semibold text-foreground shadow-lg backdrop-blur transition hover:bg-background';

const dryCleaningPreview = DRY_CLEANING_PRICING.flatMap((group) =>
  group.items.map((item) => item),
).slice(0, 4);

const faqItems = [
  {
    question: 'What should I have ready?',
    answer:
      'Place laundry or garments in any bag you have available. You can separate wash and fold from dry cleaning if you are ordering both.',
  },
  {
    question: 'Can I schedule laundry and dry cleaning together?',
    answer:
      'Yes. Add both services inside the ordering flow and choose the pickup window that works for you.',
  },
  {
    question: 'When do orders come back?',
    answer:
      'Most wash and fold orders return next day when available. Dry cleaning timing depends on the garments and selected service.',
  },
  {
    question: 'How do I get help with an order?',
    answer:
      'Use the order flow for order details, or contact Pressly customer care at care@trypressly.com.',
  },
] as const;

function PricingDialog({ className }: { className?: string }) {
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
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Per pound</dt>
                <dd className="font-semibold">
                  {formatUsd(PRICING.washFoldPerLbCents)} / lb
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Minimum</dt>
                <dd className="font-semibold">
                  {formatUsd(PRICING.washFoldMinimumCents)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Hang dry</dt>
                <dd className="font-semibold">
                  {formatUsd(PRICING.hangDryCents)} / item
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-base font-semibold">Dry Cleaning</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Prices vary by garment. The dry cleaning minimum is{' '}
              {formatUsd(PRICING.dryCleaningMinimumCents)}.
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              {dryCleaningPreview.map((item) => (
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

function FaqDialog({ className }: { className?: string }) {
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
          {faqItems.map((item) => (
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

function HomeLogo({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Go to Pressly home"
      className={cn(
        'flex items-center justify-center rounded-full border border-border bg-background/95 shadow-lg backdrop-blur transition hover:bg-background',
        mobile ? 'size-10 shrink-0' : 'fixed top-6 left-6 z-20 size-12',
      )}
    >
      <Image
        src="/logo/emblem.png"
        alt=""
        width={28}
        height={28}
        className={mobile ? 'size-6 object-contain' : 'size-7 object-contain'}
        priority
      />
    </Link>
  );
}

function CentsFrame({ className }: { className?: string }) {
  return (
    <iframe
      title="Pressly order scheduling"
      src={CENTS_ORDER_URL}
      className={cn(
        'border-0 bg-background [touch-action:manipulation]',
        className,
      )}
      allow="payment *; clipboard-write"
    />
  );
}

export default function ScheduleShell() {
  const core = useWebCore();

  useEffect(() => {
    trackPublicEvent(core)(
      publicEvents.orderScheduleShellViewed({ vendor: 'cents' }),
    );
  }, [core]);

  return (
    <main className="h-[100svh] overflow-hidden bg-background text-foreground sm:bg-muted/60">
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:hidden">
          <HomeLogo mobile />
          <div className="flex min-w-0 items-center gap-2">
            <PricingDialog className="h-9 px-3 shadow-none" />
            <FaqDialog className="h-9 px-3 shadow-none" />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-stretch justify-center sm:items-center sm:px-6 sm:py-10">
          <div className="flex min-h-0 w-full flex-1 flex-col items-stretch sm:w-auto sm:flex-none sm:items-center sm:gap-3">
            <CentsFrame className="min-h-0 w-full flex-1 sm:h-[min(860px,calc(100svh-5.5rem))] sm:w-[min(640px,calc(100vw-2rem))] sm:flex-none sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:shadow-2xl" />
            <TrackedAnchor
              href={CENTS_ORDER_URL}
              target="_blank"
              rel="noreferrer"
              event={publicEvents.orderIntentStarted({
                source: 'schedule_open_new_tab',
                vendor: 'cents',
              })}
              className="hidden items-center gap-1 text-sm font-semibold text-foreground/70 transition hover:text-foreground sm:inline-flex"
            >
              Open in a new tab
              <ExternalLink className="size-4" />
            </TrackedAnchor>
          </div>
        </div>

        <div className="hidden sm:block">
          <HomeLogo />
          <div className="fixed bottom-6 left-6 z-20">
            <PricingDialog />
          </div>
          <div className="fixed right-6 bottom-6 z-20">
            <FaqDialog />
          </div>
        </div>
      </div>
    </main>
  );
}
