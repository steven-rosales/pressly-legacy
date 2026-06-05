import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import type { SchedulePageModel } from '../model';
import { TrackedAnchor } from '@/common/adapters/analytics/tracked-anchor';
import { publicEvents } from '@/common/core/analytics/events';
import { cn } from '@/styles/utils';
import { CentsFrame } from './ScheduleFrame';
import { ScheduleFaqDialog, SchedulePricingDialog } from './ScheduleDialogs';
import { ScheduleViewedTracker } from './ScheduleViewedTracker';

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

export default function ScheduleShell({ model }: { model: SchedulePageModel }) {
  return (
    <main className="h-[100svh] overflow-hidden bg-background text-foreground sm:bg-muted/60">
      <ScheduleViewedTracker />
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:hidden">
          <HomeLogo mobile />
          <div className="flex min-w-0 items-center gap-2">
            <SchedulePricingDialog
              pricing={model.pricing}
              className="h-9 px-3 shadow-none"
            />
            <ScheduleFaqDialog
              faqs={model.faqs}
              className="h-9 px-3 shadow-none"
            />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 items-stretch justify-center sm:items-center sm:px-6 sm:py-10">
          <div className="flex min-h-0 w-full flex-1 flex-col items-stretch sm:w-auto sm:flex-none sm:items-center sm:gap-3">
            <CentsFrame
              orderUrl={model.orderUrl}
              className="min-h-0 w-full flex-1 sm:h-[min(860px,calc(100svh-5.5rem))] sm:w-[min(640px,calc(100vw-2rem))] sm:flex-none sm:overflow-hidden sm:rounded-xl sm:border sm:border-border sm:shadow-2xl"
            />
            <TrackedAnchor
              href={model.orderUrl}
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
            <SchedulePricingDialog pricing={model.pricing} />
          </div>
          <div className="fixed right-6 bottom-6 z-20">
            <ScheduleFaqDialog faqs={model.faqs} />
          </div>
        </div>
      </div>
    </main>
  );
}
