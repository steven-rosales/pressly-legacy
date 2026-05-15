'use client';

import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';

import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';
import { PublicSiteShell } from '@/app/shared/ui/public/PublicSiteShell';
import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';
import type { ContactPageModel } from '../model';

export default function ContactView({ model }: { model: ContactPageModel }) {
  const core = useWebCore();
  const track = trackPublicEvent(core);

  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {model.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {model.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          {model.description}
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {model.cards.map((card) => {
            const Icon = card.method === 'phone' ? Phone : Mail;

            return (
              <a
                key={card.method}
                href={card.href}
                className="rounded-lg border p-5 transition hover:bg-accent"
                onClick={() =>
                  track(
                    publicEvents.contactClicked({
                      source: 'contact',
                      method: card.method,
                    }),
                  )
                }
              >
                <Icon className="size-5 text-primary" />
                <h2 className="mt-4 text-lg font-semibold">{card.title}</h2>
                <p className="mt-2 text-muted-foreground">{card.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {card.note}
                </p>
              </a>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <SchedulePickupButton source={model.primaryCtaSource}>
            Schedule a Pickup
          </SchedulePickupButton>
          <Link
            href={model.secondaryHref}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-6 text-base font-medium transition hover:bg-accent"
          >
            {model.secondaryLabel}
          </Link>
        </div>
      </section>
    </PublicSiteShell>
  );
}
