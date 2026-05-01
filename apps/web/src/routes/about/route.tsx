import Link from 'next/link';

import { PublicSiteShell } from '@/routes/shared/ui/public/PublicSiteShell';
import SchedulePickupButton from '@/routes/shared/ui/components/SchedulePickupButton';
import { CONTACT } from '@/routes/shared/marketing/content';

const values = [
  {
    title: 'Convenience without shortcuts',
    description:
      'Pickup, cleaning, and delivery should feel simple without making garment care feel careless.',
  },
  {
    title: 'Clear service expectations',
    description:
      'Customers should understand pricing, turnaround, and what to prepare before an order is placed.',
  },
  {
    title: 'Care close to home',
    description:
      'Pressly is focused on dependable laundry and dry cleaning service across New Jersey communities.',
  },
] as const;

export default function AboutRoute() {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            About Pressly
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Laundry and dry cleaning built around pickup and delivery.
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            Pressly helps households and local businesses handle wash and fold,
            dry cleaning, and garment care without adding another errand to the
            week. Customers schedule online, prepare their items for pickup, and
            get clean laundry or pressed garments delivered back.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <SchedulePickupButton source="about">
              Schedule a Pickup
            </SchedulePickupButton>
            <Link
              href="/services-pricing/wash-fold"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-6 text-base font-medium transition hover:bg-accent"
            >
              Services & Pricing
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {values.map((item) => (
            <article key={item.title} className="rounded-lg border p-5">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-14 rounded-lg bg-muted p-6">
          <h2 className="text-xl font-semibold">Need help?</h2>
          <p className="mt-3 text-muted-foreground">
            Customer care is available daily from 1pm to 10pm at{' '}
            <a
              href={CONTACT.phoneHref}
              className="font-medium text-primary underline underline-offset-4"
            >
              {CONTACT.phone}
            </a>{' '}
            or{' '}
            <a
              href={`mailto:${CONTACT.email}`}
              className="font-medium text-primary underline underline-offset-4"
            >
              {CONTACT.email}
            </a>
            .
          </p>
        </div>
      </section>
    </PublicSiteShell>
  );
}
