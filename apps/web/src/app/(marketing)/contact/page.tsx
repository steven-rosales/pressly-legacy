import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';

import { buildPageMetadata } from '@/app/_lib/seo';
import { SchedulePickupButton } from '@/features/order-entry/ui/SchedulePickupButton';
import { TrackedAnchor } from '@/common/adapters/analytics/tracked-anchor';
import { contactEvents } from './events';
import { getContactPageModel } from './model';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contact Pressly customer care.',
  path: '/contact',
});

export default function ContactPage() {
  const model = getContactPageModel();

  return (
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
            <TrackedAnchor
              key={card.method}
              href={card.href}
              event={contactEvents.clicked({
                method: card.method,
              })}
              className="rounded-lg border p-5 transition hover:bg-accent"
            >
              <Icon className="size-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{card.title}</h2>
              <p className="mt-2 text-muted-foreground">{card.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{card.note}</p>
            </TrackedAnchor>
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
  );
}
