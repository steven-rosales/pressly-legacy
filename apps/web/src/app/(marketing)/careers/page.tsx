import Link from 'next/link';
import type { Metadata } from 'next';

import { CONTACT } from '@/app/(marketing)/shared/marketing/content';
import { buildPageMetadata } from '@/app/(marketing)/shared/marketing/seo';
import { PublicSiteShell } from '@/app/(marketing)/shared/ui/public/PublicSiteShell';

export const metadata: Metadata = buildPageMetadata({
  title: 'Careers',
  description: 'Careers at Pressly.',
  path: '/careers',
});

export default function CareersPage() {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Careers
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Help build Pressly.
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          We are not listing open roles on the website yet. If you are
          interested in future operations, customer care, or local service
          roles, send a short note and we will keep it on file.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={`mailto:${CONTACT.email}?subject=Careers at Pressly`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Email Pressly
          </a>
          <Link
            href="/about"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-6 text-base font-medium transition hover:bg-accent"
          >
            About Pressly
          </Link>
        </div>
      </section>
    </PublicSiteShell>
  );
}
