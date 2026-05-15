import Link from 'next/link';

import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';
import type { AboutPageModel } from '../model';

export function AboutPageView({ model }: { model: AboutPageModel }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {model.eyebrow}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {model.title}
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          {model.description}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {model.values.map((item) => (
          <article key={item.title} className="rounded-lg border p-5">
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {item.description}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-14 rounded-lg bg-muted p-6">
        <h2 className="text-xl font-semibold">{model.help.title}</h2>
        <p className="mt-3 text-muted-foreground">
          {model.help.descriptionPrefix}{' '}
          <a
            href={model.help.phoneHref}
            className="font-medium text-primary underline underline-offset-4"
          >
            {model.help.phone}
          </a>{' '}
          or{' '}
          <a
            href={`mailto:${model.help.email}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {model.help.email}
          </a>
          .
        </p>
      </div>
    </section>
  );
}
