'use client';

import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';

import { useWebCore } from '@/common/adapters/runtime/web-core-context';
import { publicEvents } from '@/common/core/analytics/events';
import { trackPublicEvent } from '@/common/core/analytics/track';
import { PublicSiteShell } from '@/app/(marketing)/shared/ui/public/PublicSiteShell';
import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import { CONTACT } from '@/app/(marketing)/shared/marketing/content';

export default function ContactView() {
  const core = useWebCore();
  const track = trackPublicEvent(core);

  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Contact
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Pressly customer care.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          For order questions, pickup details, commercial service, or general
          support, reach out directly.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href={CONTACT.phoneHref}
            className="rounded-lg border p-5 transition hover:bg-accent"
            onClick={() =>
              track(
                publicEvents.contactClicked({
                  source: 'contact',
                  method: 'phone',
                }),
              )
            }
          >
            <Phone className="size-5 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">Phone</h2>
            <p className="mt-2 text-muted-foreground">{CONTACT.phone}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mon-Sun | 1pm - 10pm
            </p>
          </a>

          <a
            href={`mailto:${CONTACT.email}`}
            className="rounded-lg border p-5 transition hover:bg-accent"
            onClick={() =>
              track(
                publicEvents.contactClicked({
                  source: 'contact',
                  method: 'email',
                }),
              )
            }
          >
            <Mail className="size-5 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">Email</h2>
            <p className="mt-2 text-muted-foreground">{CONTACT.email}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Best for order changes and service questions.
            </p>
          </a>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <SchedulePickupButton source="contact">
            Schedule a Pickup
          </SchedulePickupButton>
          <Link
            href="/commercial"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-6 text-base font-medium transition hover:bg-accent"
          >
            Commercial Service
          </Link>
        </div>
      </section>
    </PublicSiteShell>
  );
}
