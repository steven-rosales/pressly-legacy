import type { ReactNode } from 'react';

import { PublicSiteShell } from './PublicSiteShell';

type LegalDocumentPageProps = {
  title: string;
  updatedLabel: string;
  children: ReactNode;
};

export function LegalDocumentPage({
  title,
  updatedLabel,
  children,
}: LegalDocumentPageProps) {
  return (
    <PublicSiteShell>
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
        <h1 className="mb-8 text-3xl font-bold">{title}</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Last updated: {updatedLabel}
        </p>

        <div className="space-y-8">{children}</div>
      </section>
    </PublicSiteShell>
  );
}
