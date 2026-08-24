import type { Metadata } from 'next';
import Link from 'next/link';

import { buildPageMetadata } from '#customer/app/_lib/seo/metadata';
import { getCareersPageModel } from './model';

export const metadata: Metadata = buildPageMetadata({
  title: 'Careers',
  description: 'Careers at Pressly.',
  path: '/careers',
});

export default function CareersPage() {
  const model = getCareersPageModel();

  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
        {model.eyebrow}
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
        {model.title}
      </h1>
      <p className="mt-5 text-lg leading-8 text-muted-foreground">
        {model.description}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href={model.primaryHref}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {model.primaryLabel}
        </a>
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
