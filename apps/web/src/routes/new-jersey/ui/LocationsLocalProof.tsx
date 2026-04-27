import Link from 'next/link';

import PrimaryButton from '@/routes/shared/components/PrimaryButton';
import { DELIVERY_FEE_SHORT_COPY, OFFER_COPY } from '@/lib/content';

import type { LocalProof } from '../content/local-proof';

type LocationsLocalProofProps = {
  proof: LocalProof;
};

export function LocationsLocalProof({ proof }: LocationsLocalProofProps) {
  return (
    <section className="bg-muted/40 py-16 lg:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Local pickup details
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {proof.serviceLabel.charAt(0).toUpperCase() + proof.serviceLabel.slice(1)} in {proof.cityName}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Pressly serves {proof.cityName} with transparent pricing, a{' '}
            {DELIVERY_FEE_SHORT_COPY}, and a single online ordering flow for
            laundry and dry cleaning.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {proof.notes.map((note) => (
              <div key={note} className="rounded-lg border bg-background p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {note}
                </p>
              </div>
            ))}
          </div>

          {proof.neighborhoods.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-lg font-semibold">
                Neighborhoods and local areas
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {proof.neighborhoods.map((neighborhood) => (
                  <span
                    key={neighborhood}
                    className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground"
                  >
                    {neighborhood}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={proof.siblingServiceLink.href}
              className="rounded-md border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
            >
              {proof.siblingServiceLink.label}
            </Link>
            <Link
              href={proof.pricingLink.href}
              className="rounded-md border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
            >
              {proof.pricingLink.label}
            </Link>
            <Link
              href={proof.countyLink.href}
              className="rounded-md border bg-background px-4 py-2 text-sm font-semibold transition hover:bg-accent"
            >
              {proof.countyLink.label}
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-5">
          <h3 className="text-xl font-semibold">Common local questions</h3>
          <div className="mt-5 space-y-5">
            {proof.faqs.map((faq) => (
              <article key={faq.question}>
                <h4 className="text-base font-semibold">{faq.question}</h4>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>

          {proof.nearbyLinks.length > 0 ? (
            <div className="mt-6 border-t pt-5">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Nearby service areas
              </h4>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
                {proof.nearbyLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-3 text-center lg:col-span-2">
          <PrimaryButton href="/schedule" className="w-full sm:w-auto">
            Schedule a Pickup
          </PrimaryButton>
          <p className="text-center text-base font-medium text-primary">
            {OFFER_COPY}
          </p>
        </div>
      </div>
    </section>
  );
}
